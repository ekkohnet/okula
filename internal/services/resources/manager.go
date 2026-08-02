package resources

import (
	"context"
	"sync"
	"time"

	"github.com/ekkohnet/okula/internal/coalesce"
	"github.com/ekkohnet/okula/internal/services/cluster"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"
)

const (
	// resourcesDebounce coalesces informer events into one dirty-signal;
	// objects arrive in a burst during the initial cache sync.
	resourcesDebounce = 250 * time.Millisecond

	// lingerDuration keeps an unsubscribed informer warm so returning to a
	// recently visited view feels instant.
	lingerDuration = 2 * time.Minute

	lastAppliedAnnotation = "kubectl.kubernetes.io/last-applied-configuration"
)

// watcher is the per-resource-type informer state: the projected rows, the
// subscriber count, and the running informer (nil while disconnected).
type watcher struct {
	def    Definition
	refs   int
	linger *time.Timer

	cancel context.CancelFunc // stops the informer; nil when not running
	notify func()

	rowsMu sync.Mutex
	rows   map[string]map[string]any // projected rows keyed by object UID
}

func (w *watcher) upsert(obj any, log func(err error)) {
	u, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return
	}

	row, err := w.def.ProjectRow(u)
	if err != nil {
		log(err)
		return
	}

	w.rowsMu.Lock()
	w.rows[string(u.GetUID())] = row
	w.rowsMu.Unlock()
}

func (w *watcher) remove(obj any) {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tombstone.Obj
	}
	u, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return
	}

	w.rowsMu.Lock()
	delete(w.rows, string(u.GetUID()))
	w.rowsMu.Unlock()
}

func (w *watcher) clearRows() {
	w.rowsMu.Lock()
	w.rows = make(map[string]map[string]any)
	w.rowsMu.Unlock()
}

func (w *watcher) snapshotRows() []map[string]any {
	w.rowsMu.Lock()
	defer w.rowsMu.Unlock()

	rows := make([]map[string]any, 0, len(w.rows))
	for _, row := range w.rows {
		rows = append(rows, row)
	}
	return rows
}

// handleConnectionChanged rebuilds informers when the active cluster changes.
// Subscriptions (refs) survive the switch — an open view refills with the new
// cluster's rows. Lingering caches belong to the old cluster and are dropped.
func (svc *Service) handleConnectionChanged(handle *cluster.ConnectionHandle) {
	svc.mu.Lock()

	if svc.connCancel != nil {
		svc.connCancel()
		svc.connCancel = nil
	}
	svc.conn = handle
	if handle != nil {
		svc.connCtx, svc.connCancel = context.WithCancel(svc.appCtx)
	}

	var affected []string
	for key, w := range svc.watchers {
		w.cancel = nil // informer stopped via connCancel above
		w.clearRows()
		affected = append(affected, key)

		if w.refs <= 0 {
			if w.linger != nil {
				w.linger.Stop()
			}
			delete(svc.watchers, key)
			continue
		}
		if handle != nil {
			svc.startInformerLocked(w)
		}
	}
	svc.mu.Unlock()

	for _, key := range affected {
		svc.emitResourceUpdated(key)
	}
}

// startInformerLocked starts the informer for a watcher on the current
// connection. Callers must hold svc.mu, and svc.conn must be non-nil.
func (svc *Service) startInformerLocked(w *watcher) {
	ctx, cancel := context.WithCancel(svc.connCtx)
	w.cancel = cancel

	key := w.def.Key
	generic := dynamicinformer.NewFilteredDynamicInformer(
		svc.conn.Dynamic, w.def.GVR, metav1.NamespaceAll, 0, cache.Indexers{}, nil,
	)
	informer := generic.Informer()

	// Strip fields nothing reads before they enter the cache; managedFields
	// alone is often a third of an object's bytes.
	if err := informer.SetTransform(func(obj any) (any, error) {
		u, ok := obj.(*unstructured.Unstructured)
		if !ok {
			return obj, nil
		}
		stripCachedObject(u)
		if w.def.TransformCache != nil {
			w.def.TransformCache(u)
		}
		return u, nil
	}); err != nil {
		svc.log.Error("failed to set resource transform", "resource", key, "error", err)
	}
	if err := informer.SetWatchErrorHandler(func(_ *cache.Reflector, err error) {
		svc.log.Warn("resource watch error", "resource", key, "error", err)
	}); err != nil {
		svc.log.Error("failed to set resource watch error handler", "resource", key, "error", err)
	}

	w.notify = coalesce.New(ctx, resourcesDebounce, func() { svc.emitResourceUpdated(key) })

	logProjectErr := func(err error) {
		svc.log.Warn("failed to project resource row", "resource", key, "error", err)
	}
	if _, err := informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj any) { w.upsert(obj, logProjectErr); w.notify() },
		UpdateFunc: func(_, obj any) { w.upsert(obj, logProjectErr); w.notify() },
		DeleteFunc: func(obj any) { w.remove(obj); w.notify() },
	}); err != nil {
		svc.log.Error("failed to add resource event handler", "resource", key, "error", err)
		return
	}

	go informer.Run(ctx.Done())

	// Guarantee a signal once the initial sync lands, even if the trailing
	// debounce was reset by a slow trickle of events.
	go func() {
		if cache.WaitForCacheSync(ctx.Done(), informer.HasSynced) {
			w.notify()
		}
	}()

	svc.log.Info("resource informer started", "resource", key)
}

// expire stops a watcher whose linger window passed with no new subscribers.
func (svc *Service) expire(key string) {
	svc.mu.Lock()
	w := svc.watchers[key]
	if w == nil || w.refs > 0 {
		svc.mu.Unlock()
		return
	}
	if w.cancel != nil {
		w.cancel()
	}
	delete(svc.watchers, key)
	svc.mu.Unlock()

	svc.log.Info("resource informer expired", "resource", key)
}

// stripCachedObject drops fields nothing in Okula reads from every object
// before it enters an informer cache.
func stripCachedObject(u *unstructured.Unstructured) {
	u.SetManagedFields(nil)
	annotations := u.GetAnnotations()
	if _, ok := annotations[lastAppliedAnnotation]; ok {
		delete(annotations, lastAppliedAnnotation)
		u.SetAnnotations(annotations)
	}
}
