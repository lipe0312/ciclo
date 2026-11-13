-- Ciclo · #30 Claude no app: memória do Claude, sinal de vida do vigia/rotina e busca no histórico (FTS5).
-- Toda tabela nova tem user_id e chave começando por ele (ADR-0007). Texto livre é dado, não instrução.

-- Fatos que o Claude aprende ("prefere halteres quando a academia lota"). O dono vê, edita e apaga na tela Claude;
-- pelo connector o Claude só ANOTA (não existe ferramenta MCP que apague). expires_at NULL = sem validade.
CREATE TABLE claude_memory (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  fact TEXT NOT NULL CHECK (length(fact) BETWEEN 1 AND 160),
  source TEXT NOT NULL CHECK (source IN ('claude', 'app')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX claude_memory_user ON claude_memory(user_id, created_at);

-- Último sinal de quem processa a caixa: vigia local (Mac, ~30 s), rotina na nuvem (/schedule) ou manual.
-- Alimenta o indicador "online agora" / "na fila · responde em ~N min" e o checklist "Claude ligado".
CREATE TABLE claude_heartbeat (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  origem TEXT NOT NULL CHECK (origem IN ('vigia', 'rotina', 'manual')),
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, origem)
);

-- Busca no histórico (ciclo_buscar): cópia do texto de notas de check-in e checkout, pedidos da caixa, contexto de dor
-- e nome do treino feito. Mantida por gatilhos; sempre consultada com user_id = ?. Acentos ignorados.
-- Atenção: `wrangler d1 export` não exporta tabelas virtuais; a busca é derivada (pode ser refeita pelos INSERTs abaixo).
CREATE VIRTUAL TABLE busca USING fts5(texto, user_id UNINDEXED, fonte UNINDEXED, ref UNINDEXED, date UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');

-- check-in (nota)
CREATE TRIGGER busca_checkin_ai AFTER INSERT ON checkin WHEN NEW.note IS NOT NULL AND NEW.note <> '' BEGIN
  INSERT INTO busca (texto, user_id, fonte, ref, date) VALUES (NEW.note, NEW.user_id, 'checkin', NEW.date, NEW.date);
END;
CREATE TRIGGER busca_checkin_au AFTER UPDATE OF note ON checkin BEGIN
  DELETE FROM busca WHERE user_id = OLD.user_id AND fonte = 'checkin' AND ref = OLD.date;
  INSERT INTO busca (texto, user_id, fonte, ref, date) SELECT NEW.note, NEW.user_id, 'checkin', NEW.date, NEW.date WHERE NEW.note IS NOT NULL AND NEW.note <> '';
END;
CREATE TRIGGER busca_checkin_ad AFTER DELETE ON checkin BEGIN
  DELETE FROM busca WHERE user_id = OLD.user_id AND fonte = 'checkin' AND ref = OLD.date;
END;

-- checkout da noite (nota)
CREATE TRIGGER busca_checkout_ai AFTER INSERT ON checkout WHEN NEW.note IS NOT NULL AND NEW.note <> '' BEGIN
  INSERT INTO busca (texto, user_id, fonte, ref, date) VALUES (NEW.note, NEW.user_id, 'checkout', NEW.date, NEW.date);
END;
CREATE TRIGGER busca_checkout_au AFTER UPDATE OF note ON checkout BEGIN
  DELETE FROM busca WHERE user_id = OLD.user_id AND fonte = 'checkout' AND ref = OLD.date;
  INSERT INTO busca (texto, user_id, fonte, ref, date) SELECT NEW.note, NEW.user_id, 'checkout', NEW.date, NEW.date WHERE NEW.note IS NOT NULL AND NEW.note <> '';
END;
CREATE TRIGGER busca_checkout_ad AFTER DELETE ON checkout BEGIN
  DELETE FROM busca WHERE user_id = OLD.user_id AND fonte = 'checkout' AND ref = OLD.date;
END;

-- pedidos da caixa (texto do pedido)
CREATE TRIGGER busca_inbox_ai AFTER INSERT ON inbox BEGIN
  INSERT INTO busca (texto, user_id, fonte, ref, date) VALUES (NEW.text, NEW.user_id, 'pedido', NEW.id, date(NEW.created_at / 1000, 'unixepoch', '-3 hours'));
END;
CREATE TRIGGER busca_inbox_ad AFTER DELETE ON inbox BEGIN
  DELETE FROM busca WHERE user_id = OLD.user_id AND fonte = 'pedido' AND ref = OLD.id;
END;

-- dor (contexto)
CREATE TRIGGER busca_pain_ai AFTER INSERT ON pain WHEN NEW.context IS NOT NULL AND NEW.context <> '' BEGIN
  INSERT INTO busca (texto, user_id, fonte, ref, date) VALUES (NEW.region || ' ' || NEW.context, NEW.user_id, 'dor', NEW.id, date(NEW.created_at / 1000, 'unixepoch', '-3 hours'));
END;
CREATE TRIGGER busca_pain_au AFTER UPDATE OF context ON pain BEGIN
  DELETE FROM busca WHERE user_id = OLD.user_id AND fonte = 'dor' AND ref = OLD.id;
  INSERT INTO busca (texto, user_id, fonte, ref, date) SELECT NEW.region || ' ' || NEW.context, NEW.user_id, 'dor', NEW.id, date(NEW.created_at / 1000, 'unixepoch', '-3 hours') WHERE NEW.context IS NOT NULL AND NEW.context <> '';
END;
CREATE TRIGGER busca_pain_ad AFTER DELETE ON pain BEGIN
  DELETE FROM busca WHERE user_id = OLD.user_id AND fonte = 'dor' AND ref = OLD.id;
END;

-- treino feito (nome do treino da sessão)
CREATE TRIGGER busca_session_ai AFTER INSERT ON session WHEN json_valid(NEW.plan) AND json_extract(NEW.plan, '$.name') IS NOT NULL BEGIN
  INSERT INTO busca (texto, user_id, fonte, ref, date) VALUES (json_extract(NEW.plan, '$.name'), NEW.user_id, 'treino', NEW.id, NEW.date);
END;
CREATE TRIGGER busca_session_ad AFTER DELETE ON session BEGIN
  DELETE FROM busca WHERE user_id = OLD.user_id AND fonte = 'treino' AND ref = OLD.id;
END;

-- o que já existe entra na busca
INSERT INTO busca (texto, user_id, fonte, ref, date) SELECT note, user_id, 'checkin', date, date FROM checkin WHERE note IS NOT NULL AND note <> '';
INSERT INTO busca (texto, user_id, fonte, ref, date) SELECT note, user_id, 'checkout', date, date FROM checkout WHERE note IS NOT NULL AND note <> '';
INSERT INTO busca (texto, user_id, fonte, ref, date) SELECT text, user_id, 'pedido', id, date(created_at / 1000, 'unixepoch', '-3 hours') FROM inbox;
INSERT INTO busca (texto, user_id, fonte, ref, date) SELECT region || ' ' || context, user_id, 'dor', id, date(created_at / 1000, 'unixepoch', '-3 hours') FROM pain WHERE context IS NOT NULL AND context <> '';
INSERT INTO busca (texto, user_id, fonte, ref, date) SELECT json_extract(plan, '$.name'), user_id, 'treino', id, date FROM session WHERE json_valid(plan) AND json_extract(plan, '$.name') IS NOT NULL;
