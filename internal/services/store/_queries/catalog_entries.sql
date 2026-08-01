-- name: UpsertCatalogEntry :exec
-- Owns only kubeconfig-derived fields. Cluster-observed fields (version,
-- last_seen) are written by the connection layer through its own queries.
INSERT INTO catalog_entries (
  id,
  type,
  hidden,
  context_name,
  short_name,
  kubeconfig_path,
  namespace,
  distro,
  color,
  created_at,
  updated_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
ON CONFLICT(id) DO UPDATE SET
  type = excluded.type,
  hidden = excluded.hidden,
  context_name = excluded.context_name,
  short_name = excluded.short_name,
  kubeconfig_path = excluded.kubeconfig_path,
  namespace = excluded.namespace,
  distro = excluded.distro,
  color = excluded.color,
  created_at = catalog_entries.created_at,
  updated_at = excluded.updated_at;

-- name: GetCatalogEntry :one
SELECT *
FROM catalog_entries
WHERE id = ?;

-- name: DeleteCatalogEntry :exec
DELETE FROM catalog_entries
WHERE id = ?;

-- name: ListCatalogEntries :many
SELECT *
FROM catalog_entries
ORDER BY context_name ASC;

-- name: ListVisibleCatalogEntries :many
SELECT *
FROM catalog_entries
WHERE hidden = 0
ORDER BY context_name ASC;

-- name: HideCatalogEntriesByPath :exec
UPDATE catalog_entries
SET hidden = 1,
  updated_at = @updated_at
WHERE hidden = 0
  AND (
    kubeconfig_path = @path
    OR kubeconfig_path LIKE @folder_prefix
  );

-- name: HideMissingCatalogFileEntries :exec
UPDATE catalog_entries
SET hidden = 1,
  updated_at = @updated_at
WHERE hidden = 0
  AND kubeconfig_path NOT IN (sqlc.slice(valid_paths));

-- name: HideAllCatalogFileEntries :exec
UPDATE catalog_entries
SET hidden = 1,
  updated_at = @updated_at
WHERE hidden = 0;

-- name: HideMissingCatalogEntriesInFolder :exec
UPDATE catalog_entries
SET hidden = 1,
  updated_at = @updated_at
WHERE hidden = 0
  AND kubeconfig_path LIKE @folder_prefix
  AND kubeconfig_path NOT IN (sqlc.slice(valid_paths));

-- name: HideMissingCatalogEntriesForPath :exec
UPDATE catalog_entries
SET hidden = 1,
  updated_at = @updated_at
WHERE hidden = 0
  AND kubeconfig_path = @path
  AND id NOT IN (sqlc.slice(valid_ids));

-- name: HideAllCatalogEntriesInFolder :exec
UPDATE catalog_entries
SET hidden = 1,
  updated_at = @updated_at
WHERE hidden = 0
  AND kubeconfig_path LIKE @folder_prefix;
