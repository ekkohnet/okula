package cluster

import (
	"context"
	"time"

	"github.com/ekkohnet/okula/internal/coalesce"

	"k8s.io/client-go/informers"
	"k8s.io/client-go/tools/cache"
)

// namespacesDebounce coalesces informer events; namespaces arrive in a burst
// during the initial cache sync.
const namespacesDebounce = 250 * time.Millisecond

// startNamespaceInformer watches namespaces for the connection and emits
// NamespacesUpdated on changes. The namespace picker lives in the shell, so
// this is deliberately always-on with the connection rather than using the
// (future) subscription-based informer machinery for resource views.
func (svc *Service) startNamespaceInformer(ctx context.Context, conn *connection) {
	factory := informers.NewSharedInformerFactory(conn.clientset, 0)
	informer := factory.Core().V1().Namespaces().Informer()
	conn.namespaces = factory.Core().V1().Namespaces().Lister()

	// The reflector retries with backoff internally; route its errors to our
	// log instead of klog's stderr output.
	if err := informer.SetWatchErrorHandler(func(_ *cache.Reflector, err error) {
		svc.log.Warn("namespace watch error", "id", conn.entryID, "error", err)
	}); err != nil {
		svc.log.Error("failed to set namespace watch error handler", "id", conn.entryID, "error", err)
	}

	notify := coalesce.New(ctx, namespacesDebounce, svc.emitNamespacesUpdated)

	// Updates don't change the name set, so only adds and deletes notify.
	if _, err := informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(any) { notify() },
		DeleteFunc: func(any) { notify() },
	}); err != nil {
		svc.log.Error("failed to add namespace event handler", "id", conn.entryID, "error", err)
		return
	}

	factory.Start(ctx.Done())
	svc.log.Info("namespace informer started", "id", conn.entryID)
}
