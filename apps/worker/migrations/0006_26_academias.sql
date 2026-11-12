-- Ciclo · #26 Academias e lugares. Nada é recriado: colunas e tabela novas (ADR-0010).
-- gym: tipo, localização (lat/lng em faixa) e lixeira. gym_weekday: dias em que o lugar é o padrão (1 lugar por dia),
-- espelho de profile.dayGym (o planejador lê o perfil; a API mantém os dois coerentes).
-- media: lixeira de 30 dias (um cron apaga o arquivo do R2 e a linha depois disso).

ALTER TABLE gym ADD COLUMN kind TEXT NOT NULL DEFAULT 'academia' CHECK (kind IN ('academia', 'casa', 'hotel'));
ALTER TABLE gym ADD COLUMN lat REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90);
ALTER TABLE gym ADD COLUMN lng REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);
ALTER TABLE gym ADD COLUMN address TEXT CHECK (address IS NULL OR length(address) <= 160);
ALTER TABLE gym ADD COLUMN deleted_at INTEGER;
CREATE INDEX gym_trash ON gym(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE gym_weekday (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  gym_id TEXT NOT NULL,
  weekday TEXT NOT NULL CHECK (weekday IN ('seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom')),
  PRIMARY KEY (user_id, weekday)
);
CREATE INDEX gym_weekday_gym ON gym_weekday(user_id, gym_id);

ALTER TABLE media ADD COLUMN deleted_at INTEGER;
CREATE INDEX media_user_gym ON media(user_id, gym_id, equipment_id) WHERE deleted_at IS NULL;
CREATE INDEX media_trash ON media(deleted_at) WHERE deleted_at IS NOT NULL;

-- Ciclo · #26 (ajuste): a política do Nominatim é 1 requisição/s para o app inteiro, não por conta.
-- Linha única com o instante da última consulta. Não é dado pessoal (sem user_id, sem texto da busca).
CREATE TABLE geocode_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_at INTEGER NOT NULL
);
INSERT INTO geocode_gate (id, last_at) VALUES (1, 0);
