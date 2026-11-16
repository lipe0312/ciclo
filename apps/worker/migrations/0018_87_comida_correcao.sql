-- Ciclo · #87 Comida pelo Chat: corrigir registros e lançar em qualquer dia. Só ADD COLUMN em food_log.
-- raw_original = o texto da primeira vez (antes de qualquer correção); junto com `items` (itens finais) é o par
-- texto original → itens finais que a #80 lê para aprender. corrigido_at = quando a última correção pelo Chat entrou
-- (ordena o "desfazer o último envio"). antes = foto do registro antes dessa correção (o desfazer volta a ela).
ALTER TABLE food_log ADD COLUMN raw_original TEXT CHECK (raw_original IS NULL OR length(raw_original) <= 2000);
ALTER TABLE food_log ADD COLUMN corrigido_at INTEGER;
ALTER TABLE food_log ADD COLUMN antes TEXT CHECK (antes IS NULL OR (length(antes) <= 16000 AND json_valid(antes)));
