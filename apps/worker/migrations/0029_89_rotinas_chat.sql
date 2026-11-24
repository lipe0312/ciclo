-- Ciclo · #89 Chat com a chave da pessoa: propostas (toda escrita da IA vira proposta; nada grava antes do Aprovar) e as
-- rotinas do Cron Trigger (liga/desliga, hora de Brasília, provedor do cofre). Só tabelas novas, chave começando por user_id
-- (ADR-0007); as duas entram no apagar da conta (USER_TABLES) e no export. args/previa são JSON validados no Worker e o
-- texto é dado da pessoa (a tela mostra como texto, nunca como HTML).
CREATE TABLE chat_proposta (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(id) BETWEEN 8 AND 64),
  -- de onde veio: uma conversa do Chat ou um pedido da rotina (inbox.id)
  conversa_id TEXT CHECK (conversa_id IS NULL OR length(conversa_id) <= 64),
  pedido_id TEXT CHECK (pedido_id IS NULL OR length(pedido_id) <= 64),
  ferramenta TEXT NOT NULL CHECK (ferramenta IN ('ciclo_salvar_treino_do_dia', 'ciclo_comida_registrar')),
  args TEXT NOT NULL CHECK (length(args) <= 16000),
  previa TEXT NOT NULL CHECK (length(previa) <= 16000),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aplicando', 'aprovada', 'descartada', 'alterada')),
  resultado TEXT CHECK (resultado IS NULL OR length(resultado) <= 16000),
  criado_em INTEGER NOT NULL,
  resolvido_em INTEGER,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX chat_proposta_conversa ON chat_proposta(user_id, conversa_id, criado_em);

CREATE TABLE rotina_chat (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  rotina TEXT NOT NULL CHECK (rotina IN ('revisao', 'pedidos', 'comida')),
  ligada INTEGER NOT NULL DEFAULT 0 CHECK (ligada IN (0, 1)),
  hora INTEGER NOT NULL CHECK (hora BETWEEN 0 AND 23),
  provedor TEXT NOT NULL CHECK (provedor IN ('anthropic', 'openai', 'gemini', 'openrouter', 'deepseek')),
  -- último dia (AAAA-MM-DD, Brasília) em que rodou: uma vez por dia
  ultima_dia TEXT,
  atualizado_em INTEGER NOT NULL,
  PRIMARY KEY (user_id, rotina)
);
CREATE INDEX rotina_chat_hora ON rotina_chat(ligada, hora);
