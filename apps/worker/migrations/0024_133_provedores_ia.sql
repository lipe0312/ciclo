-- Ciclo · #133 Cofre de chaves (ADR-0015): novos provedores openrouter e deepseek (host fixo no core, sem URL do usuário).
-- O SQLite não altera um CHECK: a tabela é refeita com as mesmas colunas e restrições, e só o CHECK do provedor muda.
-- Nada referencia chave_ia (uso e eventos guardam só o id), então trocar a tabela não perde vínculo. Sem transação explícita (D1).
CREATE TABLE chave_ia_133 (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 8 AND 64),
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provedor TEXT NOT NULL CHECK (provedor IN ('anthropic', 'openai', 'gemini', 'openrouter', 'deepseek')),
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
INSERT INTO chave_ia_133 (id, user_id, provedor, apelido, ultimos4, impressao, ciphertext, iv, dek_cifrada, kek_versao, modelos_json, modelo, esforco, teto_dia, teto_mes, criado_em, usado_em, ativo)
  SELECT id, user_id, provedor, apelido, ultimos4, impressao, ciphertext, iv, dek_cifrada, kek_versao, modelos_json, modelo, esforco, teto_dia, teto_mes, criado_em, usado_em, ativo FROM chave_ia;
DROP TABLE chave_ia;
ALTER TABLE chave_ia_133 RENAME TO chave_ia;
CREATE INDEX chave_ia_user ON chave_ia(user_id, provedor);
