-- Ciclo · #134 Histórico do Chat: conversas por conta e as mensagens de cada uma. Só tabelas novas.
-- Chave começando por user_id (ADR-0007); apagar a conversa apaga as mensagens (mesma conta) e as duas entram no apagar
-- da conta (USER_TABLES) e no export. O texto é dado do usuário: a tela mostra como texto, nunca como HTML.
CREATE TABLE conversa (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(id) BETWEEN 8 AND 64),
  titulo TEXT NOT NULL CHECK (length(titulo) BETWEEN 1 AND 60),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX conversa_recente ON conversa(user_id, updated_at);

CREATE TABLE conversa_msg (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  conversa_id TEXT NOT NULL,
  id TEXT NOT NULL CHECK (length(id) BETWEEN 8 AND 64),
  -- usuario = a pessoa; aviso = nota do app (virou pedido, sem IA); ia = resposta da IA (#89)
  papel TEXT NOT NULL CHECK (papel IN ('usuario', 'aviso', 'ia')),
  texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 4000),
  -- o pedido da rotina que esta mensagem gerou (inbox.id), quando houver
  pedido_id TEXT CHECK (pedido_id IS NULL OR length(pedido_id) <= 64),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, conversa_id, id),
  FOREIGN KEY (user_id, conversa_id) REFERENCES conversa(user_id, id) ON DELETE CASCADE
);
CREATE INDEX conversa_msg_ordem ON conversa_msg(user_id, conversa_id, created_at);
