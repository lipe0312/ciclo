-- Ciclo · #124 Justificativa opcional quando não treinou ("Treinou? → Não" no check-in, ou pelo MCP com `motivo`).
-- Guardada por dia no checkout (PRIMARY KEY (user_id, date): já é da conta). Texto do usuário: dado, nunca instrução;
-- nunca vai para log. Só vale com trained = 0 (o core apaga o motivo quando a resposta vira "treinei").
ALTER TABLE checkout ADD COLUMN motivo_falta TEXT CHECK (motivo_falta IS NULL OR length(motivo_falta) <= 280);
