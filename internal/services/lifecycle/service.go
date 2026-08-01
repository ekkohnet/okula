package lifecycle

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/ekkohnet/okula/internal/services/catalog"
	"github.com/ekkohnet/okula/internal/services/settings"
	"github.com/ekkohnet/okula/internal/services/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ServiceArgs struct {
	Log      *slog.Logger
	Store    *store.Service
	Catalog  *catalog.Service
	Settings *settings.Service
}

type Service struct {
	log      *slog.Logger
	store    *store.Service
	catalog  *catalog.Service
	settings *settings.Service
}

func NewService(opts ServiceArgs) *Service {
	return &Service{
		log:      opts.Log,
		store:    opts.Store,
		catalog:  opts.Catalog,
		settings: opts.Settings,
	}
}

func (s *Service) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	if s.store.IsFirstRun {

		// Apply defaults for settings service
		if s.settings != nil {
			if err := s.settings.EnsureDefaults(ctx); err != nil {
				return fmt.Errorf("failed to apply settings defaults: %w", err)
			}
			s.log.Info("applied settings service defaults")
		}

		// Mark first run as complete
		if s.store != nil {
			if err := s.store.CompleteFirstRun(ctx); err != nil {
				return fmt.Errorf("failed to complete first run: %w", err)
			}
			s.log.Info("first run complete")
		}
	}

	s.log.Info("lifecycle service started")
	return nil
}
