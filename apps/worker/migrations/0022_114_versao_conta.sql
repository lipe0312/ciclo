-- Ciclo · #114 Versão da conta: um contador por conta que sobe a cada escrita (app ou MCP). O app compara com a que já viu
-- e, se mudou, busca os dados de novo (sem fechar o app). Só um número: nenhum dado pessoal aqui.
CREATE TABLE conta_versao (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL
);
