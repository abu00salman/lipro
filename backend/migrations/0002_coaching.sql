-- Phase 2: coaches, teams, age categories, training sessions and attendance.
-- Attendance is one row per (session, player). Re-marking updates the row, never duplicates it.

CREATE TABLE age_categories (
  id          TEXT PRIMARY KEY,                    -- e.g. 'u10'
  name        TEXT NOT NULL,
  min_age     INTEGER NOT NULL,
  max_age     INTEGER NOT NULL,
  CHECK (min_age <= max_age)
);

CREATE TABLE coaches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER UNIQUE REFERENCES users(id),  -- login account, if any
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  full_name   TEXT NOT NULL,
  mobile      TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_coaches_branch ON coaches(branch_id);

CREATE TABLE teams (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id    TEXT NOT NULL REFERENCES branches(id),
  category_id  TEXT NOT NULL REFERENCES age_categories(id),
  name         TEXT NOT NULL,
  coach_id     INTEGER REFERENCES coaches(id),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (branch_id, name)
);

-- A player belongs to at most one team at a time.
CREATE TABLE team_members (
  player_id   INTEGER PRIMARY KEY REFERENCES players(id),
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  joined_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_team_members_team ON team_members(team_id);

CREATE TABLE training_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  starts_at   TEXT NOT NULL,                       -- ISO 8601 UTC
  venue       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sessions_team_date ON training_sessions(team_id, starts_at);

CREATE TABLE attendance (
  session_id  INTEGER NOT NULL REFERENCES training_sessions(id),
  player_id   INTEGER NOT NULL REFERENCES players(id),
  status      TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  marked_by   INTEGER REFERENCES users(id),
  marked_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (session_id, player_id)
);

INSERT INTO age_categories (id, name, min_age, max_age) VALUES
  ('u8', 'تحت ٨ سنوات', 4, 7),
  ('u10', 'تحت ١٠ سنوات', 8, 9),
  ('u12', 'تحت ١٢ سنة', 10, 11),
  ('u14', 'تحت ١٤ سنة', 12, 13),
  ('u16', 'تحت ١٦ سنة', 14, 15),
  ('u18', 'تحت ١٨ سنة', 16, 18);
