package catalog

import "strings"

// contextShortNameUnknown is returned when a context name cannot be determined.
const contextShortNameUnknown = "-"

// getContextShortName generates a 1-3 character short name for a context.
func getContextShortName(name string) string {
	if name == "" {
		return contextShortNameUnknown
	}

	parts := splitContextNameParts(name)
	return buildContextShortName(parts)
}

// splitContextNameParts splits a context name into parts based on common delimiters.
func splitContextNameParts(name string) []string {
	delimiters := []string{" ", "-", "_", "@"}
	for _, delimiter := range delimiters {
		parts := strings.Split(name, delimiter)
		if len(parts) > 1 {
			return parts
		}
	}
	return []string{name}
}

// buildContextShortName constructs a 1-3 character short name from context name parts.
func buildContextShortName(parts []string) string {
	switch len(parts) {
	case 1:
		return strings.ToUpper(truncate(parts[0], 3))
	case 2:
		return strings.ToUpper(string(parts[0][0]) + truncate(parts[1], 2))
	default:
		var b strings.Builder
		for _, part := range parts {
			if part != "" {
				b.WriteByte(part[0])
			}
		}
		return strings.ToUpper(truncate(b.String(), 3))
	}
}

// truncate shortens a string to a maximum of n runes.
func truncate(s string, n int) string {
	if n <= 0 {
		return ""
	}

	runes := []rune(s)
	if len(runes) > n {
		return string(runes[:n])
	}
	return s
}
