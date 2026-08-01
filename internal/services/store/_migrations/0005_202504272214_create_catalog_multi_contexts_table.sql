CREATE TABLE catalog_multi_contexts (
    parent_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    PRIMARY KEY (parent_id, child_id),
    FOREIGN KEY (parent_id) REFERENCES catalog_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (child_id) REFERENCES catalog_entries(id) ON DELETE CASCADE
);
