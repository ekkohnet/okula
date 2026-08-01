package store

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/ekkohnet/okula/internal/services/store/storedb"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ServiceArgs struct {
	Log    *slog.Logger
	AppDir string
}

type Service struct {
	log    *slog.Logger
	path   string
	dbName string

	DB         *sql.DB
	Queries    *storedb.Queries
	IsFirstRun bool
}

func NewService(opts ServiceArgs) *Service {
	return &Service{
		log:    opts.Log,
		path:   filepath.Join(opts.AppDir, "store"),
		dbName: "okula.db",
	}
}

func (s *Service) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	err := os.Mkdir(s.path, 0700)
	if err != nil && !os.IsExist(err) {
		return fmt.Errorf("create store directory: %w", err)
	}

	db, err := s.openDB()
	if err != nil {
		return fmt.Errorf("open store db: %w", err)
	}
	s.DB = db

	if err := s.runMigrations(); err != nil {
		return fmt.Errorf("run store db migrations: %w", err)
	}

	s.Queries = storedb.New(db)

	firstRun, err := s.Queries.GetFirstRun(ctx)
	if err != nil {
		return fmt.Errorf("get first run: %w", err)
	}
	s.IsFirstRun = firstRun

	s.log.Info("store service started", "firstRun", s.IsFirstRun)
	return nil
}

func (s *Service) ServiceShutdown() error {
	if err := s.DB.Close(); err != nil {
		return fmt.Errorf("close store db: %w", err)
	}

	s.log.Info("store service stopped")
	return nil
}
