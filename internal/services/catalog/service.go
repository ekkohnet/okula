package catalog

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/ekkohnet/okula/internal/services/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ServiceArgs struct {
	Log   *slog.Logger
	Store *store.Service
}

// Service is the Wails service for catalog lifecycle and sync.
type Service struct {
	log       *slog.Logger
	catalog   *Catalog
	watchlist *Watchlist
}

func NewService(args ServiceArgs) *Service {
	catalog := newCatalog(args.Log, args.Store)
	watchlist := newWatchlist(args.Log, args.Store, catalog)

	return &Service{
		log:       args.Log,
		catalog:   catalog,
		watchlist: watchlist,
	}
}

// --- Wails Service Lifecycle ---

func (svc *Service) ServiceStartup(ctx context.Context, opts application.ServiceOptions) error {
	svc.catalog.appCtx = ctx
	svc.watchlist.appCtx = ctx

	if err := svc.watchlist.ensureDefaultsIfFirstRun(); err != nil {
		return fmt.Errorf("failed to ensure watchlist defaults: %w", err)
	}

	svc.watchlist.startNotifier()
	if err := svc.watchlist.syncWatchlistAndCatalog(); err != nil {
		return fmt.Errorf("failed to sync watchlist and catalog: %w", err)
	}

	svc.log.Info("catalog service started")
	return nil
}

func (svc *Service) ServiceShutdown() error {
	svc.watchlist.stopNotifier()

	svc.log.Info("catalog service stopped")
	return nil
}

// --- Queries & Commands ---

//wails:ignore
func (svc *Service) GetCatalogEntryModels(ctx context.Context) ([]CatalogEntryModel, error) {
	return svc.catalog.getEntries(ctx)
}

//wails:ignore
func (svc *Service) GetCatalogEntryModel(ctx context.Context, id string) (CatalogEntryModel, error) {
	return svc.catalog.getEntry(ctx, id)
}

// GetCatalogEntries returns catalog entries as DTOs suitable for the frontend.
func (svc *Service) GetCatalogEntries(ctx context.Context) ([]CatalogEntry, error) {
	models, err := svc.catalog.getEntries(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]CatalogEntry, 0, len(models))
	for _, m := range models {
		result = append(result, CatalogEntryToDTO(m))
	}

	return result, nil
}
