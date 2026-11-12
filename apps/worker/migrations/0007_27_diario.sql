-- Ciclo · #27 Diário: checkout da noite (todo dia, com ou sem academia), exames e estado do lembrete.
-- Toda tabela nova tem user_id e chave/índice começando por ele (ADR-0007). Dado de saúde: nunca em log.

-- Checkout da noite. Booleanos em 0/1; NULL = não informado. cardio_json: {type, minutes, steps, intensity}
-- (o cardio com tipo e minutos também vira o registro "ck-<date>" em cardio_log, para somar no resumo da semana).
CREATE TABLE checkout (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (length(date) = 10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  trained INTEGER CHECK (trained IS NULL OR trained IN (0, 1)),
  cardio_json TEXT CHECK (cardio_json IS NULL OR (json_valid(cardio_json) AND length(cardio_json) <= 300)),
  water_ml INTEGER CHECK (water_ml IS NULL OR water_ml BETWEEN 0 AND 10000),
  alcohol_units INTEGER CHECK (alcohol_units IS NULL OR alcohol_units BETWEEN 0 AND 30),
  smoke INTEGER CHECK (smoke IS NULL OR smoke IN (0, 1)),
  smoke_qty INTEGER CHECK (smoke_qty IS NULL OR smoke_qty BETWEEN 1 AND 100),
  caffeine_late INTEGER CHECK (caffeine_late IS NULL OR caffeine_late IN (0, 1)),
  mood INTEGER CHECK (mood IS NULL OR mood BETWEEN 1 AND 5),
  sleep_ok INTEGER CHECK (sleep_ok IS NULL OR sleep_ok IN (0, 1)), -- "dormiu bem?" do resumo dos dias sem abrir
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  source TEXT NOT NULL CHECK (source IN ('app', 'resumo', 'claude')), -- 'claude' = o app mostra "confira"
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

-- Exame: o texto extraído (PDF lido no aparelho, ou colado) fica só até a análise do Claude, no máx. 7 dias.
-- ciclo_exame_concluir grava o resumo e apaga raw_text; o cron apaga raw_text vencido (expires_at). O arquivo nunca vai ao R2.
CREATE TABLE health_exam (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  created_at INTEGER NOT NULL,
  raw_text TEXT CHECK (raw_text IS NULL OR length(raw_text) BETWEEN 1 AND 60000),
  expires_at INTEGER NOT NULL,
  analyzed_at INTEGER,
  summary_json TEXT CHECK (summary_json IS NULL OR (json_valid(summary_json) AND length(summary_json) <= 16000)),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'analisado', 'expirado')),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX health_exam_user ON health_exam(user_id, created_at);
CREATE INDEX health_exam_expiry ON health_exam(expires_at) WHERE raw_text IS NOT NULL;

-- Lembrete sem modal: última abertura (dias sem abrir), "mais tarde" do dia e o resumo pendente dos dias faltantes.
CREATE TABLE reminder_state (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  last_open TEXT CHECK (last_open IS NULL OR length(last_open) = 10),
  snoozed_on TEXT CHECK (snoozed_on IS NULL OR length(snoozed_on) = 10),
  absence_days INTEGER NOT NULL DEFAULT 2 CHECK (absence_days BETWEEN 1 AND 14),
  absence_from TEXT CHECK (absence_from IS NULL OR length(absence_from) = 10),
  absence_to TEXT CHECK (absence_to IS NULL OR length(absence_to) = 10),
  updated_at INTEGER NOT NULL
);
