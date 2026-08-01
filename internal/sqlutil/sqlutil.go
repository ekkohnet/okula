package sqlutil

import (
	"database/sql"
	"time"
)

// FallbackIfNull returns the string value of a sql.NullString if it is valid, otherwise it returns the fallback value.
func FallbackIfNull(ns sql.NullString, fallback string) string {
	if ns.Valid {
		return ns.String
	}
	return fallback
}

// StringToNullString converts a string to a sql.NullString.
// If the string is empty, it returns an invalid sql.NullString.
func StringToNullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

// StringsToNullStrings converts a slice of strings to a slice of sql.NullString.
// Each string in the slice is converted to a valid sql.NullString.
func StringsToNullStrings(values []string) []sql.NullString {
	nulls := make([]sql.NullString, len(values))
	for i, v := range values {
		nulls[i] = sql.NullString{String: v, Valid: true}
	}
	return nulls
}

// NullStringToString converts a sql.NullString to a string.
// If the sql.NullString is valid, it returns its string value.
// Otherwise, it returns an empty string.
func NullStringToString(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

// TimeToNullTime converts a *time.Time to a sql.NullTime.
// If the pointer is nil, it returns an invalid sql.NullTime.
func TimeToNullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}

// NullTimeToTime converts a sql.NullTime to a *time.Time.
// If the NullTime is invalid, it returns nil.
func NullTimeToTime(nt sql.NullTime) *time.Time {
	if !nt.Valid {
		return nil
	}
	t := nt.Time
	return &t
}

// BoolToInt64 converts a boolean value to an int64.
// It returns 1 for true and 0 for false.
func BoolToInt64(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// Int64ToBool converts an int64 value to a boolean.
// It returns true for 1 and false for 0.
func Int64ToBool(i int64) bool {
	return i == 1
}
