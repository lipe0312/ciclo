-- Ciclo · #115 Médias de comida com refeições não registradas, personalizáveis por refeição.
-- comida_medias = as regras da pessoa (Comida > Configurações de métricas), em JSON pequeno validado no core
-- ({"completar":{"cafe":true,…},"diaVazio":"fora"|"zero"}); NULL = o padrão (café, almoço e jantar completados; dia vazio fora).
ALTER TABLE ui_pref ADD COLUMN comida_medias TEXT CHECK (comida_medias IS NULL OR (length(comida_medias) <= 300 AND json_valid(comida_medias)));

-- "Não comi" (não tomei café / não almocei / não lanchei): conta 0 de verdade e nunca é completado pela média.
-- Uma linha por dia e refeição da conta (PRIMARY KEY começa por user_id, ADR-0007). Registro na refeição vence a marca.
CREATE TABLE food_nao_comi (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (length(date) = 10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  meal TEXT NOT NULL CHECK (meal IN ('cafe', 'almoco', 'lanche', 'jantar', 'ceia')),
  via TEXT CHECK (via IS NULL OR via IN ('mcp')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date, meal)
);
