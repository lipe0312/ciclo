-- Ciclo · #66 OAuth 2.1 do MCP (conectar = colar a URL no claude.ai e entrar com o Face ID) e interface Cerebro.
-- Só tabelas novas e ADD COLUMN. Segredo nunca fica puro: código, token, refresh e client_secret guardam só o SHA-256 (hex).

-- Cliente registrado pelo registro dinâmico (RFC 7591). Não é dado de pessoa (o claude.ai registra a si mesmo).
-- secret_hash NULL = cliente público (só PKCE). Limpo pelo cron quando fica 30 dias sem conexão ativa.
CREATE TABLE oauth_client (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 64),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  redirect_uris TEXT NOT NULL,
  auth_method TEXT NOT NULL DEFAULT 'none' CHECK (auth_method IN ('none', 'client_secret_post', 'client_secret_basic')),
  secret_hash TEXT CHECK (secret_hash IS NULL OR length(secret_hash) = 64),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX oauth_client_created ON oauth_client(created_at);

-- Pedido de autorização esperando a tela de consentimento (10 min). Ainda não tem pessoa: é anterior ao login.
CREATE TABLE oauth_request (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 64),
  client_id TEXT NOT NULL REFERENCES oauth_client(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 128),
  state TEXT CHECK (state IS NULL OR length(state) <= 500),
  resource TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_request_exp ON oauth_request(expires_at);

-- Código de autorização de uso único (5 min), já ligado à pessoa que permitiu. Técnica: não exporta; sai com a conta.
CREATE TABLE oauth_code (
  code_hash TEXT PRIMARY KEY CHECK (length(code_hash) = 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_client(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_code_exp ON oauth_code(expires_at);

-- A conexão OAuth é uma linha de mcp_token (mesma lista "Claude conectado" da Conta, revogável igual à chave manual).
-- kind 'oauth': o hash é do token de acesso (1 h, expires_at) e refresh_hash do refresh (girado a cada uso).
ALTER TABLE mcp_token ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'oauth'));
ALTER TABLE mcp_token ADD COLUMN client_id TEXT;
ALTER TABLE mcp_token ADD COLUMN refresh_hash TEXT CHECK (refresh_hash IS NULL OR length(refresh_hash) = 64);
ALTER TABLE mcp_token ADD COLUMN expires_at INTEGER;
CREATE UNIQUE INDEX mcp_token_refresh ON mcp_token(refresh_hash) WHERE refresh_hash IS NOT NULL;

-- Quem respondeu cada pedido da caixa: regra (sem IA), claude-assinatura (conector/rotina) ou openai-api (opcional).
ALTER TABLE inbox ADD COLUMN cerebro TEXT CHECK (cerebro IS NULL OR cerebro IN ('regra', 'claude-assinatura', 'openai-api'));

-- Gasto da API paga (opcional, chave do dono) por mês UTC, em micro-dólares. Teto: OPENAI_MAX_USD. Sem dado pessoal.
CREATE TABLE cerebro_gasto (
  mes TEXT PRIMARY KEY CHECK (length(mes) = 7),
  usd_micro INTEGER NOT NULL DEFAULT 0,
  chamadas INTEGER NOT NULL DEFAULT 0
);
