// #65 Algoritmo de treino validado: gerador determinístico + validador separado + IA só como revisora.
// Dados fictícios. O teste de propriedade usa seed fixa (600 perfis aleatórios, 0 inválidos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DOWS, EQUIPMENT, EXERCISES, EXERCISE_BY_ID, MUSCLE_IDS, PAIN_REGIONS,
  FATOR_VOLUME_F, DESCANSO_ISOLADO_F, MIN_POR_SERIE, REPS_FAIXA, TIER_REVISAO,
  aplicarRevisaoIA, compactarSemana, ehComposto, faixasSemana, gerarSemana, padraoDe, painBlocks, pedidoRevisaoIA, validarSemana,
} from "../src/index.ts";
import type { MuscleId, Pain, PerfilGerador, SemanaGerada } from "../src/index.ts";

const ALL = EQUIPMENT.map((e) => e.id);
const base = (o: Partial<PerfilGerador> = {}): PerfilGerador => ({
  sexo: "m", nivel: 1, prioridades: ["ombro", "biceps", "triceps"], equipamentos: ALL,
  dias: ["seg", "ter", "qui", "sex"], minutos: 60, ...o,
});
const volume = (s: SemanaGerada) => {
  const v: Partial<Record<MuscleId, number>> = {}, f: Partial<Record<MuscleId, number>> = {};
  for (const d of s.dias) {
    const no = new Set<MuscleId>();
    for (const i of d.itens) { v[i.muscle] = (v[i.muscle] ?? 0) + i.sets; no.add(i.muscle); }
    for (const m of no) f[m] = (f[m] ?? 0) + 1;
  }
  return { v, f };
};
const erros = (s: SemanaGerada, p: PerfilGerador) => validarSemana(s, p).map((x) => `${x.codigo}: ${x.msg}`);
const clone = (s: SemanaGerada): SemanaGerada => JSON.parse(JSON.stringify(s));

// ---------- gerador ----------
test("perfil padrão: semana válida, 2× por músculo, prioridades no topo do volume, compostos antes", () => {
  const p = base(), s = gerarSemana(p);
  assert.deepEqual(erros(s, p), []);
  assert.deepEqual(s.dias.map((d) => d.dow), ["seg", "ter", "qui", "sex"]);
  const { v, f } = volume(s);
  for (const m of MUSCLE_IDS) assert.ok((f[m] ?? 0) >= 2, `${m} 2×`);
  for (const m of p.prioridades) {
    assert.ok((v[m] ?? 0) >= 9, `${m}: prioridade perto de 10 séries com 60 min`);
    for (const o of ["peito", "costas", "post"] as MuscleId[]) assert.ok((v[m] ?? 0) > (v[o] ?? 0), `${m} > ${o}`);
  }
  for (const d of s.dias) {
    const k = d.itens.map((i) => ehComposto(EXERCISE_BY_ID[i.exerciseId]));
    assert.ok(k.indexOf(false) === -1 || k.lastIndexOf(true) < k.indexOf(false), `${d.dow}: composto depois de isolado`);
    assert.ok(d.itens.reduce((a, i) => a + i.sets, 0) * MIN_POR_SERIE <= 60, "cabe no tempo");
  }
});

test("determinístico: o mesmo perfil dá a mesma semana", () => {
  const p = base({ sexo: "f", dores: [{ region: "ombro_e", intensity: 2 }] });
  assert.deepEqual(gerarSemana(p), gerarSemana(p));
});

test("sem repetir o mesmo padrão em dias seguidos (seg/ter/qua corpo inteiro e divisão)", () => {
  for (const dias of [["seg", "ter"], ["seg", "ter", "qua"], ["seg", "ter", "qua", "qui", "sex", "sab"]]) {
    const p = base({ dias }), s = gerarSemana(p);
    assert.deepEqual(erros(s, p), [], dias.join(","));
    for (let k = 1; k < s.dias.length; k++) {
      if (DOWS.indexOf(s.dias[k].dow) - DOWS.indexOf(s.dias[k - 1].dow) !== 1) continue;
      const ontem = new Set(s.dias[k - 1].itens.map((i) => padraoDe(EXERCISE_BY_ID[i.exerciseId])));
      for (const i of s.dias[k].itens) assert.ok(!ontem.has(padraoDe(EXERCISE_BY_ID[i.exerciseId])), `${s.dias[k].dow} repete ${i.exerciseId}`);
    }
  }
});

test("dores: nenhum exercício bloqueado pela dor; músculo sem opção vai para fora com motivo dor", () => {
  const dores: Pain[] = [{ region: "ombro_d", intensity: 3 }, { region: "joelho_e", intensity: 2 }];
  const p = base({ dores }), s = gerarSemana(p);
  assert.deepEqual(erros(s, p), []);
  for (const d of s.dias) for (const i of d.itens) assert.ok(!painBlocks(EXERCISE_BY_ID[i.exerciseId], dores), i.exerciseId);
});

test("sem academia: só peso corporal + o que foi marcado; o resto sai com motivo aparelho", () => {
  const p0 = base({ equipamentos: null }), s0 = gerarSemana(p0);
  assert.deepEqual(erros(s0, p0), []);
  for (const d of s0.dias) for (const i of d.itens) assert.deepEqual(EXERCISE_BY_ID[i.exerciseId].eq, [], i.exerciseId);
  assert.ok(s0.fora.some((x) => x.musculo === "biceps" && x.motivo === "aparelho"));
  assert.ok(s0.dias.some((d) => d.itens.some((i) => i.muscle === "peito")), "flexão entra");

  const p1 = base({ equipamentos: ["halteres", "elastico"] }), s1 = gerarSemana(p1);
  assert.deepEqual(erros(s1, p1), []);
  for (const d of s1.dias) for (const i of d.itens) assert.ok(EXERCISE_BY_ID[i.exerciseId].eq.every((q) => ["halteres", "elastico"].includes(q)), i.exerciseId);
  const { f } = volume(s1);
  assert.ok((f.biceps ?? 0) >= 2 && (f.ombro ?? 0) >= 2, "halteres dão braço e ombro 2×");
});

test("pouco tempo (2 dias × 20 min): prioridades nunca saem; o resto sai por tempo", () => {
  const p = base({ dias: ["seg", "qui"], minutos: 20, prioridades: ["ombro", "biceps", "triceps", "peito", "costas"] }), s = gerarSemana(p);
  assert.deepEqual(erros(s, p), []);
  const { f } = volume(s);
  for (const m of p.prioridades) assert.ok((f[m] ?? 0) >= 2, `${m} 2×`);
  assert.ok(s.fora.every((x) => x.motivo !== "tempo" || !p.prioridades.includes(x.musculo)));
});

test("1 dia: monta 2 (2× por músculo) e avisa", () => {
  const p = base({ dias: ["qua"] }), s = gerarSemana(p);
  assert.equal(s.dias.length, 2);
  assert.ok(s.avisos.some((a) => a.includes("2 dias")));
  assert.deepEqual(erros(s, p), []);
});

// ---------- diferenças por sexo (decisão A) ----------
test("mulher: +10–20% de volume, mais repetições e descanso 60–90 s nos isolados", () => {
  const pm = base({ minutos: 120, dias: ["seg", "ter", "qua", "qui", "sex"] }), pf = { ...pm, sexo: "f" as const };
  assert.ok(FATOR_VOLUME_F >= 1.1 && FATOR_VOLUME_F <= 1.2);
  const fm = faixasSemana(pm), ff = faixasSemana(pf);
  for (const m of MUSCLE_IDS) {
    const a = fm.musculos[m].alvo, b = ff.musculos[m].alvo;
    assert.ok(b >= a && b <= Math.ceil(a * 1.2), `${m}: ${a} → ${b}`);
  }
  assert.ok(MUSCLE_IDS.some((m) => ff.musculos[m].alvo > fm.musculos[m].alvo));
  const sm = gerarSemana(pm), sf = gerarSemana(pf);
  assert.deepEqual(erros(sf, pf), []);
  const isol = sf.dias.flatMap((d) => d.itens).filter((i) => !ehComposto(EXERCISE_BY_ID[i.exerciseId]));
  assert.ok(isol.length > 0);
  for (const i of isol) assert.ok(i.rest >= DESCANSO_ISOLADO_F[0] && i.rest <= DESCANSO_ISOLADO_F[1], `${i.exerciseId} ${i.rest}s`);
  const ex = (s: SemanaGerada, id: string) => s.dias.flatMap((d) => d.itens).find((i) => i.exerciseId === id);
  const comum = sf.dias.flatMap((d) => d.itens).find((i) => ex(sm, i.exerciseId));
  assert.ok(comum, "algum exercício em comum");
  assert.ok(comum!.reps[1] > ex(sm, comum!.exerciseId)!.reps[1], "mais repetições");
  assert.ok(sf.avisos.some((a) => /sintoma/i.test(a)), "ciclo: ajuste por sintomas, não por fase");
});

test("avisos de saúde levam a profissional, sem diagnóstico", () => {
  const s = gerarSemana(base({ sexo: "f", saude: ["gestacao", "red_s"] }));
  assert.ok(s.avisos.filter((a) => /profissional/.test(a)).length >= 2);
  assert.ok(!s.avisos.some((a) => /você tem|diagnóstico de/i.test(a)));
});

// ---------- validador ----------
test("validador aponta cada violação", () => {
  const p = base(), s = gerarSemana(p);
  const cod = (x: SemanaGerada, pp = p) => new Set(validarSemana(x, pp).map((v) => v.codigo));

  const a = clone(s); a.dias[0].itens.push({ ...a.dias[0].itens[0], exerciseId: "Nao_Existe" }); assert.ok(cod(a).has("catalogo"));
  const b = clone(s); for (const d of b.dias) d.itens = d.itens.filter((i) => i.muscle !== "biceps" || d.dow !== "qui"); assert.ok(cod(b).has("frequencia") || cod(b).has("volume_min"));
  const c = clone(s); c.dias[0].itens.forEach((i) => (i.sets = 6)); assert.ok(cod(c).has("tempo"));
  const d = clone(s); d.dias[0].itens.reverse(); assert.ok(cod(d).has("ordem"));
  const e = clone(s); for (const dd of e.dias) dd.itens = dd.itens.filter((i) => i.muscle !== "ombro"); assert.ok(cod(e).has("fora"), "prioridade fora sem motivo");
  const f = clone(s); const it = f.dias.flatMap((x) => x.itens).find((i) => i.muscle === "peito")!; it.sets = 40; assert.ok(cod(f).has("volume_max"));
  const dor: Pain[] = [{ region: "ombro_d", intensity: 3 }];
  assert.ok(cod(s, { ...p, dores: dor }).has("dor"), "semana sem dor validada com dor forte no ombro");
  assert.ok(cod(s, { ...p, equipamentos: null }).has("aparelho"));
  const g = clone(s); g.dias[0].dow = "qua"; assert.ok(cod(g).has("dia"));
  const h = clone(s); h.dias[0].itens[0].reps = [1, 3]; assert.ok(cod(h).has("reps"));

  // padrão em dias seguidos: seg e ter com o mesmo exercício
  const pa = base({ dias: ["seg", "ter"] }), sa = gerarSemana(pa);
  const x = clone(sa); const ombroTer = x.dias[1].itens.find((i) => i.muscle === "ombro")!;
  ombroTer.exerciseId = x.dias[0].itens.find((i) => i.muscle === "ombro")!.exerciseId;
  assert.ok(cod(x, pa).has("padrao"));
});

// ---------- teste de propriedade ----------
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function perfilAleatorio(r: () => number): PerfilGerador {
  const pick = <T,>(xs: readonly T[], p: number) => xs.filter(() => r() < p);
  const prios = pick(MUSCLE_IDS, 0.3).slice(0, 5);
  const eqMode = r();
  const equipamentos = eqMode < 0.15 ? null : eqMode < 0.3 ? pick(["halteres", "elastico", "barrafixa", "banco", "paralela"], 0.5) : pick(ALL, 0.15 + r() * 0.85);
  const dores: Pain[] = pick(PAIN_REGIONS, 0.08).map((x) => ({ region: x.id, intensity: (1 + Math.floor(r() * 3)) as 1 | 2 | 3 }));
  return {
    sexo: r() < 0.5 ? "m" : r() < 0.9 ? "f" : null, nivel: Math.floor(r() * 4) as 0 | 1 | 2 | 3, prioridades: prios, equipamentos,
    dias: pick(DOWS, r()), diasMeta: r() < 0.3 ? 1 + Math.floor(r() * 7) : undefined, minutos: 20 + Math.floor(r() * 161), dores,
    evitar: pick(EXERCISES, 0.03).map((e) => e.id),
  };
}

test("propriedade: 600 perfis aleatórios (seed fixa) → 0 semanas inválidas", () => {
  const r = rng(65);
  const ruins: string[] = [];
  for (let k = 0; k < 600; k++) {
    const p = perfilAleatorio(r);
    const s = gerarSemana(p);
    const v = validarSemana(s, p);
    if (v.length) ruins.push(`#${k} ${JSON.stringify(p)} → ${v.map((x) => x.codigo + ":" + x.msg).join(" | ")}`);
    assert.ok(s.dias.length >= 2);
  }
  assert.equal(ruins.length, 0, ruins.slice(0, 3).join("\n"));
});

// ---------- IA revisora (tier haiku) ----------
test("IA: sem resposta, fica a determinística igual", () => {
  const p = base(), det = gerarSemana(p);
  const r = aplicarRevisaoIA(det, null, p);
  assert.equal(r.fonte, "deterministica");
  assert.deepEqual(r.semana, det);
});

test("IA: resposta dentro das regras é aceita (troca de exercício pela mesma parte)", () => {
  const p = base(), det = gerarSemana(p);
  const comp = compactarSemana(det);
  // troca a elevação lateral de um dia por outra opção válida (alts) sem mexer nas séries
  const dia = det.dias.find((d) => d.itens.some((i) => i.muscle === "ombro" && i.alts.length))!;
  const it = dia.itens.find((i) => i.muscle === "ombro" && i.alts.length)!;
  const alvoDia = comp.dias.find((d) => d.dow === dia.dow)!;
  const novo = it.alts.find((id) => ehComposto(EXERCISE_BY_ID[id]) === ehComposto(EXERCISE_BY_ID[it.exerciseId]))!;
  alvoDia.itens.find((i) => i.id === it.exerciseId)!.id = novo;
  const r = aplicarRevisaoIA(det, JSON.stringify(comp), p);
  assert.deepEqual(r.violacoes.map((v) => v.msg), []);
  assert.equal(r.fonte, "ia");
  assert.ok(r.semana.dias.some((d) => d.itens.some((i) => i.exerciseId === novo)));
});

test("IA: resposta fora das regras é descartada e fica a determinística", () => {
  const p = base({ dores: [{ region: "joelho_d", intensity: 3 }] }), det = gerarSemana(p);
  const ruins: unknown[] = [
    "não é json",
    { dias: "x" },
    { dias: [{ dow: "seg", itens: [{ id: "Inventado", sets: 3 }] }] },
    (() => { const c = compactarSemana(det); c.dias[0].itens[0].sets = 30; return c; })(),
    (() => { const c = compactarSemana(det); c.dias[1].itens.push({ id: "Barbell_Full_Squat", sets: 3 }); return c; })(),
    (() => { const c = compactarSemana(det); c.dias = c.dias.map((d) => ({ ...d, itens: d.itens.filter((i) => EXERCISE_BY_ID[i.id].m !== "biceps") })); return c; })(),
  ];
  for (const resp of ruins) {
    const r = aplicarRevisaoIA(det, resp, p);
    assert.equal(r.fonte, "deterministica", JSON.stringify(resp).slice(0, 80));
    assert.ok(r.violacoes.length > 0);
    assert.deepEqual(r.semana, det);
    assert.deepEqual(validarSemana(r.semana, p), []);
  }
});

test("IA: pedido de revisão vai para o tier haiku e leva as regras e a semana compacta", () => {
  const p = base(), det = gerarSemana(p);
  const q = pedidoRevisaoIA(det, p);
  assert.equal(q.tier, TIER_REVISAO);
  assert.equal(TIER_REVISAO, "haiku");
  assert.ok(q.texto.includes("2×") && q.texto.includes("JSON"));
  assert.ok(q.texto.includes(det.dias[0].itens[0].exerciseId));
});

// ---------- docs/09: cada constante aponta para a seção do doc ----------
test("cada constante exportada do gerador aponta para uma seção que existe em docs/09-base-cientifica.md", () => {
  const src = readFileSync(new URL("../src/gerador.ts", import.meta.url), "utf8");
  const doc = readFileSync(new URL("../../../docs/09-base-cientifica.md", import.meta.url), "utf8");
  const slug = (h: string) => h.trim().toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").replace(/ /g, "-");
  const ancoras = new Set([...doc.matchAll(/^#{2,4} (.+)$/gm)].map((m) => slug(m[1])));
  const nomes = [...src.matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
  assert.ok(nomes.length >= 8);
  for (const nome of nomes) {
    const m = src.match(new RegExp(`/\\*\\*((?:(?!\\*/)[\\s\\S])*)\\*/\\s*export const ${nome}\\b`));
    assert.ok(m, `${nome} sem comentário`);
    const ref = m![1].match(/docs\/09-base-cientifica\.md#([\p{L}\p{N}-]+)/u);
    assert.ok(ref, `${nome} não aponta para docs/09`);
    assert.ok(ancoras.has(ref![1]), `${nome}: seção #${ref![1]} não existe no doc`);
  }
  // fontes citadas nas seções novas
  for (const f of ["Schoenfeld", "Roberts", "Hunter", "McNulty", "Refalo", "Mountjoy"]) assert.ok(doc.includes(f), `doc sem ${f}`);
  assert.ok(REPS_FAIXA[0] === 5 && REPS_FAIXA[1] === 30);
});
