-- Ciclo · #25 modo treino: cardio, Web Push (descanso com a tela bloqueada) e resumo da sessão.
-- Toda tabela nova tem user_id e chave/índice começando por ele (ADR-0007).

CREATE TABLE cardio_log (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 300),
  intensity TEXT NOT NULL CHECK (intensity IN ('zona2', 'moderado', 'intervalado')),
  distance_km REAL CHECK (distance_km IS NULL OR distance_km BETWEEN 0.1 AND 200),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX cardio_log_user_date ON cardio_log(user_id, date);

-- Assinatura Web Push do aparelho (endpoint + chaves do navegador). Até 5 por conta (checado na API).
CREATE TABLE push_subscription (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, endpoint)
);

-- Fim do descanso agendado: 1 por conta. O cron de 1 min envia o push quando fire_at passa (sent_at marca o envio).
CREATE TABLE rest_timer (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX rest_timer_due ON rest_timer(fire_at) WHERE sent_at IS NULL;

-- Resumo calculado ao encerrar (volume, séries, PRs); alimenta a aba Histórico.
ALTER TABLE session ADD COLUMN summary TEXT;
