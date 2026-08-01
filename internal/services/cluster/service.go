package cluster

import (
	"context"
	"log/slog"
	"sync"

	"github.com/ekkohnet/okula/internal/services/catalog"
	"github.com/ekkohnet/okula/internal/services/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ServiceArgs struct {
	Log     *slog.Logger
	Store   *store.Service
	Catalog *catalog.Service
}

// Service is the Wails service for cluster operations.
type Service struct {
	log     *slog.Logger
	store   *store.Service
	catalog *catalog.Service

	appCtx            context.Context
	offCatalogUpdated func()

	mu       sync.RWMutex
	clusters map[string]*ClusterInstanceModel
	active   *connection
}

func NewService(args ServiceArgs) *Service {
	return &Service{
		log:     args.Log,
		store:   args.Store,
		catalog: args.Catalog,
	}
}

// --- Wails Service Lifecycle ---

func (svc *Service) ServiceStartup(ctx context.Context, opts application.ServiceOptions) error {
	svc.appCtx = ctx

	svc.mu.Lock()
	if svc.clusters == nil {
		svc.clusters = make(map[string]*ClusterInstanceModel)
	}
	svc.mu.Unlock()

	svc.offCatalogUpdated = application.Get().Event.On("CatalogUpdated", func(e *application.CustomEvent) {
		svc.handleCatalogUpdated()
	})

	// Reconnect asynchronously; startup must not block on an unreachable cluster.
	go svc.restoreActive()

	svc.log.Info("cluster service started")
	return nil
}

func (svc *Service) ServiceShutdown() error {
	if svc.offCatalogUpdated != nil {
		svc.offCatalogUpdated()
	}

	// Tear down without clearing the persisted active cluster id, so the
	// connection is restored on next launch.
	svc.mu.Lock()
	svc.teardownLocked()
	svc.mu.Unlock()

	svc.log.Info("cluster service stopped")
	return nil
}

// handleCatalogUpdated reacts to catalog changes: if the active entry has
// disappeared or gone hidden, disconnect; either way the cluster list changed.
func (svc *Service) handleCatalogUpdated() {
	svc.mu.RLock()
	var activeID string
	if svc.active != nil {
		activeID = svc.active.entryID
	}
	svc.mu.RUnlock()

	if activeID != "" {
		entry, err := svc.catalog.GetCatalogEntryModel(svc.appCtx, activeID)
		if err != nil || entry.Hidden {
			svc.log.Info("active cluster no longer in catalog; disconnecting", "id", activeID)
			svc.clearActive(true)
			return // clearActive already emitted ClustersUpdated
		}
	}

	svc.emitClustersUpdated()
}
