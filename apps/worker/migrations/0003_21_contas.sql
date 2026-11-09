-- Ciclo · #21 contas e isolamento. Pré-deploy: nada em produção, então as tabelas de dados são RECRIADAS
-- (sem cópia) com user_id NOT NULL, chaves e índices começando por user_id. O banco nasce vazio; o catálogo é código.
-- Ordem: filhas antes das mães (o D1 aplica foreign keys).
PRAGMA defer_foreign_keys = true;

DROP TABLE IF EXISTS set_log;
DROP TABLE IF EXISTS exercise_skip;
DROP TABLE IF EXISTS media;
DROP TABLE IF EXISTS day_plan;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS checkin;
DROP TABLE IF EXISTS pain;
DROP TABLE IF EXISTS inbox;
DROP TABLE IF EXISTS plan_edit;
DROP TABLE IF EXISTS food_log;
DROP TABLE IF EXISTS measurement;
DROP TABLE IF EXISTS gym;
DROP TABLE IF EXISTS profile_history;
DROP TABLE IF EXISTS profile;

-- Conta: criada no primeiro acesso (e-mail do Cloudflare Access ou usuário de dev em localhost).
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  onboarding_done_at INTEGER,
  deleted_at INTEGER -- reservado (carência futura); hoje apagar a conta remove a linha
);

-- Token do Claude (connector). Guarda só o hash SHA-256 (hex) do token inteiro; o valor aparece uma vez.
CREATE TABLE mcp_token (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  hash TEXT NOT NULL UNIQUE CHECK (length(hash) = 64),
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX mcp_token_user ON mcp_token(user_id, created_at);

-- Limite de requisições por usuário (janela fixa). Ver ADR-0007.
CREATE TABLE rate_limit (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, bucket)
);

CREATE TABLE profile (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE profile_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX profile_history_user ON profile_history(user_id, created_at);

CREATE TABLE gym (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT '[]',
  busy_hours TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- gym_id é referência leve (texto): sempre resolvida dentro da conta (user_id) ao ler.
CREATE TABLE day_plan (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  gym_id TEXT,
  input TEXT,
  plan TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('core', 'claude', 'manual')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

-- id gerado no aparelho (UUID): a chave é (user_id, id) para um id de outra conta nunca colidir.
CREATE TABLE session (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  gym_id TEXT,
  plan TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  closed_by TEXT CHECK (closed_by IN ('usuario', 'auto')),
  feedback TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX session_user_date ON session(user_id, date, started_at);
CREATE INDEX session_open ON session(finished_at) WHERE finished_at IS NULL;

CREATE TABLE set_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  muscle TEXT NOT NULL,
  set_no INTEGER NOT NULL,
  kg REAL,
  reps INTEGER,
  rir INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, session_id, exercise_id, set_no),
  FOREIGN KEY (user_id, session_id) REFERENCES session(user_id, id) ON DELETE CASCADE
);
CREATE INDEX set_log_user_exercise ON set_log(user_id, exercise_id, created_at);

CREATE TABLE exercise_skip (
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, session_id, exercise_id),
  FOREIGN KEY (user_id, session_id) REFERENCES session(user_id, id) ON DELETE CASCADE
);

CREATE TABLE attendance (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('fui', 'nao_fui', 'folga')),
  reason TEXT,
  source TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE checkin (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  sleep_h INTEGER NOT NULL CHECK (sleep_h BETWEEN 5 AND 9),
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 3),
  soreness INTEGER NOT NULL CHECK (soreness BETWEEN 0 AND 2),
  stress INTEGER NOT NULL CHECK (stress BETWEEN 1 AND 3),
  food INTEGER NOT NULL CHECK (food BETWEEN -1 AND 1),
  weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg BETWEEN 30 AND 250),
  note TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE pain (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 3),
  kind TEXT,
  context TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX pain_user_open ON pain(user_id, region) WHERE resolved_at IS NULL;

CREATE TABLE inbox (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  text TEXT NOT NULL,
  action TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('haiku', 'sonnet', 'opus')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'respondido', 'aplicado', 'descartado')),
  response TEXT,
  change TEXT,
  answered_at INTEGER
);
CREATE INDEX inbox_user ON inbox(user_id, created_at);
CREATE INDEX inbox_user_status ON inbox(user_id, status, created_at);

CREATE TABLE plan_edit (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  edit TEXT NOT NULL,
  issues TEXT,
  review TEXT NOT NULL DEFAULT 'pendente' CHECK (review IN ('pendente', 'ok', 'ajustar')),
  review_note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX plan_edit_user_review ON plan_edit(user_id, review, created_at);

CREATE TABLE food_log (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  items TEXT,
  kcal REAL CHECK (kcal IS NULL OR kcal BETWEEN 0 AND 20000),
  protein REAL CHECK (protein IS NULL OR protein BETWEEN 0 AND 1000),
  confidence TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX food_user_date ON food_log(user_id, date);

CREATE TABLE measurement (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  arm_cm REAL CHECK (arm_cm IS NULL OR arm_cm BETWEEN 15 AND 70),
  waist_cm REAL CHECK (waist_cm IS NULL OR waist_cm BETWEEN 40 AND 200),
  shoulder_cm REAL CHECK (shoulder_cm IS NULL OR shoulder_cm BETWEEN 60 AND 200),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

-- r2_key sempre com o prefixo u/<user_id>/ (apagar a conta remove o prefixo inteiro do R2).
CREATE TABLE media (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('foto', 'video')),
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  equipment_id TEXT,
  exercise_id TEXT,
  gym_id TEXT,
  note TEXT,
  setup TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX media_user_target ON media(user_id, exercise_id, equipment_id);
CREATE INDEX media_user_created ON media(user_id, created_at);
