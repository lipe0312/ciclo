-- Ciclo · #123 Corrigir séries de um dia pelo MCP (apagar, corrigir, remover exercício, descartar/mesclar sessão duplicada)
-- é escrita destrutiva: prévia → confirmar. O CHECK de mcp_previa.kind ganha 'treino_corrigir'. SQLite não altera CHECK:
-- recria a tabela (como na #113). Prévias valem 15 min e são de uso único: as vivas no deploy se perdem (a IA simula de novo).
DROP TABLE mcp_previa;
CREATE TABLE mcp_previa (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  kind TEXT NOT NULL CHECK (kind IN ('comida_registrar', 'comida_corrigir', 'comida_desfazer', 'semana_gerar', 'semana_empurrar', 'treino_corrigir')),
  payload TEXT NOT NULL CHECK (length(payload) <= 32000),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  result TEXT CHECK (result IS NULL OR length(result) <= 32000),
  PRIMARY KEY (user_id, token_hash)
);
CREATE INDEX mcp_previa_exp ON mcp_previa(expires_at);
