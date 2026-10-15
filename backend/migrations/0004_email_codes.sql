-- One active email login code per user. Only a salted hash is stored, never the code.
CREATE TABLE IF NOT EXISTS email_login_codes (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);
