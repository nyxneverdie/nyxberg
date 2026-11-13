CREATE TABLE IF NOT EXISTS access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, token_hash text NOT NULL UNIQUE, scopes text[] NOT NULL, expires_at timestamptz NOT NULL,
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sync_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), repo_id uuid NOT NULL REFERENCES repositories(id), actor_id uuid NOT NULL REFERENCES users(id),
  git_ref text NOT NULL, expected_head text, expected_generation integer NOT NULL, new_head text NOT NULL,
  state text NOT NULL DEFAULT 'UPLOADING' CHECK(state IN ('UPLOADING','COMMITTED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour'
);
CREATE TABLE IF NOT EXISTS transfer_objects (
  transfer_id uuid NOT NULL REFERENCES sync_transfers(id) ON DELETE CASCADE,
  oid text NOT NULL CHECK(oid ~ '^[0-9a-f]{40}$'), storage_key text NOT NULL UNIQUE,
  storage_sha256 text NOT NULL CHECK(storage_sha256 ~ '^[0-9a-f]{64}$'), compressed_size integer NOT NULL,
  PRIMARY KEY(transfer_id,oid)
);
ALTER TABLE repo_refs ADD COLUMN IF NOT EXISTS head_transfer_id uuid REFERENCES sync_transfers(id);
CREATE INDEX IF NOT EXISTS sync_transfers_repo ON sync_transfers(repo_id,created_at DESC);
