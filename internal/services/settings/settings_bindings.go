// settings_bindings.go
// Wails-exposed methods on *Service that are bound to the frontend.

package settings

import (
	"context"
	"fmt"
)

func (s *Service) GetSettings(ctx context.Context) (Settings, error) {
	data, err := s.store.Queries.GetSettings(ctx)
	if err != nil {
		s.log.Error("failed to get settings", "error", err)
		return Settings{}, fmt.Errorf("failed to get settings: %w", err)
	}

	return fromStoreSettings(data), nil
}
