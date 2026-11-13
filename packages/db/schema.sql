-- Apply to a new PostgreSQL database. No default user or credentials are created.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9-]{2,31}$'),
  email text NOT NULL UNIQUE, password_hash text NOT NULL, role text NOT NULL DEFAULT 'CONTRIBUTOR' CHECK (role IN ('ADMIN','CONTRIBUTOR')),
  email_verified_at timestamptz, bio text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX only_one_admin ON users(role) WHERE role = 'ADMIN';
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id), slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name text NOT NULL, description text NOT NULL DEFAULT '', language text NOT NULL DEFAULT '', license text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PUBLIC','PRIVATE')), pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  UNIQUE(owner_id, slug)
);
CREATE TABLE repo_refs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), repo_id uuid NOT NULL REFERENCES repositories(id), display_name text NOT NULL, git_ref text NOT NULL, head_oid text, generation integer NOT NULL DEFAULT 0, UNIQUE(repo_id, display_name), UNIQUE(repo_id, git_ref));
CREATE TABLE contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), repo_id uuid NOT NULL REFERENCES repositories(id), author_id uuid NOT NULL REFERENCES users(id), number integer GENERATED ALWAYS AS IDENTITY,
  type text NOT NULL CHECK (type IN ('BUG','FEATURE','DOCS','CODE','SECURITY')), title text NOT NULL, body text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(repo_id,number)
);
CREATE TABLE contribution_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contribution_id uuid NOT NULL REFERENCES contributions(id), author_id uuid NOT NULL REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action text NOT NULL, resource_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE login_attempts (identity_hash text PRIMARY KEY, attempts integer NOT NULL, window_started_at timestamptz NOT NULL DEFAULT now());
