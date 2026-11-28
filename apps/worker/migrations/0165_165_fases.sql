-- Ciclo · #165 Vagas por fase (D3: "50 + dono"). Só expandir: tabela nova e ADD COLUMN (nada é recriado nem apagado).
-- O teto de contas vem daqui (abrir mais vagas = editar a fase ou criar a próxima, sem deploy); o core guarda só a trava
-- máxima de segurança (TETO_SEGURANCA, muda por PR) e por isso ela NÃO vira CHECK aqui. Vagas são contadas por consulta
-- (contas não-dono + convites pendentes de conta nova), sem contador: convite vencido ou revogado devolve a vaga sozinho.
-- Sem user_id: é configuração do app, sem dado de pessoa. As cotas ficam guardadas para a #176 (valores de hoje).
CREATE TABLE fase (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 40),
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 40),
  teto INTEGER NOT NULL CHECK (teto >= 1),
  inicio TEXT NOT NULL CHECK (inicio GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  fim_testes TEXT CHECK (fim_testes IS NULL OR fim_testes GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  aberta INTEGER NOT NULL DEFAULT 1 CHECK (aberta IN (0, 1)),
  cota_escritas_dia INTEGER NOT NULL CHECK (cota_escritas_dia >= 1),
  cota_r2_mb INTEGER NOT NULL CHECK (cota_r2_mb >= 1),
  created_at INTEGER NOT NULL
);
CREATE INDEX fase_recente ON fase(created_at);

-- Turma de cada convite e de cada conta (para comparar turmas depois). Nulo = de antes das fases (ou o dono, que fica fora).
ALTER TABLE invites ADD COLUMN fase_id TEXT REFERENCES fase(id);
ALTER TABLE user ADD COLUMN fase_id TEXT REFERENCES fase(id);
-- A contagem de convites pendentes roda em toda criação de convite e de conta.
CREATE INDEX invites_pendentes ON invites(used_at, user_id, expires_at);

-- Semente: a fase do piloto (teto 50, aberta; cotas iguais às de hoje: 2.000 escritas/dia e 500 MB). Os valores do piloto: #176.
INSERT INTO fase (id, nome, teto, inicio, fim_testes, aberta, cota_escritas_dia, cota_r2_mb, created_at)
  VALUES ('piloto-2027', 'Piloto 2027', 50, date('now'), NULL, 1, 2000, 500, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
