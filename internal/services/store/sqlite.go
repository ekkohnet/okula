package store

import (
	"database/sql"
	"fmt"
	"path/filepath"

	_ "github.com/ncruces/go-sqlite3/driver"
)

func (s *Service) openDB() (*sql.DB, error) {
	// if err := sqlite3.Initialize(); err != nil {
	// 	return nil, fmt.Errorf("sqlite3 initialize: %w", err)
	// }

	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s", filepath.Join(s.path, s.dbName)))
	if err != nil {
		return nil, fmt.Errorf("sqlite3 open: %w", err)
	}

	return db, nil
}
