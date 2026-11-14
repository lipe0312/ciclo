-- Ciclo · #54 Conta própria: passkey (WebAuthn), convite, teto de contas, sessão de 90 dias e códigos de recuperação.
-- Só ADD COLUMN e tabelas novas (nada é recriado: os dados de quem já usa o app pelo Cloudflare Access continuam).
-- Segredo nunca fica puro aqui: sessão, convite e código de recuperação guardam só o SHA-256 (hex).
-- Toda tabela tem user_id e entra na exclusão LGPD (USER_TABLES em db.ts). "sessions" = sessão de LOGIN
-- (não confundir com "session", que é a sessão de treino).

-- Papel e nome exibido. Conta criada por passkey não tem e-mail: o e-mail vira um identificador interno
-- (p-<id>@passkey.invalid), nunca mostrado. Só um owner (índice parcial único): o bootstrap fecha sozinho.
ALTER TABLE user ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'user'));
ALTER TABLE user ADD COLUMN name TEXT CHECK (name IS NULL OR length(name) BETWEEN 1 AND 40);
CREATE UNIQUE INDEX user_one_owner ON user(role) WHERE role = 'owner';

-- Passkeys: id = credential id (base64url); public_key = JWK (JSON) ES256/RS256; counter contra clone.
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 1400),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  alg TEXT NOT NULL CHECK (alg IN ('ES256', 'RS256')),
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  synced INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkeys_user ON passkeys(user_id, created_at);

-- Sessão de login (cookie __Host-ciclo): id_hash = SHA-256 do valor do cookie; id = identificador público (lista de aparelhos).
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY CHECK (length(id_hash) = 64),
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  user_agent TEXT CHECK (user_agent IS NULL OR length(user_agent) <= 300),
  via TEXT NOT NULL CHECK (via IN ('passkey', 'recuperacao'))
);
CREATE INDEX sessions_user ON sessions(user_id, created_at);

-- Convite de uso único (7 dias). user_id NULL = conta nova; user_id preenchido = "resetar acesso" daquela conta.
CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY CHECK (length(code_hash) = 64),
  id TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  email TEXT CHECK (email IS NULL OR (email = lower(email) AND length(email) BETWEEN 3 AND 254)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  used_at INTEGER
);
CREATE INDEX invites_created_by ON invites(created_by, created_at);

-- 8 códigos de recuperação por conta (mostrados uma vez). code_hash único: o login por código acha a conta pelo hash.
CREATE TABLE recovery_codes (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE CHECK (length(code_hash) = 64),
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX recovery_codes_user ON recovery_codes(user_id);

-- Desafio WebAuthn de uso único (5 min). data = JSON da cerimônia (nome, convite, id da conta nova). Técnica: não exporta.
CREATE TABLE auth_challenge (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('login', 'registro')),
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_challenge_exp ON auth_challenge(expires_at);

-- Limite de tentativas em /auth/* por origem (hash do IP, janela fixa). Sem dado de conta.
CREATE TABLE auth_rate_limit (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
