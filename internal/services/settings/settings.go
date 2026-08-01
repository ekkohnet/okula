package settings

import "github.com/ekkohnet/okula/internal/services/store/storedb"

type Settings struct {
	Theme    string `json:"theme"`
	Timezone string `json:"timezone"`
}

func fromStoreSettings(s storedb.Settings) Settings {
	return Settings{
		Theme:    s.Theme,
		Timezone: s.Timezone,
	}
}
