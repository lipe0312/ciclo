-- Ciclo · #106 Série por tempo (prancha, polichinelo…). Só ADD COLUMN em set_log: `segundos` (1–3600) ao lado de `reps`.
-- Série por tempo: segundos preenchido e reps NULL; continua uma linha de set_log (conta como série no volume semanal).
ALTER TABLE set_log ADD COLUMN segundos INTEGER CHECK (segundos IS NULL OR (segundos BETWEEN 1 AND 3600));
