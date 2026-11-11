-- Ciclo · #25 modo treino: cardio, Web Push (descanso com a tela bloqueada) e resumo da sessão.
-- Toda tabela nova tem user_id e chave/índice começando por ele (ADR-0007).

CREATE TABLE cardio_log (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  date TEXT NOT NULL CHECK (length(date) = 10 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 60),
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 300),
  intensity TEXT NOT NULL CHECK (intensity IN ('zona2', 'moderado', 'intervalado')),
  distance_km REAL CHECK (distance_km IS NULL OR distance_km BETWEEN 0.1 AND 200),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX cardio_log_user_date ON cardio_log(user_id, date);

-- Assinatura Web Push do aparelho (endpoint + chaves do navegador). Até 5 por conta (checado na API, atomicamente).
-- Um endpoint pertence a UMA conta por vez: ao assinar de novo em outra conta, a API remove o da anterior (aparelho compartilhado).
CREATE TABLE push_subscription (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (length(endpoint) BETWEEN 10 AND 700),
  p256dh TEXT NOT NULL CHECK (length(p256dh) BETWEEN 1 AND 200),
  auth TEXT NOT NULL CHECK (length(auth) BETWEEN 1 AND 100),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, endpoint)
);

-- Fim do descanso agendado: 1 por conta. O cron de 1 min envia o push quando fire_at passa (sent_at marca o envio).
CREATE TABLE rest_timer (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  fire_at INTEGER NOT NULL CHECK (fire_at BETWEEN 1 AND 4102444800000), -- ms; até o ano 2100
  sent_at INTEGER
);
CREATE INDEX rest_timer_due ON rest_timer(fire_at) WHERE sent_at IS NULL;

-- Resumo calculado ao encerrar (volume, séries, PRs); alimenta a aba Histórico.
ALTER TABLE session ADD COLUMN summary TEXT;
