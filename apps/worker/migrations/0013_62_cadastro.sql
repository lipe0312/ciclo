-- Ciclo · #62 Conta de verdade: cadastro por convite (nome, sobrenome, sexo, nascimento), perfil da conta, aceite LGPD
-- versionado, Face ID de novo (ações sensíveis e app fechado há mais de 7 dias) e aviso de login em aparelho novo.
-- Só ADD COLUMN e tabela nova. Nada de seed: conta nova nasce vazia (teste em apps/worker/test/cadastro.test.ts).

-- Dados da conta (Conta → Perfil). Sexo é obrigatório no cadastro (decisão A); NULL só em conta anterior à #62.
ALTER TABLE user ADD COLUMN sobrenome TEXT CHECK (sobrenome IS NULL OR length(sobrenome) BETWEEN 1 AND 60);
ALTER TABLE user ADD COLUMN sexo TEXT CHECK (sexo IS NULL OR sexo IN ('feminino', 'masculino', 'nao_informado'));
ALTER TABLE user ADD COLUMN nascimento TEXT CHECK (nascimento IS NULL OR nascimento GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
ALTER TABLE user ADD COLUMN altura_cm INTEGER CHECK (altura_cm IS NULL OR altura_cm BETWEEN 100 AND 250);
ALTER TABLE user ADD COLUMN peso_kg REAL CHECK (peso_kg IS NULL OR peso_kg BETWEEN 25 AND 350);

-- Sessão: reauth_at = último Face ID nesta sessão (ações sensíveis valem 5 min); trava = 1 quando o app voltou depois de
-- mais de 7 dias fechado (pede Face ID sem deslogar); aviso_ok = login em aparelho novo já visto ("Fui eu"). NULL = aviso aberto.
ALTER TABLE sessions ADD COLUMN reauth_at INTEGER;
ALTER TABLE sessions ADD COLUMN trava INTEGER NOT NULL DEFAULT 0 CHECK (trava IN (0, 1));
ALTER TABLE sessions ADD COLUMN aviso_ok INTEGER;

-- Convite amarrado a um e-mail e ao nome de quem foi convidado (o dono preenche; aparece na boas-vindas).
ALTER TABLE invites ADD COLUMN nome TEXT CHECK (nome IS NULL OR length(nome) BETWEEN 1 AND 40);

-- Convite de conta nova sem e-mail (anterior à #62) deixa de valer: o convite agora é amarrado ao e-mail.
-- (Reset de acesso, com user_id, continua.) Vencer = expires_at 0; o cron apaga depois.
UPDATE invites SET expires_at = 0 WHERE email IS NULL AND user_id IS NULL AND used_at IS NULL;

-- Aceite dos termos e da privacidade, por versão. ip_hash = HMAC do IP com AUTH_PEPPER (nunca o IP puro).
-- Versão nova do documento = sem linha da versão vigente = o app pede o aceite de novo antes de usar.
CREATE TABLE consent (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  doc TEXT NOT NULL CHECK (doc IN ('termos', 'privacidade')),
  versao TEXT NOT NULL CHECK (length(versao) BETWEEN 1 AND 20),
  aceito_em INTEGER NOT NULL,
  ip_hash TEXT CHECK (ip_hash IS NULL OR length(ip_hash) <= 128),
  PRIMARY KEY (user_id, doc, versao)
);
