package main

import (
	"embed"
	"fmt"
	"os"

	"github.com/ekkohnet/okula/internal/app"
	"github.com/ekkohnet/okula/internal/config"
	"github.com/ekkohnet/okula/internal/logger"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	os.Exit(run())
}

func run() int {
	env, err := config.ParseEnvironment()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to parse environment config: %v", err)
		return 1
	}

	log := logger.New(logger.Options{
		Level:            env.LogLevel,
		CallerEnabled:    env.LogCallerEnabled,
		TimestampEnabled: env.LogTimestampEnabled,
	})

	baseDir, err := app.CreateBaseDir()
	if err != nil {
		log.Error("failed to create base directory", "error", err)
		return 1
	}

	okula, err := app.New(app.Options{
		Env:     env,
		Log:     log,
		Assets:  assets,
		BaseDir: baseDir,
	})
	if err != nil {
		log.Error("failed to create okula app instance", "error", err)
		return 1
	}

	log.Info("launching okula", "pid", okula.GetPID())
	if err := okula.Run(); err != nil {
		log.Error("failed to launch okula", "error", err)
		return 1
	}

	return 0
}
