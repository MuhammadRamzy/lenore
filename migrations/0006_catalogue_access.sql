CREATE TABLE catalogue_access (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 password_hash TEXT, generation INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 1,
 CHECK(enabled=0 OR password_hash IS NOT NULL)
);
INSERT INTO catalogue_access(id) VALUES(1);
CREATE TABLE catalogue_sessions (
 token_hash TEXT PRIMARY KEY, generation INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX catalogue_sessions_expiry ON catalogue_sessions(expires_at);
CREATE TABLE catalogue_access_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, protected INTEGER NOT NULL, generation INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER catalogue_access_audit_change AFTER UPDATE ON catalogue_access BEGIN
 INSERT INTO catalogue_access_audit(protected,generation) VALUES(NEW.enabled,NEW.generation);
END;
