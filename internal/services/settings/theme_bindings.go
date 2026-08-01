// theme_bindings.go
// Wails-exposed methods on *Service that are bound to the frontend.

package settings

import (
	"context"
)

func (s *Service) GetTheme(ctx context.Context) (string, error) {
	return s.theme.Get(ctx)
}

func (s *Service) GetThemes() []string {
	return s.theme.Themes()
}

func (s *Service) UpdateTheme(ctx context.Context, theme string) error {
	return s.theme.Update(ctx, theme)
}
