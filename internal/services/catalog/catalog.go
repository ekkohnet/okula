package catalog

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/ekkohnet/okula/internal/services/store"
	"github.com/ekkohnet/okula/internal/services/store/storedb"
	"github.com/ekkohnet/okula/internal/sqlutil"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Catalog is the facade over the store for managing catalog entries.
type Catalog struct {
	appCtx context.Context
	log    *slog.Logger
	store  *store.Service
}

func newCatalog(log *slog.Logger, store *store.Service) *Catalog {
	return &Catalog{
		log:   log,
		store: store,
	}
}

// --- Domain Types ---

type CatalogEntryType string

const (
	CatalogEntryTypeSingle CatalogEntryType = "single"
	CatalogEntryTypeMulti  CatalogEntryType = "multi"
)

// CatalogEntryModel is the internal domain model for a catalog entry.
// It is not exposed directly to the frontend.
type CatalogEntryModel struct {
	ID             string           `json:"id"`
	Type           CatalogEntryType `json:"type"`
	Hidden         bool             `json:"hidden"`
	ContextName    string           `json:"contextName"`
	ShortName      string           `json:"shortName"`
	KubeconfigPath string           `json:"kubeconfigPath"`
	Namespace      string           `json:"namespace"`
	Version        string           `json:"version"`
	Distro         string           `json:"distro"`
	Color          string           `json:"color"`
	CreatedAt      time.Time        `json:"createdAt"`
	UpdatedAt      time.Time        `json:"updatedAt"`
	LastSeen       *time.Time       `json:"lastSeen"`
}

// CatalogEntry is the DTO exposed via Wails. It uses Unix milliseconds for timestamps.
type CatalogEntry struct {
	ID             string           `json:"id"`
	Type           CatalogEntryType `json:"type"`
	Hidden         bool             `json:"hidden"`
	ContextName    string           `json:"contextName"`
	ShortName      string           `json:"shortName"`
	KubeconfigPath string           `json:"kubeconfigPath"`
	Namespace      string           `json:"namespace"`
	Version        string           `json:"version"`
	Distro         string           `json:"distro"`
	Color          string           `json:"color"`
	CreatedAt      int64            `json:"createdAt"`
	UpdatedAt      int64            `json:"updatedAt"`
	LastSeen       *int64           `json:"lastSeen"`
}

// --- Events ---

func (c *Catalog) emitCatalogUpdated() {
	application.Get().Event.Emit("CatalogUpdated")
}

// --- Queries & Commands ---

// getEntries returns the internal domain models for visible catalog entries.
func (c *Catalog) getEntries(ctx context.Context) ([]CatalogEntryModel, error) {
	entries, err := c.store.Queries.ListVisibleCatalogEntries(ctx)
	if err != nil {
		return []CatalogEntryModel{}, fmt.Errorf("failed to list catalog entries: %w", err)
	}

	var result []CatalogEntryModel
	for _, entry := range entries {
		result = append(result, entryRowToModel(entry))
	}

	return result, nil
}

// getEntry returns the internal domain model for a single catalog entry.
func (c *Catalog) getEntry(ctx context.Context, id string) (CatalogEntryModel, error) {
	entry, err := c.store.Queries.GetCatalogEntry(ctx, id)
	if err != nil {
		return CatalogEntryModel{}, fmt.Errorf("failed to get catalog entry %q: %w", id, err)
	}

	return entryRowToModel(entry), nil
}

func entryRowToModel(entry storedb.CatalogEntry) CatalogEntryModel {
	return CatalogEntryModel{
		ID:             entry.ID,
		Type:           CatalogEntryType(entry.Type),
		Hidden:         sqlutil.Int64ToBool(entry.Hidden),
		ContextName:    entry.ContextName,
		ShortName:      sqlutil.NullStringToString(entry.ShortName),
		KubeconfigPath: sqlutil.NullStringToString(entry.KubeconfigPath),
		Namespace:      sqlutil.NullStringToString(entry.Namespace),
		Version:        sqlutil.NullStringToString(entry.Version),
		Distro:         sqlutil.NullStringToString(entry.Distro),
		Color:          sqlutil.NullStringToString(entry.Color),
		CreatedAt:      entry.CreatedAt,
		UpdatedAt:      entry.UpdatedAt,
		LastSeen:       sqlutil.NullTimeToTime(entry.LastSeen),
	}
}

func (c *Catalog) upsertEntry(ctx context.Context, entry CatalogEntryModel) error {
	now := time.Now().UTC()

	return c.store.Queries.UpsertCatalogEntry(ctx, storedb.UpsertCatalogEntryParams{
		ID:             entry.ID,
		Type:           string(CatalogEntryTypeSingle),
		Hidden:         sqlutil.BoolToInt64(entry.Hidden),
		ContextName:    entry.ContextName,
		ShortName:      sqlutil.StringToNullString(entry.ShortName),
		KubeconfigPath: sqlutil.StringToNullString(entry.KubeconfigPath),
		Namespace:      sqlutil.StringToNullString(entry.Namespace),
		Distro:         sqlutil.StringToNullString(entry.Distro),
		Color:          sqlutil.StringToNullString(entry.Color),
		CreatedAt:      now,
		UpdatedAt:      now,
	})
}

// --- Visibility Helpers ---

func (c *Catalog) hideMissingContextsForPath(path string, validIDs []string) error {
	now := time.Now().UTC()

	return c.store.Queries.HideMissingCatalogEntriesForPath(c.appCtx, storedb.HideMissingCatalogEntriesForPathParams{
		UpdatedAt: now,
		Path:      sqlutil.StringToNullString(path),
		ValidIds:  validIDs,
	})
}

func (c *Catalog) hideMissingEntriesInFolder(folderPath string, validPaths []string) error {
	now := time.Now().UTC()

	if len(validPaths) == 0 {
		if err := c.store.Queries.HideAllCatalogEntriesInFolder(c.appCtx, storedb.HideAllCatalogEntriesInFolderParams{
			UpdatedAt:    now,
			FolderPrefix: sqlutil.StringToNullString(folderPath + "/"),
		}); err != nil {
			return fmt.Errorf("hide all catalog entries in folder %q: %w", folderPath, err)
		}
		return nil
	}

	return c.store.Queries.HideMissingCatalogEntriesInFolder(c.appCtx, storedb.HideMissingCatalogEntriesInFolderParams{
		UpdatedAt:    now,
		FolderPrefix: sqlutil.StringToNullString(folderPath + "/"),
		ValidPaths:   sqlutil.StringsToNullStrings(validPaths),
	})
}

func (c *Catalog) hideEntriesByPath(path string) error {
	now := time.Now().UTC()

	return c.store.Queries.HideCatalogEntriesByPath(c.appCtx, storedb.HideCatalogEntriesByPathParams{
		UpdatedAt:    now,
		Path:         sqlutil.StringToNullString(path),
		FolderPrefix: sqlutil.StringToNullString(path + "/%"),
	})
}

func (c *Catalog) hideEntriesForUnknownPaths(knownPaths []string) error {
	now := time.Now().UTC()

	if len(knownPaths) == 0 {
		if err := c.store.Queries.HideAllCatalogFileEntries(c.appCtx, now); err != nil {
			return fmt.Errorf("hide all catalog file entries: %w", err)
		}
		return nil
	}

	return c.store.Queries.HideMissingCatalogFileEntries(c.appCtx, storedb.HideMissingCatalogFileEntriesParams{
		UpdatedAt:  now,
		ValidPaths: sqlutil.StringsToNullStrings(knownPaths),
	})
}

// --- Model <-> DTO Mappers ---

// CatalogEntryToDTO converts a CatalogEntryModel into the CatalogEntry DTO with Unix
// millisecond timestamps for use in the frontend.
func CatalogEntryToDTO(m CatalogEntryModel) CatalogEntry {
	createdAtMs := m.CreatedAt.UTC().UnixMilli()
	updatedAtMs := m.UpdatedAt.UTC().UnixMilli()

	var lastSeenMs *int64
	if m.LastSeen != nil {
		v := m.LastSeen.UTC().UnixMilli()
		lastSeenMs = &v
	}

	return CatalogEntry{
		ID:             m.ID,
		Type:           m.Type,
		Hidden:         m.Hidden,
		ContextName:    m.ContextName,
		ShortName:      m.ShortName,
		KubeconfigPath: m.KubeconfigPath,
		Namespace:      m.Namespace,
		Version:        m.Version,
		Distro:         m.Distro,
		Color:          m.Color,
		CreatedAt:      createdAtMs,
		UpdatedAt:      updatedAtMs,
		LastSeen:       lastSeenMs,
	}
}
