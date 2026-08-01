CREATE TABLE watchlist (
  path TEXT PRIMARY KEY,
  type TEXT CHECK (type IN ('file', 'folder'))
);
