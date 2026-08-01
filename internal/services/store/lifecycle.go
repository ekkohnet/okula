package store

import (
	"context"
	"fmt"
)

//wails:ignore
func (s *Service) CompleteFirstRun(ctx context.Context) error {
	if err := s.Queries.CompleteFirstRun(ctx); err != nil {
		return fmt.Errorf("failed to update first run status: %w", err)
	}

	s.IsFirstRun = false

	s.log.Info("completed first run setup")
	return nil
}
