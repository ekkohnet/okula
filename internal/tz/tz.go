package tz

import (
	"log/slog"

	"github.com/thlib/go-timezone-local/tzlocal"
)

var tzSet map[string]struct{}

func init() {
	tzSet = make(map[string]struct{}, len(TimeZones))
	for _, tz := range TimeZones {
		tzSet[tz] = struct{}{}
	}
}

// IsValid checks if the given timezone is present in the list of valid timezones.
func IsValid(tz string) bool {
	_, ok := tzSet[tz]
	return ok
}

// Local returns the local timezone of the system. If it cannot be determined, it falls back to UTC.
func Local(log *slog.Logger) string {
	tz, err := tzlocal.RuntimeTZ()

	if err != nil {
		log.Warn("unable to get local timezone - falling back to UTC ", "error", err)
		return "UTC"
	}
	if !IsValid(tz) {
		log.Warn("invalid local timezone - falling back to UTC", "timezone", tz)
		return "UTC"
	}

	return tz
}
