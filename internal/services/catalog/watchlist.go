package catalog

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"slices"

	"github.com/ekkohnet/okula/internal/services/store"
	"github.com/ekkohnet/okula/internal/services/store/storedb"
	"github.com/ekkohnet/okula/internal/sqlutil"

	"github.com/rjeczalik/notify"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// Watchlist tracks kubeconfig files and folders and keeps the catalog in sync.
type Watchlist struct {
	appCtx  context.Context
	log     *slog.Logger
	store   *store.Service
	catalog *Catalog

	notifier chan notify.EventInfo
	debounce *debounceRegistry
}

func newWatchlist(log *slog.Logger, store *store.Service, catalog *Catalog) *Watchlist {
	return &Watchlist{
		log:      log,
		store:    store,
		catalog:  catalog,
		notifier: newNotifier(),
		debounce: newDebounceRegistry(),
	}
}

// --- Domain Types ---

type WatchlistEntryType string

const (
	WatchlistEntryTypeFile   WatchlistEntryType = "file"
	WatchlistEntryTypeFolder WatchlistEntryType = "folder"
)

type watchlistEntry struct {
	Path string
	Type WatchlistEntryType
}

type folderSyncResult struct {
	activePaths    []string
	contextsSynced int
	filesAttempted int
	filesSkipped   int
}

// --- Default Watchlist Entries ---

func (wl *Watchlist) ensureDefaultsIfFirstRun() error {
	if !wl.store.IsFirstRun {
		return nil
	}
	return wl.seedDefaultEntries()
}

func (wl *Watchlist) seedDefaultEntries() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get user home directory: %w", err)
	}

	entries := []watchlistEntry{
		{
			Path: filepath.Join(homeDir, ".kube", "config"),
			Type: WatchlistEntryTypeFile,
		},
		{
			Path: filepath.Join(homeDir, ".kube", "configs"),
			Type: WatchlistEntryTypeFolder,
		},
	}
	for _, entry := range entries {
		if err := wl.addEntry(wl.appCtx, entry); err != nil {
			return fmt.Errorf("failed to insert %s: %w", entry.Path, err)
		}
	}

	wl.log.Info("seeded default watchlist entries")
	return nil
}

// --- Persistence Helpers ---

func (wl *Watchlist) addEntry(ctx context.Context, entry watchlistEntry) error {
	return wl.store.Queries.AddToWatchlist(ctx, storedb.AddToWatchlistParams{
		Path: entry.Path,
		Type: sqlutil.StringToNullString(string(entry.Type)),
	})
}

// --- Queries & Commands ---

func (wl *Watchlist) watchPath(path string) error {
	return notify.Watch(path, wl.notifier, notify.Create, notify.Write, notify.Remove, notify.Rename)
}

func (wl *Watchlist) listWatchedFiles(ctx context.Context) ([]string, error) {
	files, err := wl.store.Queries.ListWatchedFiles(ctx)
	if err != nil {
		return nil, err
	}
	return files, nil
}

func (wl *Watchlist) listWatchedFolders(ctx context.Context) ([]string, error) {
	folders, err := wl.store.Queries.ListWatchedFolders(ctx)
	if err != nil {
		return nil, err
	}
	return folders, nil
}

// --- Sync: Watchlist <> Catalog ---

func (wl *Watchlist) syncWatchlistAndCatalog() error {
	var totalContextsSynced int
	var totalFilesAttempted int
	var totalFilesSkipped int
	knownPaths := make(map[string]struct{})

	watchedFiles, err := wl.listWatchedFiles(wl.appCtx)
	if err != nil {
		return fmt.Errorf("failed to list watched files: %w", err)
	}
	for _, path := range watchedFiles {
		totalFilesAttempted++
		kubeconfig, err := clientcmd.LoadFromFile(path)
		if err != nil {
			totalFilesSkipped++
			wl.log.Warn("failed to load kubeconfig for watched file", "path", path, "error", err)

			if err := wl.catalog.hideMissingContextsForPath(path, nil); err != nil {
				wl.log.Error("failed to hide catalog entries for invalid watched file", "path", path, "error", err)
			}
			wl.log.Info("hidden catalog entries for invalid watched file", "path", path)
			continue
		}

		count, entryIDs := wl.processKubeconfigFile(path, kubeconfig)
		totalContextsSynced += count

		if err := wl.catalog.hideMissingContextsForPath(path, entryIDs); err != nil {
			wl.log.Error("failed to hide missing catalog entries for watched file", "path", path, "error", err)
		}

		knownPaths[path] = struct{}{}
		if err := wl.watchPath(path); err != nil {
			wl.log.Warn("failed to watch file", "path", path, "error", err)
			continue
		}
	}

	watchedFolders, err := wl.listWatchedFolders(wl.appCtx)
	if err != nil {
		return fmt.Errorf("failed to list watched folders: %w", err)
	}
	for _, path := range watchedFolders {
		if fi, err := os.Stat(path); err != nil || !fi.IsDir() {
			wl.log.Warn("failed to stat watched folder", "path", path, "error", err)

			if err := wl.catalog.hideEntriesByPath(path); err != nil {
				wl.log.Error("failed to hide catalog entries for invalid watched folder", "path", path, "error", err)
				continue
			}
			wl.log.Info("hidden catalog entries for invalid watched folder", "path", path)
			continue
		}

		stats, err := wl.syncFolder(path)
		if err != nil {
			return fmt.Errorf("failed to sync watched folder %q: %w", path, err)
		}

		totalFilesAttempted += stats.filesAttempted
		totalFilesSkipped += stats.filesSkipped
		totalContextsSynced += stats.contextsSynced
		for _, filePath := range stats.activePaths {
			knownPaths[filePath] = struct{}{}
		}

		if err := wl.watchPath(path); err != nil {
			wl.log.Warn("failed to watch folder", "path", path, "error", err)
			continue
		}
	}

	knownPathList := make([]string, 0, len(knownPaths))
	for path := range knownPaths {
		knownPathList = append(knownPathList, path)
	}

	if err := wl.catalog.hideEntriesForUnknownPaths(knownPathList); err != nil {
		return fmt.Errorf("failed to hide catalog entries for unknown paths: %w", err)
	}

	wl.log.Info("watchlist and catalog synced",
		"files_watched", len(watchedFiles),
		"folders_watched", len(watchedFolders),
		"files_attempted", totalFilesAttempted,
		"files_skipped", totalFilesSkipped,
		"contexts_synced", totalContextsSynced,
	)
	return nil
}

// syncFolder processes all kubeconfig files in a folder and updates the catalog.
func (wl *Watchlist) syncFolder(folderPath string) (folderSyncResult, error) {
	result := folderSyncResult{}

	entries, err := os.ReadDir(folderPath)
	if err != nil {
		return result, fmt.Errorf("read watched folder %q: %w", folderPath, err)
	}
	fileEntries := slices.DeleteFunc(entries, func(de os.DirEntry) bool {
		return de.IsDir()
	})

	result.activePaths = make([]string, 0, len(fileEntries))

	for _, fi := range fileEntries {
		filePath := filepath.Join(folderPath, fi.Name())
		result.filesAttempted++

		kubeconfig, err := clientcmd.LoadFromFile(filePath)
		if err != nil {
			result.filesSkipped++
			wl.log.Error("failed to load kubeconfig for file in watched folder", "path", filePath, "error", err)
			if err = wl.catalog.hideMissingContextsForPath(filePath, nil); err != nil {
				wl.log.Error("failed to hide catalog entries for invalid file in watched folder", "path", filePath, "error", err)
			}
			wl.log.Info("hidden catalog entries for invalid file in watched folder", "path", filePath)
			continue
		}

		count, entryIDs := wl.processKubeconfigFile(filePath, kubeconfig)
		result.contextsSynced += count
		result.activePaths = append(result.activePaths, filePath)

		if err := wl.catalog.hideMissingContextsForPath(filePath, entryIDs); err != nil {
			wl.log.Error("failed to hide missing catalog entries for file in folder", "path", filePath, "error", err)
		}
	}

	if err := wl.catalog.hideMissingEntriesInFolder(folderPath, result.activePaths); err != nil {
		return result, fmt.Errorf("hide missing catalog entries in folder %q: %w", folderPath, err)
	}

	return result, nil
}

// processKubeconfigFile parses a kubeconfig file and upserts catalog entries for each context.
func (wl *Watchlist) processKubeconfigFile(path string, kubeconfig *api.Config) (int, []string) {
	var successCount int
	entryIDs := make([]string, 0, len(kubeconfig.Contexts))

	for contextName, context := range kubeconfig.Contexts {
		ID := generateEntryID(path, contextName)
		distro := parseDistroFromContext(context, kubeconfig.Clusters)
		shortName := getContextShortName(contextName)
		colour := generateEntryColor(ID)

		entry := CatalogEntryModel{
			ID:             ID,
			Hidden:         false,
			ContextName:    contextName,
			ShortName:      shortName,
			KubeconfigPath: path,
			Namespace:      context.Namespace,
			Distro:         distro,
			Color:          colour,
		}
		if err := wl.catalog.upsertEntry(wl.appCtx, entry); err != nil {
			wl.log.Error("failed to update catalog entry", "context", contextName, "id", ID, "error", err)
			continue
		}

		wl.log.Info("updated catalog entry", "context", contextName, "id", ID, "path", path)
		successCount++
		entryIDs = append(entryIDs, ID)
	}

	return successCount, entryIDs
}
