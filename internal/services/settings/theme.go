package settings

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/ekkohnet/okula/internal/services/store"
)

var themeOrder = []string{"System", "Light", "Dark"}

var allowedThemes = func() map[string]struct{} {
	themes := make(map[string]struct{}, len(themeOrder))
	for _, t := range themeOrder {
		themes[t] = struct{}{}
	}
	return themes
}()

type Theme struct {
	log   *slog.Logger
	store *store.Service
}

func (t *Theme) Get(ctx context.Context) (string, error) {
	theme, err := t.store.Queries.GetTheme(ctx)
	if err != nil {
		t.log.Error("failed to get theme", "error", err)
		return "", fmt.Errorf("failed to get theme: %w", err)
	}

	return theme, nil
}

func (t *Theme) Themes() []string {
	return themeOrder
}

func (t *Theme) Update(ctx context.Context, theme string) error {
	if !isValidTheme(theme) {
		return fmt.Errorf("invalid theme: %q", theme)
	}

	if err := t.store.Queries.UpdateTheme(ctx, theme); err != nil {
		t.log.Error("failed to update theme", "theme", theme, "error", err)
		return fmt.Errorf("failed to update theme: %w", err)
	}

	t.log.Info("theme updated", "theme", theme)
	return nil
}

func isValidTheme(value string) bool {
	_, ok := allowedThemes[value]
	return ok
}
