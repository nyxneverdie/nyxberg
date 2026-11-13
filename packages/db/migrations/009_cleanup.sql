ALTER TABLE sync_transfers ADD COLUMN IF NOT EXISTS staging_cleaned_at timestamptz;
CREATE INDEX IF NOT EXISTS sync_staging_cleanup ON sync_transfers(created_at) WHERE staging_cleaned_at IS NULL;
