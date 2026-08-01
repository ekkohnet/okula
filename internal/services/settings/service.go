package settings

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

type Service struct {
	log   *slog.Logger
	store *store.Service

	theme    *Theme
	timezone *Timezone
}

func NewService(opts ServiceArgs) *Service {
	return &Service{
		log:   opts.Log,
		store: opts.Store,

		theme:    &Theme{opts.Log, opts.Store},
		timezone: &Timezone{opts.Log, opts.Store},
	}
}

func (s *Service) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	s.log.Info("settings service started")
	return nil
}

func (s *Service) ServiceShutdown() error {
	s.log.Info("settings service stopped")
	return nil
}

//wails:ignore
func (s *Service) EnsureDefaults(ctx context.Context) error {
	if err := s.timezone.setDefault(ctx); err != nil {
		return fmt.Errorf("settings defaults: set default timezone: %w", err)
	}

	s.log.Info("applied settings service defaults")
	return nil
}
