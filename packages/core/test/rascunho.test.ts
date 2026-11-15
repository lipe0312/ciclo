// #71 Primeiros passos da conta nova: rascunho de verdade vazio, validação parcial, salvar por passo,
// validação completa só ao gerar a semana (com a lista do que falta) e mensagens humanas.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROFILE, PASSOS_PP, applyProfilePatch, faltaParaGerar, goalDefaults, mensagemPerfil, montarPerfilApp, patchDoPasso,
  perfilContaNova, perfilVazio, planSentence, validarParaGerar, validateProfilePatch,
} from "../src/index.ts";

const HOJE = "2026-11-14";

test("rascunho vazio passa na validação (goal.id vazio, places vazio, campos nulos)", () => {
  assert.equal(validateProfilePatch({}).ok, true);
  const r = validateProfilePatch({ goal: { id: "", statement: "" }, places: [], sex: null, age: null, level: null, diet: { mode: "" }, minutes: null });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  if (r.ok) assert.deepEqual(r.value, { goal: { statement: "" }, diet: {} }, "não respondido não vira valor (texto vazio é texto)");
  assert.equal(validateProfilePatch(perfilVazio()).ok, true, "o perfil vazio do app inteiro passa");
});

test("rascunho com valor fora da lista falha com mensagem humana", () => {
  const r = validateProfilePatch({ goal: { id: "inventado" }, age: 500 });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.campos, ["goal", "age"]);
  const m = mensagemPerfil(r.campos);
  assert.equal(m, "Não deu para salvar: confira objetivo e idade.");
  assert.ok(!/deve ser|bracos_ombros|goal\.id/.test(m), "nada de texto técnico");
  assert.equal(mensagemPerfil([]), "Não deu para salvar agora. Tente de novo.");
  assert.match(mensagemPerfil(["chave_que_nao_existe"]), /confira um campo/);
});

test("lista com item vazio continua sendo erro (só o campo inteiro vazio é 'não respondido')", () => {
  assert.equal(validateProfilePatch({ fatWhere: [""] }).ok, false);
  assert.equal(validateProfilePatch({ remembered: [{ exerciseId: "", kg: 10, reps: 8, confidence: "certeza" }] }).ok, false);
});

test("applyProfilePatch sobre base vazia não inventa padrão", () => {
  const r = applyProfilePatch({}, { diet: { mode: "leve" } });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.profile, { diet: { mode: "leve" } });
  const s = applyProfilePatch({}, { subPriorities: ["ombro_lat"] });
  assert.equal(s.ok, true);
  if (s.ok) assert.deepEqual(s.profile.priorities, ["ombro"]);
});

test("perfil vazio do app: nenhuma resposta marcada e nada do padrão do dono", () => {
  const p = perfilVazio();
  assert.equal(p.goal.id, ""); assert.equal(p.goal.statement, "");
  for (const k of ["sex", "age", "heightCm", "weightKg", "bodyType", "level", "minutes", "daysTarget", "hour", "dynamics", "crowdedStrategy"] as const) assert.equal(p[k], null, k);
  assert.deepEqual(p.fatWhere, []); assert.deepEqual(p.priorities, []); assert.deepEqual(p.subPriorities, []);
  assert.deepEqual(p.daysUsual, []); assert.deepEqual(p.places, []); assert.deepEqual(p.dayGym, {}); assert.deepEqual(p.mobility, {});
  assert.equal(p.diet.mode, ""); assert.deepEqual(p.diet.supplements, []); assert.equal(p.diet.kcal, null); assert.equal(p.diet.protein, null);
  assert.equal(p.weekStart, "seg"); assert.equal(p.flexWeek, true, "padrões técnicos continuam");
  perfilVazio().fatWhere.push("barriga");
  assert.deepEqual(perfilVazio().fatWhere, [], "cada chamada é uma cópia");
});

test("conta nova: só o que a pessoa informou no cadastro entra no rascunho", () => {
  assert.deepEqual(perfilContaNova({ sexo: "feminino", nascimento: "1996-11-15", alturaCm: 165, pesoKg: null }, HOJE), { sex: "f", age: 29, heightCm: 165 });
  assert.deepEqual(perfilContaNova({ sexo: "nao_informado" }, HOJE), {});
  assert.deepEqual(perfilContaNova({}, HOJE), {});
  assert.deepEqual(perfilContaNova({ sexo: "masculino", pesoKg: 80 }, HOJE), { sex: "m", weightKg: 80 });
});

test("montar o perfil do app: vazio + o que está salvo, sem DEFAULT_PROFILE por baixo e sem o cadastro marcado", () => {
  const p = montarPerfilApp({ level: 2, goal: { id: "forca", statement: "Ficar forte" }, diet: { mode: "zero" } });
  assert.equal(p.level, 2); assert.equal(p.goal.id, "forca"); assert.equal(p.goal.statement, "Ficar forte");
  assert.equal(p.diet.mode, "zero"); assert.equal(p.diet.kcal, null, "meta de comida não vem do dono antigo");
  assert.equal(p.sex, null, "sexo do cadastro é sugestão, não resposta marcada"); assert.equal(p.heightCm, null);
  assert.equal(p.age, null); assert.equal(p.weightKg, null); assert.equal(p.minutes, null); assert.deepEqual(p.daysUsual, []);
  assert.notEqual(p.bodyType, DEFAULT_PROFILE.bodyType);
  assert.equal(montarPerfilApp({ sex: "f" }).sex, "f");
  assert.equal(montarPerfilApp(null).goal.id, "");
  const lixo = montarPerfilApp({ goal: "x", diet: [1], meta: null } as never);
  assert.equal(lixo.goal.id, ""); assert.equal(lixo.diet.mode, "");
});

test("patch do passo: só os campos daquele passo e só o que foi respondido", () => {
  const p = perfilVazio();
  assert.deepEqual(PASSOS_PP, ["objetivo", "musculos", "experiencia", "rotina", "onde", "dores", "corpo", "comovoce", "comida", "resumo"]);
  const vazio: Record<string, unknown> = { musculos: { subPriorities: [] }, rotina: { daysUsual: [] } };
  for (const id of PASSOS_PP) assert.deepEqual(patchDoPasso(id, p), vazio[id] ?? {}, `${id}: nada respondido, nada enviado (listas vão como "nenhum")`);
  Object.assign(p.goal, goalDefaults("shape_v"));
  assert.deepEqual(Object.keys(patchDoPasso("objetivo", p)), ["goal"]);
  assert.equal(patchDoPasso("objetivo", p).goal.id, "shape_v");
  p.goal.statement = "Ombro largo para o verão";
  assert.equal(patchDoPasso("objetivo", p).goal.statement, "Ombro largo para o verão");
  p.level = 1;
  assert.deepEqual(patchDoPasso("experiencia", p), { level: 1 });
  p.daysUsual = ["seg", "qua"]; p.daysTarget = 2;
  assert.deepEqual(patchDoPasso("rotina", p), { daysUsual: ["seg", "qua"], daysTarget: 2 }, "duração não respondida fica de fora");
  p.minutes = 60;
  assert.equal(patchDoPasso("rotina", p).minutes, 60);
  p.sex = "f"; p.weightKg = 61.5;
  assert.deepEqual(patchDoPasso("corpo", p), { sex: "f", weightKg: 61.5 });
  p.diet.mode = "leve";
  assert.deepEqual(patchDoPasso("comida", p), { diet: { mode: "leve" } }, "comida manda só o modo");
  p.subPriorities = ["ombro_lat", "dorsal"]; p.priorities = ["ombro", "costas"];
  assert.deepEqual(patchDoPasso("musculos", p), { subPriorities: ["ombro_lat", "dorsal"] });
  p.places = ["casa"];
  assert.deepEqual(patchDoPasso("onde", p), { places: ["casa"] });
  for (const id of PASSOS_PP) assert.equal(validateProfilePatch(patchDoPasso(id, p)).ok, true, id);
});

test("gerar a semana: lista legível do que falta, na ordem dos passos", () => {
  const p = perfilVazio();
  assert.deepEqual(faltaParaGerar(p).map((f) => f.rotulo), ["Objetivo", "Há quanto tempo você treina", "Dias em que você treina", "Duração do treino", "Academia, casa ou os dois"]);
  assert.deepEqual(faltaParaGerar(p).map((f) => f.passo), ["objetivo", "experiencia", "rotina", "rotina", "onde"]);
  Object.assign(p.goal, goalDefaults("saude")); p.level = 0; p.daysUsual = ["ter"]; p.daysTarget = 1; p.minutes = 45; p.places = ["academia"];
  assert.deepEqual(faltaParaGerar(p), [], "corpo, comida e músculos não travam a semana");
  const v = validarParaGerar(p);
  assert.equal(v.ok, true);
  const ruim = validarParaGerar({ ...p, age: 7 });
  assert.equal(ruim.ok, false);
  assert.deepEqual(ruim.faltando.map((f) => f.rotulo), ["Idade"]);
});

test("frase do plano: usa o foco escrito; sem objetivo, pede para escolher; sem padrão inventado", () => {
  assert.equal(planSentence(perfilVazio()), "Escolha um objetivo para ver o seu plano.");
  assert.equal(planSentence({}), "Escolha um objetivo para ver o seu plano.");
  const p = perfilVazio();
  Object.assign(p.goal, goalDefaults("bracos_ombros"), { statement: "Braço de 40 cm até o fim do ano" });
  assert.equal(planSentence(p), "Braço de 40 cm até o fim do ano. O corpo todo, sem foco.");
  p.daysTarget = 3; p.minutes = 45; p.subPriorities = ["ombro_lat", "biceps"];
  assert.equal(planSentence(p), "Braço de 40 cm até o fim do ano. 3 dias por semana, cerca de 45 min por treino, foco em ombro lateral e bíceps.");
});

test("objetivo sem horizonte nem metas (Chat) ganha as metas iniciais do objetivo; sem objetivo, nada muda", async () => {
  const { completarObjetivo } = await import("../src/index.ts");
  const p = completarObjetivo<Record<string, any>>({ goal: { id: "forca", statement: "Ficar forte" } });
  assert.equal(p.goal.horizonWeeks, 12); assert.equal(p.goal.statement, "Ficar forte"); assert.equal(typeof p.goal.metrics.bracoCm, "number");
  assert.equal(completarObjetivo<Record<string, any>>({ goal: { id: "forca", horizonWeeks: 8, metrics: { pesoKg: 2 } } }).goal.metrics.pesoKg, 2);
  assert.deepEqual(completarObjetivo({ level: 1 }), { level: 1 });
  assert.deepEqual(completarObjetivo({ goal: { statement: "x" } }), { goal: { statement: "x" } });
});

test("perfil para cálculo: preenche só o não respondido, sem mudar o que a pessoa respondeu nem as listas", async () => {
  const { perfilCalculo } = await import("../src/index.ts");
  const p = perfilVazio(); p.weightKg = 58; p.diet.mode = "zero";
  const c = perfilCalculo(p);
  assert.equal(c.weightKg, 58); assert.equal(c.diet.mode, "zero"); assert.equal(c.level, DEFAULT_PROFILE.level); assert.equal(c.diet.kcal, DEFAULT_PROFILE.diet.kcal);
  assert.deepEqual(c.daysUsual, [], "listas não ganham padrão"); assert.deepEqual(c.subPriorities, []);
  assert.equal(p.level, null, "não muda o perfil de origem");
});
