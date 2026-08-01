CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  theme TEXT NOT NULL DEFAULT 'System' CHECK (theme IN ('System', 'Light', 'Dark')),
  timezone TEXT NOT NULL DEFAULT 'UTC'
);

INSERT INTO settings (id) VALUES (1)
ON CONFLICT(id) DO NOTHING;
