-- Ciclo · schema inicial (Cloudflare D1 / SQLite). Datas de calendário em TEXT YYYY-MM-DD (America/Sao_Paulo);
-- instantes em INTEGER (epoch ms). JSON em TEXT, validado na API antes de gravar.
PRAGMA foreign_keys = ON;

CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE profile_history (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE gym (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  equipment TEXT NOT NULL DEFAULT '[]',
  busy_hours TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Treino do dia gerado (core) ou salvo pelo Claude / edição manual
CREATE TABLE day_plan (
  date TEXT PRIMARY KEY,
  gym_id TEXT REFERENCES gym(id),
  input TEXT,
  plan TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('core', 'claude', 'manual')),
  created_at INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  gym_id TEXT REFERENCES gym(id),
  plan TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  closed_by TEXT CHECK (closed_by IN ('usuario', 'auto')),
  feedback TEXT
);
CREATE INDEX session_date ON session(date);
CREATE INDEX session_open ON session(finished_at) WHERE finished_at IS NULL;

CREATE TABLE set_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  muscle TEXT NOT NULL,
  set_no INTEGER NOT NULL,
  kg REAL,
  reps INTEGER,
  rir INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (session_id, exercise_id, set_no)
);
CREATE INDEX set_log_exercise ON set_log(exercise_id, created_at);

CREATE TABLE exercise_skip (
  session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, exercise_id)
);

CREATE TABLE attendance (
  date TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('fui', 'nao_fui', 'folga')),
  reason TEXT,
  source TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE checkin (
  date TEXT PRIMARY KEY,
  sleep_h INTEGER CHECK (sleep_h BETWEEN 5 AND 9),
  energy INTEGER CHECK (energy BETWEEN 1 AND 3),
  soreness INTEGER CHECK (soreness BETWEEN 0 AND 2),
  stress INTEGER CHECK (stress BETWEEN 1 AND 3),
  food INTEGER CHECK (food BETWEEN -1 AND 1),
  weight_kg REAL CHECK (weight_kg IS NULL OR weight_kg BETWEEN 30 AND 250),
  note TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE pain (
  id TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 3),
  kind TEXT,
  context TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX pain_open ON pain(resolved_at) WHERE resolved_at IS NULL;

CREATE TABLE inbox (
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
CREATE INDEX inbox_status ON inbox(status, created_at);

CREATE TABLE plan_edit (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  edit TEXT NOT NULL,
  issues TEXT,
  review TEXT NOT NULL DEFAULT 'pendente' CHECK (review IN ('pendente', 'ok', 'ajustar')),
  review_note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE food_log (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  items TEXT,
  kcal REAL,
  protein REAL,
  confidence TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX food_date ON food_log(date);

CREATE TABLE measurement (
  date TEXT PRIMARY KEY,
  arm_cm REAL CHECK (arm_cm IS NULL OR arm_cm BETWEEN 15 AND 70),
  waist_cm REAL CHECK (waist_cm IS NULL OR waist_cm BETWEEN 40 AND 200),
  shoulder_cm REAL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('foto', 'video')),
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  equipment_id TEXT,
  exercise_id TEXT,
  gym_id TEXT REFERENCES gym(id),
  note TEXT,
  setup TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX media_target ON media(exercise_id, equipment_id);
