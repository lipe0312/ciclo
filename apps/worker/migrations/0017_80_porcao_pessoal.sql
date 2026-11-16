-- Ciclo · #80 Porções faladas: porção pessoal (aprende com a correção), cache da IA, modo sombra do parser e o cache
-- do Open Food Facts. Só tabela nova. Toda tabela de pessoa tem user_id e chave começando por ele (ADR-0007).

-- Porção pessoal: "meu prato de arroz é uns 200 g". Na próxima vez a camada 0 usa esta, com confiança alta e sem IA.
-- medida "porcao" = quando a pessoa não diz a medida. origem: correcao (a pessoa ajustou) | aprendido (N confirmações).
CREATE TABLE porcao_pessoal (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  alimento TEXT NOT NULL CHECK (length(alimento) BETWEEN 1 AND 40 AND alimento NOT GLOB '*[^a-z0-9-]*'),
  medida TEXT NOT NULL CHECK (length(medida) BETWEEN 1 AND 30 AND medida NOT GLOB '*[^a-z ]*'),
  gramas REAL NOT NULL CHECK (gramas > 0 AND gramas <= 2000),
  n INTEGER NOT NULL DEFAULT 1 CHECK (n >= 1),
  origem TEXT NOT NULL CHECK (origem IN ('correcao', 'aprendido')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, alimento, medida)
);

-- Cache da IA de porção por conta: hash do texto normalizado → itens já validados. Mesma frase = mesma resposta, sem nova
-- chamada. O texto não fica guardado (só o hash). Vale 30 dias (conferido na leitura).
CREATE TABLE porcao_cache (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  chave TEXT NOT NULL CHECK (length(chave) = 64),
  itens TEXT NOT NULL CHECK (length(itens) <= 8000 AND json_valid(itens)),
  provedor TEXT NOT NULL CHECK (provedor IN ('workers-ai', 'haiku', 'openai')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, chave)
);

-- Modo sombra do parser: só a comparação com a IA (etiquetas e ids, palavra fora do léxico vira "?"), nunca o texto cru.
CREATE TABLE porcao_sombra (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(id) BETWEEN 8 AND 64),
  categoria TEXT NOT NULL CHECK (length(categoria) <= 20),
  concordou INTEGER NOT NULL CHECK (concordou IN (0, 1)),
  erro_g INTEGER,
  comparacao TEXT NOT NULL CHECK (length(comparacao) <= 4000 AND json_valid(comparacao)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX porcao_sombra_cat ON porcao_sombra(user_id, categoria);

-- Open Food Facts (ADR-0014): resposta pública por NOME de alimento (hash), sem dado pessoal. Global, vale 30 dias.
CREATE TABLE alimento_externo (
  chave TEXT PRIMARY KEY CHECK (length(chave) = 64),
  resultado TEXT NOT NULL CHECK (length(resultado) <= 4000 AND json_valid(resultado)),
  created_at INTEGER NOT NULL
);
