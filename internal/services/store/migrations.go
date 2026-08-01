package store

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

//go:embed _migrations/*.sql
var migrationFS embed.FS

type migration struct {
	id       int
	filename string
	checksum string
	content  string
}

func (s *Service) runMigrations() error {
	if err := s.ensureMigrationsTable(); err != nil {
		return err
	}

	applied, err := s.getAppliedMigrations()
	if err != nil {
		return fmt.Errorf("failed to get applied migrations: %w", err)
	}
	for _, m := range applied {
		if err := s.verifyMigration(m); err != nil {
			return fmt.Errorf("failed to verify applied migration: %q: %w", m.filename, err)
		}
	}

	pending, err := s.getPendingMigrations(applied)
	if err != nil {
		return fmt.Errorf("failed to get pending migrations: %w", err)
	}
	for _, m := range pending {
		if err := s.applyMigration(m); err != nil {
			return fmt.Errorf("failed to apply migration: %q: %w", m.filename, err)
		}
	}

	return nil
}

func (s *Service) ensureMigrationsTable() error {
	_, err := s.DB.Exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            ref INTEGER PRIMARY KEY,
            filename TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `)
	if err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	return nil
}

func (s *Service) getAppliedMigrations() (map[string]migration, error) {
	rows, err := s.DB.Query("SELECT ref, filename, checksum FROM migrations")
	if err != nil {
		return nil, fmt.Errorf("failed to query applied migrations: %w", err)
	}
	defer rows.Close()

	result := make(map[string]migration)
	for rows.Next() {
		var m migration
		if err := rows.Scan(&m.id, &m.filename, &m.checksum); err != nil {
			return nil, fmt.Errorf("failed to scan migration row: %w", err)
		}
		result[m.filename] = m
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating over migration rows: %w", err)
	}

	return result, nil
}

func (s *Service) getPendingMigrations(applied map[string]migration) ([]migration, error) {
	entries, err := fs.Glob(migrationFS, "_migrations/*.sql")
	if err != nil {
		return nil, fmt.Errorf("failed to read embedded migrations: %w", err)
	}

	var migrations []migration
	seen := make(map[int]string)

	for _, path := range entries {
		filename := filepath.Base(path)
		m, err := loadMigration(filename)
		if err != nil {
			s.log.Warn("skipping invalid migration", "filename", filename, "error", err)
			continue
		}

		if _, already := applied[m.filename]; already {
			s.log.Info("skipping already applied migration", "filename", filename)
			continue
		}
		if existing, exists := seen[m.id]; exists {
			return nil, fmt.Errorf("duplicate migration ID %d: existing file %q conflicts with new file %q", m.id, existing, filename)
		}
		seen[m.id] = m.filename

		migrations = append(migrations, m)
	}

	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].id < migrations[j].id
	})

	return migrations, nil
}

func loadMigration(filename string) (migration, error) {
	contentBytes, err := migrationFS.ReadFile(filepath.Join("_migrations", filename))
	if err != nil {
		return migration{}, fmt.Errorf("failed to read migration file: %s: %w", filename, err)
	}

	id, err := extractID(filename)
	if err != nil {
		return migration{}, fmt.Errorf("failed to extract ref from filename: %s: %w", filename, err)
	}

	sum := sha256.Sum256(contentBytes)

	return migration{
		id:       id,
		filename: filename,
		checksum: hex.EncodeToString(sum[:]),
		content:  string(contentBytes),
	}, nil
}

func extractID(filename string) (int, error) {
	parts := strings.SplitN(filename, "_", 2)
	return strconv.Atoi(parts[0])
}

func (s *Service) verifyMigration(m migration) error {
	embedded, err := loadMigration(m.filename)
	if err != nil {
		return fmt.Errorf("failed to load migration: %q: %w", m.filename, err)
	}

	if m.checksum != embedded.checksum {
		return fmt.Errorf("checksum mismatch for applied migration: %q", m.filename)
	}

	return nil
}

func (s *Service) applyMigration(m migration) (err error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if err != nil {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				s.log.Error("failed to rollback transaction", "error", rollbackErr)
			}
		}
	}()

	if _, err = tx.Exec(m.content); err != nil {
		return fmt.Errorf("failed to apply migration: %q: %w", m.filename, err)
	}

	if _, err = tx.Exec(
		"INSERT INTO migrations (ref, filename, checksum) VALUES (?, ?, ?)",
		m.id, m.filename, m.checksum,
	); err != nil {
		return fmt.Errorf("failed to insert migration record: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	s.log.Info("applied migration", "id", m.id, "filename", m.filename)

	return nil
}
