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

	mu       sync.RWMutex
	clusters map[string]*ClusterInstanceModel
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
	svc.mu.Lock()
	if svc.clusters == nil {
		svc.clusters = make(map[string]*ClusterInstanceModel)
	}
	svc.mu.Unlock()

	// TEMP
	application.Get().Event.On("CatalogUpdated", func(e *application.CustomEvent) {
		svc.emitClustersUpdated()
	})

	svc.log.Info("cluster service started")
	return nil
}

func (svc *Service) ServiceShutdown() error {
	//
	svc.log.Info("cluster service stopped")
	return nil
}
