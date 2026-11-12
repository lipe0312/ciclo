// #45 Método por objetivo: cada número do método vive na tabela do objetivo; trocar o objetivo troca os parâmetros.
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE, GOAL_IDS, METODOS, metodoDoObjetivo, parametrosDoPerfil, resumoMetodo } from "../src/index.ts";

const perfil = (goal: string, extra: Record<string, unknown> = {}) => ({ ...DEFAULT_PROFILE, goal: { ...DEFAULT_PROFILE.goal, id: goal }, ...extra });

test("método: todo objetivo do perfil tem a tabela completa, com os mesmos campos e números válidos", () => {
  assert.deepEqual(Object.keys(METODOS).sort(), [...GOAL_IDS].sort());
  const shape = (m: object): string => JSON.stringify(Object.entries(m).map(([k, v]) => [k, v && typeof v === "object" && !Array.isArray(v) ? shape(v) : typeof v]));
  const ref = shape(METODOS.bracos_ombros);
  for (const g of GOAL_IDS) {
    const m = METODOS[g];
    assert.equal(shape(m), ref, `${g}: campos diferentes`);
    assert.ok(m.volume.manter >= 4 && m.volume.prioridade[0] >= m.volume.manter && m.volume.prioridade[1] <= 22, `${g}: volume`);
    assert.ok(m.frequenciaMin >= 2, `${g}: 2× por músculo`);
    assert.ok(m.reps[0] < m.reps[1] && m.rir[0] < m.rir[1], `${g}: faixas`);
    assert.ok(m.cardio.minSemana[0] < m.cardio.minSemana[1], `${g}: cardio`);
    assert.ok(m.comida.proteinaGkg >= 1.6 && m.comida.proteinaGkg <= 2.2, `${g}: proteína`);
    assert.ok(m.fontes.length >= 1, `${g}: sem fonte`);
  }
});

test("método: trocar o objetivo do perfil troca volume, cardio, proteína e calorias", () => {
  const bracos = parametrosDoPerfil(perfil("bracos_ombros", { weightKg: 72 }));
  const definir = parametrosDoPerfil(perfil("definir", { weightKg: 72 }));
  const forca = parametrosDoPerfil(perfil("forca", { weightKg: 72 }));
  assert.equal(bracos.objetivo, "bracos_ombros");
  assert.equal(bracos.proteinaG, Math.round(72 * METODOS.bracos_ombros.comida.proteinaGkg));
  assert.notEqual(bracos.proteinaG, definir.proteinaG);
  assert.notDeepEqual(bracos.cardioMin, definir.cardioMin);
  assert.equal(bracos.kcal, "superavit"); assert.equal(definir.kcal, "deficit");
  assert.ok(bracos.kgSemana > 0 && definir.kgSemana < 0);
  assert.notDeepEqual(bracos.reps, forca.reps);
  // volume: prioridades do perfil ganham a faixa do objetivo; o resto fica em manutenção
  assert.deepEqual(bracos.volume.ombro, METODOS.bracos_ombros.volume.prioridade);
  assert.deepEqual(bracos.volume.peito, [METODOS.bracos_ombros.volume.manter, METODOS.bracos_ombros.volume.manter]);
  assert.notDeepEqual(bracos.volume.ombro, definir.volume.ombro);
  // proteína acompanha o peso
  assert.equal(parametrosDoPerfil(perfil("bracos_ombros", { weightKg: 90 })).proteinaG, Math.round(90 * METODOS.bracos_ombros.comida.proteinaGkg));
});

test("método: objetivo desconhecido cai no objetivo padrão do perfil (sem número solto)", () => {
  assert.deepEqual(metodoDoObjetivo("inventado"), metodoDoObjetivo(DEFAULT_PROFILE.goal.id));
  assert.deepEqual(metodoDoObjetivo(undefined), metodoDoObjetivo(DEFAULT_PROFILE.goal.id));
  assert.equal(parametrosDoPerfil({}).objetivo, DEFAULT_PROFILE.goal.id);
});

test("resumo do método: 5 a 10 linhas, objetivo e prioridades primeiro, números vindos da tabela do objetivo", () => {
  for (const g of GOAL_IDS) {
    const p = perfil(g, { weightKg: 80 });
    const r = resumoMetodo(p);
    const m = METODOS[g], par = parametrosDoPerfil(p);
    assert.ok(r.length >= 5 && r.length <= 10, `${g}: ${r.length} linhas`);
    assert.match(r[0], /^Objetivo/);
    const all = r.join("\n");
    assert.ok(all.includes(`${m.volume.prioridade[0]}–${m.volume.prioridade[1]}`), `${g}: volume`);
    assert.ok(all.includes(`${m.cardio.minSemana[0]}–${m.cardio.minSemana[1]} min`), `${g}: cardio`);
    assert.ok(all.includes(`${par.proteinaG} g`), `${g}: proteína`);
    assert.ok(all.includes(`${m.reps[0]}–${m.reps[1]} reps`), `${g}: reps`);
    assert.ok(r.every((l) => l.length <= 200), `${g}: linha longa`);
  }
  assert.notDeepEqual(resumoMetodo(perfil("bracos_ombros")), resumoMetodo(perfil("definir")));
});

test("método: toda fonte citada na tabela existe em docs/metodo/README.md (o doc explica, o core decide)", () => {
  const doc = readFileSync(new URL("../../../docs/metodo/README.md", import.meta.url), "utf8");
  for (const g of GOAL_IDS) for (const f of METODOS[g].fontes) assert.ok(doc.includes(`\`${f}\``), `${g}: fonte ${f} sem referência no doc`);
});
