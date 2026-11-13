CREATE TABLE IF NOT EXISTS rate_limits (
 key_hash text PRIMARY KEY, attempts integer NOT NULL, window_started_at timestamptz NOT NULL DEFAULT now()
);
