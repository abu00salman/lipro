-- Lipro Academy Manager — schema v1 (Phase 0 + Phase 1)
-- Money is stored as INTEGER halalas (1 SAR = 100 halalas). Never store floats.
-- Apply with: wrangler d1 migrations apply lipro-db --remote   (after a backup)

PRAGMA foreign_keys = ON;

CREATE TABLE branches (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE programs (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  duration_label TEXT NOT NULL,
  price_halala   INTEGER NOT NULL CHECK (price_halala > 0),
  description    TEXT NOT NULL DEFAULT '',
  badge          TEXT NOT NULL DEFAULT '',
  includes_json  TEXT NOT NULL DEFAULT '[]',
  vat_included   INTEGER NOT NULL DEFAULT 1 CHECK (vat_included IN (0, 1)),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One guardian (ولي أمر) can have several children: players point to a guardian.
CREATE TABLE guardians (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name   TEXT NOT NULL,
  mobile      TEXT NOT NULL UNIQUE CHECK (mobile GLOB '05[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  email       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE players (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guardian_id  INTEGER NOT NULL REFERENCES guardians(id),
  branch_id    TEXT NOT NULL REFERENCES branches(id),
  full_name    TEXT NOT NULL,
  dob          TEXT NOT NULL,                       -- YYYY-MM-DD
  gender       TEXT,
  nationality  TEXT,
  school       TEXT,
  position     TEXT,
  jersey_size  TEXT,
  experience   TEXT,
  status       TEXT NOT NULL DEFAULT 'registered'
               CHECK (status IN ('registered', 'active', 'frozen', 'ended')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_players_branch ON players(branch_id, status);
CREATE INDEX idx_players_guardian ON players(guardian_id);

CREATE TABLE registrations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_no   TEXT NOT NULL UNIQUE,            -- LPA-YYYY-XXXXX (public reference)
  idempotency_key   TEXT NOT NULL UNIQUE,
  request_hash      TEXT NOT NULL,                   -- SHA-256 of canonical payload
  player_id         INTEGER NOT NULL REFERENCES players(id),
  guardian_id       INTEGER NOT NULL REFERENCES guardians(id),
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  program_id        TEXT NOT NULL REFERENCES programs(id),
  amount_halala     INTEGER NOT NULL CHECK (amount_halala > 0),   -- snapshot of price at signup
  status            TEXT NOT NULL DEFAULT 'awaiting_payment'
                    CHECK (status IN ('awaiting_payment', 'payment_claimed', 'paid', 'cancelled')),
  consent_version   TEXT NOT NULL,                   -- guardian consent (PDPL / minors)
  consent_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_reg_branch_created ON registrations(branch_id, created_at);
CREATE INDEX idx_reg_status ON registrations(status);

-- Bank transfers are NEVER counted as money until an accountant reconciles them
-- against the bank statement (status 'approved'). A receipt image alone is not proof.
CREATE TABLE payments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id   INTEGER NOT NULL REFERENCES registrations(id),
  method            TEXT NOT NULL CHECK (method IN ('bank_transfer', 'cash', 'card')),
  amount_halala     INTEGER NOT NULL CHECK (amount_halala > 0),
  bank_reference    TEXT,                            -- as claimed by the guardian
  transfer_date     TEXT,                            -- YYYY-MM-DD as claimed
  status            TEXT NOT NULL DEFAULT 'claimed'
                    CHECK (status IN ('claimed', 'approved', 'rejected')),
  reconciled_ref    TEXT,                            -- entered by accountant from bank statement
  reconciled_halala INTEGER,
  reviewed_by       INTEGER REFERENCES users(id),
  reviewed_at       TEXT,
  review_note       TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (method, bank_reference)
);
CREATE INDEX idx_payments_status ON payments(status);

-- Staff accounts. Passwords: PBKDF2-SHA256. TOTP secret encrypted with AES-GCM.
CREATE TABLE users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name         TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN (
                      'owner', 'admin', 'accountant', 'branch_manager',
                      'registration', 'coach', 'guardian', 'auditor')),
  branch_id         TEXT REFERENCES branches(id),    -- NULL = all branches (owner/admin/accountant/auditor)
  password_hash     TEXT NOT NULL,
  totp_secret_enc   TEXT,                            -- base64(iv || ciphertext)
  mfa_enabled       INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
  last_totp_step    INTEGER NOT NULL DEFAULT -1,     -- replay protection
  failed_logins     INTEGER NOT NULL DEFAULT 0,
  locked_until      TEXT,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Only SHA-256 hashes of session tokens are stored, never the token itself.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id     INTEGER REFERENCES users(id),        -- NULL for public/system actions
  action       TEXT NOT NULL,
  entity       TEXT NOT NULL,
  entity_id    TEXT,
  branch_id    TEXT,
  meta_json    TEXT NOT NULL DEFAULT '{}',          -- never raw PII, never secrets
  ip_hash      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- Fixed-window rate limits. Keys are hashed identifiers, not raw IPs.
CREATE TABLE rate_limits (
  bucket   TEXT NOT NULL,
  window   INTEGER NOT NULL,
  hits     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window)
);

-- Seed: the six branches and four programs already published on the public site.
INSERT INTO branches (id, name) VALUES
  ('jizan',  'ليبرو جيزان'),
  ('bish',   'ليبرو بيش'),
  ('khamis', 'ليبرو خميس مشيط'),
  ('madaya', 'ليبرو المضايا'),
  ('mataan', 'ليبرو المطعن'),
  ('aliyah', 'ليبرو العالية');

INSERT INTO programs (id, name, duration_label, price_halala, description, badge, includes_json) VALUES
  ('monthly', 'اشتراك شهري', 'شهر واحد', 30000,
   'لتسجيل لاعب جديد — تدريب ٣ أيام في الأسبوع لمدة شهر كامل، مع متابعة فنية وبدنية.',
   'لاعب جديد', '["تدريب ٣ أيام أسبوعيًا","متابعة فنية وبدنية","مباريات داخلية"]'),
  ('renewal', 'تجديد الاشتراك الشهري', 'شهر واحد', 20000,
   'لتجديد اشتراك لاعب مسجَّل سلفًا في الأكاديمية بعد انتهاء شهره الحالي.',
   'لأعضاء الأكاديمية', '["تجديد شهر إضافي","استمرار نفس الفرع والمدرب","بلا رسوم تسجيل جديدة"]'),
  ('quarter', 'اشتراك ٣ شهور', '٣ شهور', 90000,
   'ثلاثة شهور متصلة بسعر أوفر، مع أولوية الترشيح لتجارب الأندية.',
   'الأكثر طلبًا', '["كل مزايا الاشتراك الشهري","أولوية تجارب الأندية","توفير ١٥٠ ريال"]'),
  ('half_year', 'اشتراك ٦ شهور', '٦ شهور', 165000,
   'موسم كامل تقريبًا، يشمل المشاركة في البطولات والمعسكرات.',
   'أفضل قيمة', '["كل مزايا الـ ٣ شهور","مشاركة في البطولات","معسكرات إعدادية"]');
