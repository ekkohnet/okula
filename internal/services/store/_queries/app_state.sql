-- name: GetActiveClusterID :one
SELECT active_cluster_id FROM app_state WHERE id = 1;

-- name: SetActiveClusterID :exec
UPDATE app_state SET active_cluster_id = ? WHERE id = 1;
