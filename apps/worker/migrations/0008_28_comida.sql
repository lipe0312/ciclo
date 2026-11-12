-- Ciclo · #28 Comida 2.0: refeição e estimativa por registro, refeições salvas e histórico das metas de calorias.
-- Toda tabela nova tem user_id e chave/índice começando por ele (ADR-0007).

-- kcal/protein = o valor em vigor; kcal_est/protein_est = a estimativa local do momento do registro; source = quem fez o valor em vigor.
ALTER TABLE food_log ADD COLUMN meal TEXT CHECK (meal IS NULL OR meal IN ('cafe', 'almoco', 'lanche', 'jantar', 'ceia'));
ALTER TABLE food_log ADD COLUMN kcal_est REAL CHECK (kcal_est IS NULL OR kcal_est BETWEEN 0 AND 20000);
ALTER TABLE food_log ADD COLUMN protein_est REAL CHECK (protein_est IS NULL OR protein_est BETWEEN 0 AND 1000);
-- manual = 1 quando a PESSOA ajustou kcal/proteína à mão: o Claude não sobrescreve sem `forcar` (ciclo_comida_corrigir).
ALTER TABLE food_log ADD COLUMN manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1));
ALTER TABLE food_log ADD COLUMN source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'claude'));
UPDATE food_log SET source = 'claude' WHERE kcal IS NOT NULL AND confidence IS NOT NULL;

-- Refeições salvas ("marmita", "café padrão"): até 20 por conta (checado na API).
CREATE TABLE meal_template (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  meal TEXT CHECK (meal IS NULL OR meal IN ('cafe', 'almoco', 'lanche', 'jantar', 'ceia')),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  kcal REAL CHECK (kcal IS NULL OR kcal BETWEEN 0 AND 20000),
  protein REAL CHECK (protein IS NULL OR protein BETWEEN 0 AND 1000),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Cada ajuste semanal da meta de calorias e o motivo ("por que mudou").
CREATE TABLE diet_target_history (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  date TEXT NOT NULL CHECK (length(date) = 10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  kcal_before INTEGER NOT NULL CHECK (kcal_before BETWEEN 800 AND 8000),
  kcal_after INTEGER NOT NULL CHECK (kcal_after BETWEEN 800 AND 8000),
  adjust INTEGER NOT NULL CHECK (adjust BETWEEN -150 AND 150), -- teto semanal do ajuste
  tdee INTEGER CHECK (tdee IS NULL OR tdee BETWEEN 800 AND 8000),
  trend_kg_week REAL CHECK (trend_kg_week IS NULL OR trend_kg_week BETWEEN -5 AND 5),
  code TEXT NOT NULL CHECK (code IN ('ok', 'dentro', 'cintura')), -- 'sem_dados' nunca é gravado
  reason TEXT NOT NULL CHECK (length(reason) <= 1200),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX diet_target_history_user_date ON diet_target_history(user_id, date);

-- A busca por dia usa (user_id, date) (food_user_date, da 0003).
