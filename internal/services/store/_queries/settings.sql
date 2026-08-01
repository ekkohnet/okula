-- name: GetSettings :one
SELECT * FROM settings WHERE id = 1;

-- name: UpdateSettings :exec
UPDATE settings
SET theme = ?, timezone = ?
WHERE id = 1;

-- name: GetTheme :one
SELECT theme FROM settings WHERE id = 1;

-- name: UpdateTheme :exec
UPDATE settings
SET theme = ?
WHERE id = 1;

-- name: GetTimezone :one
SELECT timezone FROM settings WHERE id = 1;

-- name: UpdateTimezone :exec
UPDATE settings
SET timezone = ?
WHERE id = 1;
