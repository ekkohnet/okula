-- name: AddToWatchlist :exec
INSERT OR IGNORE INTO watchlist (path, type)
VALUES (?, ?);

-- name: RemoveFromWatchlist :exec
DELETE FROM watchlist
WHERE path = ?;

-- name: ListWatchedFiles :many
SELECT path FROM watchlist
WHERE type = 'file'
ORDER BY path;

-- name: ListWatchedFolders :many
SELECT path FROM watchlist
WHERE type = 'folder'
ORDER BY path;
