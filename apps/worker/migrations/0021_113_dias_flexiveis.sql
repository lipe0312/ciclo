-- Ciclo · #113 Dias de treino flexíveis: "empurrar treino" pelo MCP é escrita destrutiva (prévia → confirmar).
-- O CHECK de mcp_previa.kind ganha 'semana_empurrar'. SQLite não altera CHECK: recria a tabela. Prévias valem 15 min
-- e são de uso único: as vivas no momento do deploy se perdem (a IA simula de novo). Chave e índice iguais aos da #81.
DROP TABLE mcp_previa;
CREATE TABLE mcp_previa (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  kind TEXT NOT NULL CHECK (kind IN ('comida_registrar', 'comida_corrigir', 'comida_desfazer', 'semana_gerar', 'semana_empurrar')),
  payload TEXT NOT NULL CHECK (length(payload) <= 32000),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  result TEXT CHECK (result IS NULL OR length(result) <= 32000),
  PRIMARY KEY (user_id, token_hash)
);
CREATE INDEX mcp_previa_exp ON mcp_previa(expires_at);
