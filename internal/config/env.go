package config

import (
	"github.com/kelseyhightower/envconfig"
)

const prefix = "OKULA"

type Environment struct {
	AssetServerLogsEnabled bool   `default:"false" split_words:"true"`
	LogLevel               string `default:"debug" split_words:"true"`
	LogCallerEnabled       bool   `default:"true" split_words:"true"`
	LogTimestampEnabled    bool   `default:"true" split_words:"true"`
}

func ParseEnvironment() (Environment, error) {
	var cfg Environment
	if err := envconfig.Process(prefix, &cfg); err != nil {
		return Environment{}, err
	}

	return cfg, nil
}
