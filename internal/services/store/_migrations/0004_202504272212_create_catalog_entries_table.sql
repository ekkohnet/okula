CREATE TABLE catalog_entries (
    id TEXT PRIMARY KEY,
    type TEXT CHECK (type IN ('single', 'multi')) NOT NULL DEFAULT 'single',
    hidden INTEGER NOT NULL DEFAULT 0,
    context_name TEXT NOT NULL,
    short_name TEXT DEFAULT '',
    kubeconfig_path TEXT DEFAULT '',
    namespace TEXT DEFAULT '',
    version TEXT DEFAULT '',
    distro TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    color TEXT DEFAULT '',
    last_seen TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
