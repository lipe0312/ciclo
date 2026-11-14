// #62 Cadastro por convite: dados da conta (nome, sobrenome, sexo, nascimento), conta nova vazia, aceite LGPD
// versionado, Face ID de novo (ausência e ações sensíveis), sessão deslizante de 30 dias com teto de 180 e iniciais.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_DOCS, CONSENT_VERSAO, DEFAULT_PROFILE, REAUTH_AUSENCIA_MS, REAUTH_SENSIVEL_MS, SESSION_MAX_MS, SESSION_MS, SEXOS, TABELAS_CONTA_NOVA,
  consentPendente, contaNovaVazia, emailValido, faceIdRecente, iniciais, mesmoEmail, nascimentoValido, perfilContaNova, precisaFaceId,
  sessionAlive, sessionExpiry, sessionRenewal, sexoValido, sobrenomeValido, validarCadastro, validarPerfilConta,
} from "../src/index.ts";

const DIA = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 12);
const HOJE = "2026-11-14";

test("sessão deslizante de 30 dias, renovada no uso (no máx. 1×/dia), com teto absoluto de 180 dias", () => {
  assert.equal(SESSION_MS, 30 * DIA); assert.equal(SESSION_MAX_MS, 180 * DIA);
  const s = { createdAt: NOW, expiresAt: NOW + SESSION_MS };
  assert.ok(sessionAlive(s, NOW)); assert.ok(!sessionAlive({ ...s, expiresAt: NOW }, NOW), "venceu");
  assert.equal(sessionRenewal(s, NOW + 3_600_000), null, "menos de 1 dia");
  assert.equal(sessionRenewal(s, NOW + DIA), NOW + DIA + SESSION_MS, "cada uso renova 30 dias");
  assert.ok(!sessionAlive(s, NOW + 31 * DIA), "30 dias sem abrir: encerrada sozinha");
  // usando sempre, a sessão nunca passa de 180 dias desde o login
  const velha = { createdAt: NOW - 170 * DIA, expiresAt: NOW + 5 * DIA };
  assert.equal(sessionRenewal(velha, NOW), NOW + 10 * DIA, "renova só até o teto");
  assert.equal(sessionExpiry(velha.createdAt, NOW), NOW + 10 * DIA);
  assert.ok(!sessionAlive({ createdAt: NOW - 180 * DIA, expiresAt: NOW + DIA }, NOW), "passou de 180 dias: entra de novo com Face ID");
  assert.equal(sessionRenewal({ createdAt: NOW - 181 * DIA, expiresAt: NOW + DIA }, NOW), null);
});

test("Face ID de novo: depois de 7 dias com o app fechado (sem deslogar) e antes de ação sensível (5 min)", () => {
  assert.equal(REAUTH_AUSENCIA_MS, 7 * DIA); assert.equal(REAUTH_SENSIVEL_MS, 5 * 60_000);
  assert.equal(precisaFaceId({ lastSeenAt: NOW - 6 * DIA, createdAt: NOW - 20 * DIA }, NOW), false);
  assert.equal(precisaFaceId({ lastSeenAt: NOW - 8 * DIA, createdAt: NOW - 20 * DIA }, NOW), true);
  assert.equal(precisaFaceId({ lastSeenAt: null, createdAt: NOW - 8 * DIA }, NOW), true, "sem uso: conta da criação");
  assert.equal(faceIdRecente(NOW - 60_000, NOW), true);
  assert.equal(faceIdRecente(NOW - 6 * 60_000, NOW), false);
  assert.equal(faceIdRecente(null, NOW), false);
  assert.equal(faceIdRecente(NOW + 10 * 60_000, NOW), false, "data no futuro não vale");
});

test("sexo obrigatório: feminino, masculino ou prefiro não dizer", () => {
  assert.deepEqual([...SEXOS], ["feminino", "masculino", "nao_informado"]);
  assert.equal(sexoValido("feminino"), "feminino"); assert.equal(sexoValido("nao_informado"), "nao_informado");
  assert.equal(sexoValido("m"), null); assert.equal(sexoValido(""), null); assert.equal(sexoValido(undefined), null);
});

test("sobrenome, e-mail e nascimento (opcional, idade de 13 a 110 anos)", () => {
  assert.equal(sobrenomeValido("  da   Silva "), "da Silva"); assert.equal(sobrenomeValido(""), null); assert.equal(sobrenomeValido("x".repeat(61)), null);
  assert.equal(emailValido(" Ana@Exemplo.COM "), "ana@exemplo.com"); assert.equal(emailValido("sem-arroba"), null); assert.equal(emailValido(3), null);
  assert.ok(mesmoEmail("Ana@Exemplo.com", "ana@exemplo.com ")); assert.ok(!mesmoEmail("ana@exemplo.com", "bia@exemplo.com")); assert.ok(!mesmoEmail(null, null));
  assert.deepEqual(nascimentoValido(null, HOJE), { ok: true, valor: null });
  assert.deepEqual(nascimentoValido("", HOJE), { ok: true, valor: null });
  assert.deepEqual(nascimentoValido("1995-03-20", HOJE), { ok: true, valor: "1995-03-20" });
  assert.equal(nascimentoValido("2020-01-01", HOJE).ok, false, "menos de 13 anos");
  assert.equal(nascimentoValido("1900-01-01", HOJE).ok, false);
  assert.equal(nascimentoValido("1995-02-30", HOJE).ok, false, "data inexistente");
  assert.equal(nascimentoValido("20/03/1995", HOJE).ok, false);
});

test("cadastro: nome, sobrenome e sexo obrigatórios; nascimento opcional; erros listados", () => {
  const ok = validarCadastro({ nome: "Ana", sobrenome: "Fictícia", sexo: "feminino", nascimento: "" }, HOJE);
  assert.deepEqual(ok, { ok: true, valor: { nome: "Ana", sobrenome: "Fictícia", sexo: "feminino", nascimento: null }, erros: [] });
  const ruim = validarCadastro({ nome: "", sobrenome: "", sexo: "x", nascimento: "2030-01-01" }, HOJE);
  assert.equal(ruim.ok, false); assert.equal(ruim.erros.length, 4);
});

test("Conta → Perfil: patch parcial (nome, sobrenome, sexo, nascimento, altura e peso opcionais)", () => {
  assert.deepEqual(validarPerfilConta({ alturaCm: 178, pesoKg: 74.5 }, HOJE), { ok: true, valor: { alturaCm: 178, pesoKg: 74.5 }, erros: [] });
  assert.deepEqual(validarPerfilConta({ alturaCm: null, nascimento: null }, HOJE).valor, { alturaCm: null, nascimento: null }, "null apaga");
  assert.equal(validarPerfilConta({ alturaCm: 20 }, HOJE).ok, false);
  assert.equal(validarPerfilConta({ sexo: null }, HOJE).ok, false, "sexo é obrigatório");
  assert.equal(validarPerfilConta({ nome: "" }, HOJE).ok, false);
  assert.deepEqual(validarPerfilConta({ outro: 1 }, HOJE).valor, {}, "campo desconhecido é ignorado");
});

test("aceite LGPD versionado: versão nova obriga novo aceite", () => {
  assert.deepEqual([...CONSENT_DOCS], ["termos", "privacidade"]);
  const tudo = CONSENT_DOCS.map((doc) => ({ doc, versao: CONSENT_VERSAO[doc] }));
  assert.deepEqual(consentPendente(tudo), []);
  assert.deepEqual(consentPendente([]), ["termos", "privacidade"]);
  assert.deepEqual(consentPendente(tudo, { ...CONSENT_VERSAO, privacidade: "2099-01-01" }), ["privacidade"]);
  assert.deepEqual(consentPendente([{ doc: "termos", versao: "velha" }, { doc: "termos", versao: CONSENT_VERSAO.termos }, { doc: "privacidade", versao: CONSENT_VERSAO.privacidade }]), []);
});

test("conta nova = vazia: só credenciais, sessão e aceite podem ter linhas", () => {
  assert.deepEqual([...TABELAS_CONTA_NOVA].sort(), ["consent", "passkeys", "recovery_codes", "sessions"]);
  assert.deepEqual(contaNovaVazia({ passkeys: 1, sessions: 1, recovery_codes: 8, consent: 2, gym: 0, profile: 0 }), []);
  assert.deepEqual(contaNovaVazia({ passkeys: 1, gym: 1, profile: 1, day_plan: 0 }), ["gym", "profile"]);
});

test("perfil de treino da conta nova: nenhum padrão marcado (objetivo, prioridades, dias, lugares, academia por dia)", () => {
  const p = perfilContaNova({ sexo: "feminino", nascimento: "1996-11-15", alturaCm: 165, pesoKg: null }, HOJE);
  assert.equal(p.goal.id, ""); assert.deepEqual(p.priorities, []); assert.deepEqual(p.subPriorities, []);
  assert.deepEqual(p.daysUsual, []); assert.deepEqual(p.places, []); assert.deepEqual(p.dayGym, {});
  assert.equal(p.sex, "f"); assert.equal(p.age, 29); assert.equal(p.heightCm, 165); assert.equal(p.weightKg, DEFAULT_PROFILE.weightKg);
  assert.deepEqual(DEFAULT_PROFILE.priorities, ["ombro", "biceps", "triceps"], "o padrão do core não muda");
  assert.equal(perfilContaNova({ sexo: "masculino" }, HOJE).sex, "m");
});

test("iniciais do avatar", () => {
  assert.equal(iniciais("Ana", "Fictícia"), "AF");
  assert.equal(iniciais("ana maria", null), "AM");
  assert.equal(iniciais("Bia", ""), "B");
  assert.equal(iniciais("  ", null), "?");
  assert.equal(iniciais("Élio", "Ávila"), "ÉÁ");
});
