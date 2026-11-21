-- Ciclo · #88 Chaves de API próprias (BYOK), ADR-0015: cofre cifrado em envelope.
-- A chave NUNCA fica em claro: ciphertext = AES-256-GCM com uma DEK aleatória (iv de 12 bytes, AAD user_id|provedor|id);
-- dek_cifrada = a DEK embrulhada pela KEK do Worker (secret KEK_V<kek_versao>, fora do D1). Tudo em base64.
-- Export da conta leva só os metadados (nunca ciphertext, iv nem dek_cifrada). Apagar a conta apaga as três tabelas.
CREATE TABLE chave_ia (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 8 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provedor TEXT NOT NULL CHECK (provedor IN ('anthropic', 'openai', 'gemini')),
  apelido TEXT NOT NULL CHECK (length(apelido) BETWEEN 1 AND 40),
  ultimos4 TEXT NOT NULL CHECK (length(ultimos4) = 4),
  impressao TEXT NOT NULL CHECK (length(impressao) = 12),
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  dek_cifrada TEXT NOT NULL,
  kek_versao INTEGER NOT NULL CHECK (kek_versao BETWEEN 1 AND 9),
  modelos_json TEXT NOT NULL DEFAULT '[]',
  modelo TEXT CHECK (modelo IS NULL OR length(modelo) <= 80),
  esforco TEXT NOT NULL DEFAULT 'medio' CHECK (esforco IN ('baixo', 'medio', 'alto')),
  teto_dia INTEGER NOT NULL,  -- centavos de US$
  teto_mes INTEGER NOT NULL,  -- centavos de US$
  criado_em INTEGER NOT NULL,
  usado_em INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  CHECK (teto_dia >= 1 AND teto_mes >= teto_dia AND teto_mes <= 10000)
);
CREATE INDEX chave_ia_user ON chave_ia(user_id, provedor);

-- Gasto e uso por chave e dia UTC (micro-dólares e tokens): o teto do dia/mês é reservado aqui antes de cada chamada.
CREATE TABLE chave_ia_uso (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  chave_id TEXT NOT NULL,
  dia TEXT NOT NULL CHECK (length(dia) = 10),
  usd_micro INTEGER NOT NULL DEFAULT 0,
  chamadas INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  CHECK (usd_micro >= 0 AND chamadas >= 0 AND tokens_in >= 0 AND tokens_out >= 0),
  PRIMARY KEY (user_id, chave_id, dia)
);

-- Trilha de auditoria sem segredo: só o tipo do evento, o código (HTTP ou motivo curto) e a data.
CREATE TABLE chave_ia_evento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  chave_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('criada', 'validada', 'trocada', 'desativada', 'ativada', 'falhou', 'teto', 'apagada')),
  codigo TEXT CHECK (codigo IS NULL OR length(codigo) <= 40),
  criado_em INTEGER NOT NULL
);
CREATE INDEX chave_ia_evento_user ON chave_ia_evento(user_id, criado_em);
