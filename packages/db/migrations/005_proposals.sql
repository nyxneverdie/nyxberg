CREATE TABLE IF NOT EXISTS contribution_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contribution_id uuid NOT NULL REFERENCES contributions(id),
 revision_no integer NOT NULL, base_commit_oid text NOT NULL, target_ref text NOT NULL,
 payload_key text NOT NULL, payload_sha256 text NOT NULL, payload_size integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(contribution_id,revision_no)
);
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS merged_commit_oid text;
ALTER TABLE transfer_objects DROP CONSTRAINT IF EXISTS transfer_objects_storage_key_key;
