-- name: GetMetadata :one
SELECT * FROM metadata WHERE id = 1;

-- name: GetFirstRun :one
SELECT first_run FROM metadata WHERE id = 1;

-- name: CompleteFirstRun :exec
UPDATE metadata SET first_run = FALSE WHERE id = 1 AND first_run = TRUE;
