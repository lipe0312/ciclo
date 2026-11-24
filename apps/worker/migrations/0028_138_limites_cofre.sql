-- Ciclo · #138 Cofre de chaves (ADR-0015): limites de gasto blindados e aceite do aviso de chave grátis no servidor.
-- Nada de segredo aqui: só tetos (centavos de US$), datas e motivos curtos.
-- 1) Subida de teto pendente (vale 24 h depois; uma baixa cancela), pausa do disjuntor e o aceite do aviso grátis.
ALTER TABLE chave_ia ADD COLUMN teto_dia_pend INTEGER CHECK (teto_dia_pend IS NULL OR teto_dia_pend BETWEEN 1 AND 10000);
ALTER TABLE chave_ia ADD COLUMN teto_mes_pend INTEGER CHECK (teto_mes_pend IS NULL OR teto_mes_pend BETWEEN 1 AND 10000);
ALTER TABLE chave_ia ADD COLUMN pend_vale_em INTEGER;
ALTER TABLE chave_ia ADD COLUMN pausada_em INTEGER;
ALTER TABLE chave_ia ADD COLUMN pausa_motivo TEXT CHECK (pausa_motivo IS NULL OR pausa_motivo IN ('gasto_10min', 'rajada'));
ALTER TABLE chave_ia ADD COLUMN aviso_gratis_em INTEGER;

-- 2) Teto global da conta (soma de todas as chaves por dia e por mês, fixo no core): índice para a soma da conta
--    que a reserva atômica confere junto com o teto da chave.
CREATE INDEX chave_ia_uso_conta ON chave_ia_uso(user_id, dia);

-- 3) Disjuntor de velocidade: uma linha por chamada na janela de 10 min (apagada ao passar da janela). Sem texto.
CREATE TABLE chave_ia_chamada (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  chave_id TEXT NOT NULL,
  em INTEGER NOT NULL,
  usd_micro INTEGER NOT NULL DEFAULT 0 CHECK (usd_micro >= 0)
);
CREATE INDEX chave_ia_chamada_janela ON chave_ia_chamada(user_id, chave_id, em);

-- 4) Trilha: tipos novos (subida pedida/aplicada/cancelada, teto baixado, pausa e reativação, aviso aceito).
--    O SQLite não altera um CHECK: a tabela é refeita com as mesmas colunas e os ids preservados (padrão da 0024).
CREATE TABLE chave_ia_evento_138 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  chave_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('criada', 'validada', 'trocada', 'desativada', 'ativada', 'falhou', 'teto', 'apagada',
    'subida_pedida', 'subida_aplicada', 'subida_cancelada', 'teto_baixado', 'pausada', 'reativada', 'aviso_aceito')),
  codigo TEXT CHECK (codigo IS NULL OR length(codigo) <= 40),
  criado_em INTEGER NOT NULL
);
INSERT INTO chave_ia_evento_138 (id, user_id, chave_id, tipo, codigo, criado_em) SELECT id, user_id, chave_id, tipo, codigo, criado_em FROM chave_ia_evento;
DROP TABLE chave_ia_evento;
ALTER TABLE chave_ia_evento_138 RENAME TO chave_ia_evento;
CREATE INDEX chave_ia_evento_user ON chave_ia_evento(user_id, criado_em);
