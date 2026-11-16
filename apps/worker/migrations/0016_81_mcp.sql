-- Ciclo · #81 MCP formal: prévias de uso único (simular → confirmar), lote e origem da comida vinda da IA, escopos
-- ler/escrever, status "lido" da caixa e a preferência de aprovação da comida. Só tabela nova e ADD COLUMN.

-- Prévia de uma escrita pelo MCP (registrar/corrigir/desfazer comida, refazer semana treinada). O token só existe como
-- SHA-256; vale 15 min, uso único (used_at) e preso à conta (toda busca filtra user_id). `result` guarda a resposta da
-- confirmação: chamar de novo devolve o mesmo resultado sem gravar de novo (idempotente). O cron apaga as velhas.
CREATE TABLE mcp_previa (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  kind TEXT NOT NULL CHECK (kind IN ('comida_registrar', 'comida_corrigir', 'comida_desfazer', 'semana_gerar')),
  payload TEXT NOT NULL CHECK (length(payload) <= 32000),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  result TEXT CHECK (result IS NULL OR length(result) <= 32000),
  PRIMARY KEY (user_id, token_hash)
);
CREATE INDEX mcp_previa_exp ON mcp_previa(expires_at);

-- Comida que entrou pela IA conectada: o lote (desfazer o último envio) e a origem para o selo "via Chat, 12:40 · ≈ estimativa".
ALTER TABLE food_log ADD COLUMN lote TEXT CHECK (lote IS NULL OR length(lote) BETWEEN 8 AND 64);
ALTER TABLE food_log ADD COLUMN via TEXT CHECK (via IS NULL OR via IN ('mcp'));
CREATE INDEX food_user_lote ON food_log(user_id, lote) WHERE lote IS NOT NULL;

-- Escopos OAuth do token (ler | ler escrever). NULL = token de antes da #81: vale ler + escrever (não quebra quem já conectou).
ALTER TABLE mcp_token ADD COLUMN escopo TEXT CHECK (escopo IS NULL OR escopo IN ('ler', 'ler escrever'));
ALTER TABLE oauth_request ADD COLUMN escopo TEXT CHECK (escopo IS NULL OR escopo IN ('ler', 'ler escrever'));
ALTER TABLE oauth_code ADD COLUMN escopo TEXT CHECK (escopo IS NULL OR escopo IN ('ler', 'ler escrever'));

-- Caixa do Chat: quando a IA leu o pedido (ciclo_chat_pendentes). Status no app: na fila → lido → respondido.
ALTER TABLE inbox ADD COLUMN read_at INTEGER;

-- Comida → Ajustes: subir a comida dita na conversa só com prévia aprovada (sempre, padrão), só perguntar nas dúvidas, ou nunca.
ALTER TABLE ui_pref ADD COLUMN comida_aprovacao TEXT CHECK (comida_aprovacao IS NULL OR comida_aprovacao IN ('sempre', 'so_duvidas', 'nunca'));
