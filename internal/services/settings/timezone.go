package settings

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/ekkohnet/okula/internal/services/store"
	"github.com/ekkohnet/okula/internal/tz"
)

type Timezone struct {
	log   *slog.Logger
	store *store.Service
}

func (t *Timezone) Get(ctx context.Context) (string, error) {
	zone, err := t.store.Queries.GetTimezone(ctx)
	if err != nil {
		t.log.Error("failed to get timezone", "error", err)
		return "", fmt.Errorf("failed to get timezone: %w", err)
	}

	return zone, nil
}

func (t *Timezone) Timezones() []string {
	return tz.TimeZones
}

func (t *Timezone) Update(ctx context.Context, zone string) error {
	if zone == "" {
		return fmt.Errorf("timezone cannot be empty")
	}
	if !tz.IsValid(zone) {
		return fmt.Errorf("invalid timezone: %s", zone)
	}

	if err := t.store.Queries.UpdateTimezone(ctx, zone); err != nil {
		t.log.Error("failed to update timezone", "zone", zone, "error", err)
		return fmt.Errorf("failed to update timezone: %w", err)
	}

	t.log.Info("timezone updated", "timezone", zone)
	return nil
}

func (t *Timezone) setDefault(ctx context.Context) error {
	tz := tz.Local(t.log)
	if err := t.store.Queries.UpdateTimezone(ctx, tz); err != nil {
		return err
	}

	t.log.Info("set default timezone", "timezone", tz)
	return nil
}
