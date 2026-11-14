-- #56 Proteção contra abuso e custo. Tabelas técnicas: sem dado pessoal, não exportam.

-- Falhas seguidas em /auth/* por origem (HMAC do IP com AUTH_PEPPER, nunca o IP). 10 seguidas → bloqueio de 15 min.
CREATE TABLE auth_falhas (
  key TEXT PRIMARY KEY,
  falhas INTEGER NOT NULL DEFAULT 0,
  ate INTEGER,
  updated_at INTEGER NOT NULL
);

-- Uso do app inteiro por dia UTC (cota global do plano grátis): escritas na API/MCP e bytes enviados ao R2.
CREATE TABLE uso_dia (
  dia TEXT PRIMARY KEY,
  escritas INTEGER NOT NULL DEFAULT 0,
  r2_bytes INTEGER NOT NULL DEFAULT 0
);
