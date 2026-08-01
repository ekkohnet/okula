// timezone_bindings.go
// Wails-exposed methods on *Service that are bound to the frontend.

package settings

import (
	"context"
)

func (s *Service) GetTimezone(ctx context.Context) (string, error) {
	return s.timezone.Get(ctx)
}

func (s *Service) GetTimezones() []string {
	return s.timezone.Timezones()
}

func (s *Service) UpdateTimezone(ctx context.Context, zone string) error {
	return s.timezone.Update(ctx, zone)
}
