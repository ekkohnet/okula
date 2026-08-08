package resources

import (
	"context"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
)

// The events side of an object watch session: a second watch, keyed by the
// object's UID, keeps the detail page's events fresh. Same
// list+watch+resync shape as the object loop. Every push carries the full
// projected list — object event sets are small, and wholesale replacement
// keeps the frontend trivial.

// ObjectEventsPayload is the ResourceObjectEvents push: the full projected
// list, or the error that kept the first list from landing. It crosses
// only as an event payload, so no binding is generated for it — the
// frontend declares the shape by hand.
type ObjectEventsPayload struct {
	Events []ObjectEvent `json:"events"`
	Error  string        `json:"error,omitempty"`
}

// ensureObjectEvents keeps the events watch keyed to the object's current
// UID: a no-op while identity holds, a restart when a recreation changes it.
func (svc *Service) ensureObjectEvents(ctx context.Context, sess *objectSession, uid string) {
	sess.mu.Lock()
	if sess.eventsUID == uid {
		sess.mu.Unlock()
		return
	}
	sess.eventsUID = uid
	if sess.eventsCancel != nil {
		sess.eventsCancel()
	}
	evCtx, cancel := context.WithCancel(ctx)
	sess.eventsCancel = cancel
	sess.eventsPending = nil
	sess.mu.Unlock()

	go svc.runObjectEvents(evCtx, sess, uid)
}

// runObjectEvents lists and watches one UID's events until its context ends
// (unwatch, cluster switch, or a recreation superseding the UID).
func (svc *Service) runObjectEvents(ctx context.Context, sess *objectSession, uid string) {
	// Cluster-scoped objects' events can land in any namespace.
	ns := ""
	if sess.def.Namespaced {
		ns = sess.namespace
	}
	selector := "involvedObject.uid=" + uid
	events := sess.conn.Clientset.CoreV1().Events(ns)

	byKey := make(map[string]ObjectEvent)
	rv := ""
	synced := false
	backoff := objectWatchBackoffMin

	for ctx.Err() == nil {
		if !synced {
			listCtx, cancel := context.WithTimeout(ctx, getEventsTimeout)
			list, err := events.List(listCtx, metav1.ListOptions{FieldSelector: selector})
			cancel()
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				svc.log.Warn("object events list failed",
					"resource", sess.def.Key, "session", sess.id, "error", err)
				// Only a never-synced failure surfaces: the section must
				// resolve rather than sit loading. Gaps after a sync retry
				// quietly behind the stale list.
				if rv == "" {
					svc.pushObjectEvents(sess, uid,
						ObjectEventsPayload{Events: []ObjectEvent{}, Error: err.Error()}, true)
				}
				if !sleepCtx(ctx, backoff) {
					return
				}
				backoff = min(backoff*2, objectWatchBackoffMax)
				continue
			}
			clear(byKey)
			for i := range list.Items {
				e := &list.Items[i]
				byKey[e.Namespace+"/"+e.Name] = projectEvent(e)
			}
			rv = list.ResourceVersion
			synced = true
			backoff = objectWatchBackoffMin
			// Immediate: a list completion resolves the section's loading
			// state; only in-watch churn debounces.
			svc.pushObjectEvents(sess, uid, eventsPayload(byKey), true)
		}

		w, err := events.Watch(ctx, metav1.ListOptions{
			FieldSelector:       selector,
			ResourceVersion:     rv,
			AllowWatchBookmarks: true,
		})
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			svc.log.Warn("object events watch failed, resyncing",
				"resource", sess.def.Key, "session", sess.id, "error", err)
			synced = false
		} else {
			if !svc.consumeEventsWatch(ctx, w, sess, uid, byKey, &rv, &backoff) {
				synced = false
			}
			w.Stop()
			if ctx.Err() != nil {
				return
			}
		}

		if !sleepCtx(ctx, backoff) {
			return
		}
		backoff = min(backoff*2, objectWatchBackoffMax)
	}
}

// consumeEventsWatch pumps one watch connection, maintaining the projected
// list. Returns false when the watch needs a re-list to recover.
func (svc *Service) consumeEventsWatch(ctx context.Context, w watch.Interface, sess *objectSession, uid string, byKey map[string]ObjectEvent, rv *string, backoff *time.Duration) bool {
	for ev := range w.ResultChan() {
		switch ev.Type {
		case watch.Added, watch.Modified:
			e, ok := ev.Object.(*corev1.Event)
			if !ok {
				continue
			}
			*rv = e.ResourceVersion
			*backoff = objectWatchBackoffMin
			byKey[e.Namespace+"/"+e.Name] = projectEvent(e)
			svc.pushObjectEvents(sess, uid, eventsPayload(byKey), false)

		case watch.Deleted:
			// Clusters GC events after their TTL; drop them like any list
			// refetch would.
			e, ok := ev.Object.(*corev1.Event)
			if !ok {
				continue
			}
			*rv = e.ResourceVersion
			*backoff = objectWatchBackoffMin
			delete(byKey, e.Namespace+"/"+e.Name)
			svc.pushObjectEvents(sess, uid, eventsPayload(byKey), false)

		case watch.Bookmark:
			if e, ok := ev.Object.(*corev1.Event); ok {
				*rv = e.ResourceVersion
				*backoff = objectWatchBackoffMin
			}

		case watch.Error:
			// A canceled session surfaces as a decode-failure error event
			// before the channel closes; only a live session's error is
			// worth noting.
			if ctx.Err() == nil {
				svc.log.Warn("object events watch error event",
					"resource", sess.def.Key, "session", sess.id,
					"error", apierrors.FromObject(ev.Object))
			}
			return false
		}
	}
	return true
}

func eventsPayload(byKey map[string]ObjectEvent) ObjectEventsPayload {
	list := make([]ObjectEvent, 0, len(byKey))
	for _, e := range byKey {
		list = append(list, e)
	}
	sortEventsNewestFirst(list)
	return ObjectEventsPayload{Events: list}
}

// pushObjectEvents stages a payload for the session's current events UID —
// a superseded loop's stragglers are dropped — and emits it immediately or
// through the debounce.
func (svc *Service) pushObjectEvents(sess *objectSession, uid string, payload ObjectEventsPayload, immediate bool) {
	sess.mu.Lock()
	if sess.eventsUID != uid {
		sess.mu.Unlock()
		return
	}
	sess.eventsPending = &payload
	sess.mu.Unlock()

	if immediate {
		svc.emitObjectEvents(sess)
	} else {
		sess.eventsNotify()
	}
}

func (svc *Service) emitObjectEvents(sess *objectSession) {
	sess.mu.Lock()
	payload := sess.eventsPending
	sess.eventsPending = nil
	sess.mu.Unlock()

	if payload == nil {
		return
	}
	application.Get().Event.Emit("ResourceObjectEvents:"+sess.id, *payload)
}
