package logger

import (
	"log/slog"
	"os"

	"charm.land/lipgloss/v2"
	"charm.land/log/v2"
)

type Options struct {
	CallerEnabled    bool
	Level            string
	TimestampEnabled bool
}

func New(opts Options) *slog.Logger {
	logger := log.NewWithOptions(os.Stderr, log.Options{
		Level:           parseLevel(opts.Level),
		ReportCaller:    opts.CallerEnabled,
		ReportTimestamp: opts.TimestampEnabled,
		TimeFormat:      "15:04:05",
	})

	styles := createStyles()
	logger.SetStyles(styles)

	return slog.New(logger)
}

func parseLevel(level string) log.Level {
	logLevel, err := log.ParseLevel(level)
	if err != nil {
		logLevel = log.DebugLevel
	}
	return logLevel
}

// TODO: v2 API
func createStyles() *log.Styles {
	styles := log.DefaultStyles()
	styles.Keys["error"] = lipgloss.NewStyle().Foreground(lipgloss.Color("204"))
	styles.Keys["warning"] = lipgloss.NewStyle().Foreground(lipgloss.Color("226"))

	return styles
}
