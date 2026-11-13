-- Ciclo · #43 Comida 3.0: base de alimentos pessoal.
-- Cada alimento comum que a pessoa registra (ou ajusta) vira uma linha aqui, com macros por 100 g e unidades caseiras.
-- A linha vence a base comum (TACO) nos PRÓXIMOS registros; registros antigos guardam os próprios números em food_log.
-- Toda tabela nova tem user_id e chave começando por ele (ADR-0007). Até 200 itens por conta (checado na API, atômico).
CREATE TABLE food_item (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 40 AND key NOT GLOB '*[^a-z0-9-]*'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  kcal REAL NOT NULL CHECK (kcal BETWEEN 0 AND 900),     -- por 100 g
  protein REAL NOT NULL CHECK (protein BETWEEN 0 AND 100),
  carb REAL NOT NULL CHECK (carb BETWEEN 0 AND 100),
  fat REAL NOT NULL CHECK (fat BETWEEN 0 AND 100),
  -- unidades caseiras: [{"nome":"ovo","g":50}, …], 1 a 6
  units TEXT NOT NULL CHECK (length(units) <= 1000 AND json_valid(units) AND json_type(units) = 'array' AND json_array_length(units) BETWEEN 1 AND 6),
  source TEXT NOT NULL CHECK (source IN ('taco', 'rotulo', 'usuario')), -- usuario = a pessoa ajustou
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  last_used_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
