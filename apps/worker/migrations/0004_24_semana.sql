-- Ciclo · #24 semana completa planejada. Tabelas novas (nada é recriado).
-- week_plan: cada geração da semana vira uma versão (desfazer = voltar a uma versão anterior).
-- day_override: escolhas do usuário por dia (trocar geração, mover, trocar, folga, extra), vivas entre versões.

CREATE TABLE week_plan (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL CHECK (length(week_start) = 10),
  version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 10000),
  plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
  source TEXT NOT NULL CHECK (source IN ('auto', 'regenerar', 'ajuste', 'falta', 'extra', 'desfazer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, week_start, version)
);

CREATE TABLE day_override (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (length(date) = 10),
  kind TEXT NOT NULL CHECK (kind IN ('treino', 'folga', 'extra')),
  opts TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(opts)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);
