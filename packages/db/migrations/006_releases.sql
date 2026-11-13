ALTER TABLE repo_refs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'BRANCH' CHECK(kind IN ('BRANCH','TAG'));
CREATE TABLE IF NOT EXISTS releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), repo_id uuid NOT NULL REFERENCES repositories(id),
 tag_name text NOT NULL, commit_oid text NOT NULL, title text NOT NULL, changelog text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(repo_id,tag_name)
);
CREATE TABLE IF NOT EXISTS release_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), release_id uuid NOT NULL REFERENCES releases(id),
 filename text NOT NULL, storage_key text NOT NULL, sha256 text NOT NULL, size integer NOT NULL,
 state text NOT NULL DEFAULT 'UPLOADING' CHECK(state IN ('UPLOADING','READY')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(release_id,filename)
);
