-- Disposable compatibility fixture, not an application migration.
CREATE TABLE users (
 id uuid PRIMARY KEY, email bytea NOT NULL, email_lookup_hash bytea UNIQUE NOT NULL,
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
 ui_language text NOT NULL DEFAULT 'xh' CHECK (ui_language IN ('xh','en')),
 account_role text NOT NULL DEFAULT 'member', status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version int NOT NULL DEFAULT 1
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 token_hash bytea UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, user_agent_summary text
);
CREATE INDEX ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE TABLE auth_challenges (
 id uuid PRIMARY KEY, email_lookup_hash bytea NOT NULL, code_hash bytea, link_token_hash bytea,
 expires_at timestamptz NOT NULL, consumed_at timestamptz, attempts int NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 created_ip_hash bytea, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON auth_challenges (email_lookup_hash);
CREATE TABLE audit_probe (model text, operation text, entity_id uuid);
