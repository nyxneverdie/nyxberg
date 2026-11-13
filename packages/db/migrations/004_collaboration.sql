CREATE TABLE IF NOT EXISTS contribution_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contribution_id uuid NOT NULL REFERENCES contributions(id),
 actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, from_state text, to_state text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id uuid NOT NULL REFERENCES users(id),
 event_id uuid NOT NULL REFERENCES contribution_events(id), message text NOT NULL, resource_id uuid NOT NULL,
 read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(recipient_id,event_id)
);
CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications(recipient_id,created_at DESC);
