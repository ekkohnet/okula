package resources

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/ekkohnet/okula/internal/coalesce"
	"github.com/ekkohnet/okula/internal/services/cluster"

	"github.com/wailsapp/wails/v3/pkg/application"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

const (
	// objectWatchDebounce folds bursts of watch events into one push. A
	// single object's updates are naturally sparse; this mostly guards
	// status thrash during crash loops.
	objectWatchDebounce = 250 * time.Millisecond

	// Reconnect pacing for the watch loop: the minimum also spaces routine
	// re-establishes (the apiserver closes watches periodically), doubling
	// toward the cap while the watch keeps failing without delivering.
	objectWatchBackoffMin = time.Second
	objectWatchBackoffMax = 30 * time.Second
)

// objectSession is one detail page's live-object state. Pushes coalesce
// through pending/notify; last supports emitting a deletion the watch
// itself missed (nil once a deletion has been emitted). The events side
// (objectevents.go) follows the object's current UID, restarting on a
// recreation.
type objectSession struct {
	id        string
	def       Definition
	namespace string
	name      string
	conn      *cluster.ConnectionHandle
	cancel    context.CancelFunc

	mu      sync.Mutex
	pending *ObjectDetail
	last    *ObjectDetail
	lastRV  string
	notify  func()

	eventsUID     string
	eventsCancel  context.CancelFunc
	eventsPending *ObjectEventsPayload
	eventsNotify  func()
}

// push stages an update; the coalesced notify emits the latest staged value.
func (sess *objectSession) push(detail ObjectDetail, rv string) {
	sess.mu.Lock()
	sess.pending = &detail
	sess.last = &detail
	sess.lastRV = rv
	sess.mu.Unlock()
	sess.notify()
}

// WatchResourceObject fetches an object's current state (the same payload as
// GetResourceObject) and starts a session that keeps it fresh: a dedicated
// per-object watch pushes ResourceObjectUpdated:{id} (full ObjectDetail) and
// ResourceObjectDeleted:{id} (final state) events, and an events watch keyed
// by the object's UID pushes ResourceObjectEvents:{id} (the full projected
// list), until UnwatchResourceObject or a cluster switch ends the session.
// The caller supplies the session id and must register its event handlers
// before calling — pushes begin the moment the session exists, and the first
// events push is what resolves that section's loading state.
// An absent object is a state, not an error: the zero ObjectDetail comes
// back and the session watches the name, so a later creation arrives as an
// ordinary update push.
// Deliberately never the informer caches — those are stripped/partial by
// design and can never back a detail view.
func (svc *Service) WatchResourceObject(ctx context.Context, key, namespace, name, watchId string) (ObjectDetail, error) {
	def, ok := definitionFor(key)
	if !ok {
		return ObjectDetail{}, fmt.Errorf("unknown resource %q", key)
	}
	if watchId == "" {
		return ObjectDetail{}, fmt.Errorf("empty watch id")
	}

	svc.mu.Lock()
	conn := svc.conn
	connCtx := svc.connCtx
	svc.mu.Unlock()
	if conn == nil {
		return ObjectDetail{}, fmt.Errorf("no active cluster connection")
	}

	ref := objectRef(def, namespace, name)
	ri := resourceInterface(conn, def, namespace)

	// Initial state via a field-selected LIST rather than a GET: same
	// freshness, and the list's resourceVersion is the exact point the
	// watch resumes from — every push provably moves forward from the
	// state this call returned. The list also yields a usable version
	// when the object is absent, which a GET could not.
	obj, rv, err := listObject(ctx, ri, name)
	if err != nil {
		return ObjectDetail{}, fmt.Errorf("get %s %s: %w", key, ref, err)
	}

	var detail ObjectDetail
	var last *ObjectDetail
	var lastRV string
	if obj != nil {
		detail, err = projectDetail(def, obj)
		if err != nil {
			return ObjectDetail{}, fmt.Errorf("%s %s: %w", key, ref, err)
		}
		last = &detail
		lastRV = obj.GetResourceVersion()
	}

	svc.mu.Lock()
	if _, exists := svc.objectSessions[watchId]; exists {
		svc.mu.Unlock()
		return ObjectDetail{}, fmt.Errorf("watch id %q already in use", watchId)
	}
	sessCtx, cancel := context.WithCancel(connCtx)
	sess := &objectSession{
		id:        watchId,
		def:       def,
		namespace: namespace,
		name:      name,
		conn:      conn,
		cancel:    cancel,
		last:      last,
		lastRV:    lastRV,
	}
	sess.notify = coalesce.New(sessCtx, objectWatchDebounce, func() { svc.emitObjectUpdated(sess) })
	sess.eventsNotify = coalesce.New(sessCtx, objectWatchDebounce, func() { svc.emitObjectEvents(sess) })
	svc.objectSessions[watchId] = sess
	svc.mu.Unlock()

	go svc.runObjectSession(sessCtx, ri, sess, rv)
	svc.ensureObjectEvents(sessCtx, sess, detail.UID)

	svc.log.Info("object watch started",
		"resource", key, "object", ref, "session", watchId)
	return detail, nil
}

// UnwatchResourceObject ends an object watch session. Harmless for a session
// already ended by a cluster switch.
func (svc *Service) UnwatchResourceObject(ctx context.Context, id string) error {
	svc.mu.Lock()
	sess := svc.objectSessions[id]
	svc.mu.Unlock()

	if sess != nil {
		sess.cancel()
	}
	return nil
}

// runObjectSession keeps the object fresh until the session context ends (an
// unwatch, or the connection change that cancels every session): watch from
// the last delivered resourceVersion, push updates, and after any watch
// failure re-list to resync across the gap before watching again.
func (svc *Service) runObjectSession(ctx context.Context, ri dynamic.ResourceInterface, sess *objectSession, rv string) {
	defer func() {
		svc.mu.Lock()
		delete(svc.objectSessions, sess.id)
		svc.mu.Unlock()
		sess.cancel()
		svc.log.Info("object watch ended", "resource", sess.def.Key, "session", sess.id)
	}()

	backoff := objectWatchBackoffMin
	for {
		w, err := ri.Watch(ctx, metav1.ListOptions{
			FieldSelector:       "metadata.name=" + sess.name,
			ResourceVersion:     rv,
			AllowWatchBookmarks: true,
		})
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			// Covers 410 (version compacted) and transient failures alike:
			// the re-list refreshes both the state and the version.
			svc.log.Warn("object watch failed, resyncing",
				"resource", sess.def.Key, "session", sess.id, "error", err)
			if next, ok := svc.resyncObject(ctx, ri, sess); ok {
				rv = next
			}
		} else {
			rv = svc.consumeObjectWatch(ctx, w, sess, rv, &backoff)
			w.Stop()
			if ctx.Err() != nil {
				return
			}
		}

		// Pace every re-establish; delivering resets backoff below, so a
		// healthy long-lived watch reconnects near-instantly while a
		// failing one walks toward the cap.
		if !sleepCtx(ctx, backoff) {
			return
		}
		backoff = min(backoff*2, objectWatchBackoffMax)
	}
}

// consumeObjectWatch pumps one watch connection, returning the version to
// resume from. Any delivery resets the backoff — only silent failures pace up.
func (svc *Service) consumeObjectWatch(ctx context.Context, w watch.Interface, sess *objectSession, rv string, backoff *time.Duration) string {
	for ev := range w.ResultChan() {
		switch ev.Type {
		case watch.Added, watch.Modified:
			u, ok := ev.Object.(*unstructured.Unstructured)
			if !ok {
				continue
			}
			rv = u.GetResourceVersion()
			*backoff = objectWatchBackoffMin
			detail, err := projectDetail(sess.def, u)
			if err != nil {
				svc.log.Warn("failed to project watched object",
					"resource", sess.def.Key, "session", sess.id, "error", err)
				continue
			}
			sess.push(detail, rv)
			// A recreation changes identity; the events watch follows it.
			svc.ensureObjectEvents(ctx, sess, detail.UID)

		case watch.Deleted:
			u, ok := ev.Object.(*unstructured.Unstructured)
			if !ok {
				continue
			}
			rv = u.GetResourceVersion()
			*backoff = objectWatchBackoffMin
			// The DELETED event carries the final state; the name watch
			// stays open so a recreation arrives as a fresh ADDED.
			detail, err := projectDetail(sess.def, u)
			if err != nil {
				svc.log.Warn("failed to project deleted object",
					"resource", sess.def.Key, "session", sess.id, "error", err)
				continue
			}
			svc.emitObjectDeleted(sess, detail)

		case watch.Bookmark:
			if u, ok := ev.Object.(*unstructured.Unstructured); ok {
				rv = u.GetResourceVersion()
				*backoff = objectWatchBackoffMin
			}

		case watch.Error:
			// A canceled session surfaces as a decode-failure error event
			// before the channel closes; only a live session's error is
			// worth noting.
			if ctx.Err() == nil {
				svc.log.Warn("object watch error event",
					"resource", sess.def.Key, "session", sess.id,
					"error", apierrors.FromObject(ev.Object))
			}
			return rv
		}
	}
	return rv
}

// resyncObject re-lists the object after a watch gap, emitting whatever
// changed across it (including a missed deletion), and returns the version
// to watch from.
func (svc *Service) resyncObject(ctx context.Context, ri dynamic.ResourceInterface, sess *objectSession) (string, bool) {
	obj, rv, err := listObject(ctx, ri, sess.name)
	if err != nil {
		if ctx.Err() == nil {
			svc.log.Warn("object resync failed",
				"resource", sess.def.Key, "session", sess.id, "error", err)
		}
		return "", false
	}

	if obj == nil {
		sess.mu.Lock()
		last := sess.last
		sess.mu.Unlock()
		if last != nil {
			// Deleted while the watch was down; the last pushed state is
			// the best final state available.
			svc.emitObjectDeleted(sess, *last)
		}
		return rv, true
	}

	sess.mu.Lock()
	unchanged := sess.last != nil && sess.lastRV == obj.GetResourceVersion()
	sess.mu.Unlock()
	if !unchanged {
		detail, err := projectDetail(sess.def, obj)
		if err != nil {
			svc.log.Warn("failed to project resynced object",
				"resource", sess.def.Key, "session", sess.id, "error", err)
		} else {
			sess.push(detail, obj.GetResourceVersion())
			svc.ensureObjectEvents(ctx, sess, detail.UID)
		}
	}
	return rv, true
}

// listObject fetches an object's current state via a field-selected LIST:
// the item or nil, plus the collection resourceVersion a watch can start
// from even when the object is absent.
func listObject(ctx context.Context, ri dynamic.ResourceInterface, name string) (*unstructured.Unstructured, string, error) {
	ctx, cancel := context.WithTimeout(ctx, getObjectTimeout)
	defer cancel()

	list, err := ri.List(ctx, metav1.ListOptions{FieldSelector: "metadata.name=" + name})
	if err != nil {
		return nil, "", err
	}
	if len(list.Items) == 0 {
		return nil, list.GetResourceVersion(), nil
	}
	return &list.Items[0], list.GetResourceVersion(), nil
}

func (svc *Service) emitObjectUpdated(sess *objectSession) {
	sess.mu.Lock()
	detail := sess.pending
	sess.pending = nil
	sess.mu.Unlock()

	if detail == nil {
		return
	}
	application.Get().Event.Emit("ResourceObjectUpdated:"+sess.id, *detail)
}

// emitObjectDeleted bypasses the debounce (deletions are singular and the
// page should react promptly) and drops any staged update it supersedes.
func (svc *Service) emitObjectDeleted(sess *objectSession, final ObjectDetail) {
	sess.mu.Lock()
	sess.pending = nil
	sess.last = nil
	sess.mu.Unlock()

	application.Get().Event.Emit("ResourceObjectDeleted:"+sess.id, final)
}

// sleepCtx sleeps for d, returning false if ctx ended first.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
