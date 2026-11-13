CREATE TABLE IF NOT EXISTS repo_archives (
 repo_id uuid NOT NULL REFERENCES repositories(id), commit_oid text NOT NULL, format text NOT NULL CHECK(format IN ('zip','tar.gz')),
 storage_key text NOT NULL, size integer NOT NULL, sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(repo_id,commit_oid,format)
);
