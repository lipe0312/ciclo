-- #73 Preferências de interface que precisam valer em qualquer aparelho (o localStorage é só cache otimista).
-- Datas no fuso do app (AAAA-MM-DD), gravadas pelo servidor. Sem texto livre.
CREATE TABLE ui_pref (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  -- "Dispensar" do cartão "Sua semana está pronta": depois disso ele não volta
  boas_vindas_dispensado_em TEXT CHECK (boas_vindas_dispensado_em IS NULL OR length(boas_vindas_dispensado_em) = 10),
  -- "Lembrar depois" do "Complete o Perfil de treino": esconde por 7 dias
  perfil_adiado_em TEXT CHECK (perfil_adiado_em IS NULL OR length(perfil_adiado_em) = 10),
  updated_at INTEGER NOT NULL
);
