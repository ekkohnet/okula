CREATE TABLE app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_cluster_id TEXT
);

INSERT INTO app_state (id) VALUES (1)
ON CONFLICT(id) DO NOTHING;
