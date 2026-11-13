// #43 Comida 3.0: base de alimentos (30 comuns + base pessoal), reconhecimento "3 ovos e 2 pães", faltas do dia e resumo da semana.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALIMENTOS_COMUNS, ALIMENTO_BY_KEY, baseAlimentos, reconhecerAlimentos, estimarComBase, faltaHoje, porUnidade, dePorUnidade, semanaComida,
} from "../src/index.ts";
import type { Alimento, FoodEntry } from "../src/index.ts";

const ovo = ALIMENTO_BY_KEY.ovo, whey = ALIMENTO_BY_KEY.whey, frango = ALIMENTO_BY_KEY.frango;

test("30 alimentos comuns, chaves únicas, todos com unidade caseira em gramas e macros por 100 g", () => {
  assert.equal(ALIMENTOS_COMUNS.length, 30);
  assert.equal(new Set(ALIMENTOS_COMUNS.map((a) => a.key)).size, 30);
  for (const a of ALIMENTOS_COMUNS) {
    assert.ok(a.unidades.length >= 1, a.key);
    for (const u of a.unidades) assert.ok(u.g > 0 && u.g <= 500, `${a.key}/${u.nome}`);
    for (const k of ["kcal", "prot", "carb", "gord"] as const) assert.ok(a[k] >= 0 && Number.isFinite(a[k]), `${a.key}.${k}`);
    assert.ok(a.kcal <= 900 && a.prot <= 100 && a.carb <= 100 && a.gord <= 100, a.key);
    assert.ok(a.termos.length >= 1, a.key);
  }
  for (const k of ["ovo", "pao", "whey", "arroz", "frango"]) assert.ok(ALIMENTO_BY_KEY[k], k);
});

test("reconhecer '3 ovos e 2 pães' pela base comum: unidade caseira e gramas", () => {
  const r = reconhecerAlimentos("3 ovos e 2 pães", []);
  assert.deepEqual(r.map((p) => [p.key, p.qtd, p.unidade, p.g, p.fonte, p.texto]), [["ovo", 3, "ovo", 150, "comum", "3 ovos"], ["pao", 2, "pão", 100, "comum", "2 pães"]]);
  const e = estimarComBase("3 ovos e 2 pães", []);
  assert.equal(e.kcal, Math.round(150 * ovo.kcal / 100 + 100 * ALIMENTO_BY_KEY.pao.kcal / 100));
  assert.equal(e.prot, Math.round((150 * ovo.prot / 100 + 100 * ALIMENTO_BY_KEY.pao.prot / 100) * 10) / 10);
});

test("unidade caseira pelo nome ('2 colheres de arroz', '1 scoop de whey'), gramas explícitas e por extenso", () => {
  const [arroz] = reconhecerAlimentos("2 colheres de arroz", []);
  assert.deepEqual([arroz.key, arroz.unidade, arroz.g], ["arroz", "colher", 2 * ALIMENTO_BY_KEY.arroz.unidades.find((u) => u.nome === "colher")!.g]);
  const [w] = reconhecerAlimentos("um scoop de whey", []);
  assert.deepEqual([w.key, w.qtd, w.g], ["whey", 1, 30]);
  const [f] = reconhecerAlimentos("frango 200g", []);
  assert.deepEqual([f.key, f.g, f.unidade, f.texto], ["frango", 200, "g", "200 g de frango"]);
  assert.equal(arroz.texto, "2 colheres de arroz");
  // o termo mais longo vence: "pão de queijo" não é "pão", "batata doce" não é "batata"
  assert.deepEqual(reconhecerAlimentos("2 pães de queijo, batata-doce", []).map((p) => p.key), ["pao-queijo", "batata-doce"]);
});

test("base pessoal vence a comum: o ajuste do usuário muda a estimativa", () => {
  const meuOvo: Alimento = { ...ovo, prot: 14, kcal: 160, unidades: [{ nome: "ovo", g: 60 }] };
  const r = reconhecerAlimentos("3 ovos", [meuOvo]);
  assert.deepEqual([r[0].fonte, r[0].g], ["pessoal", 180]);
  assert.equal(estimarComBase("3 ovos", [meuOvo]).kcal, Math.round(180 * 1.6));
  // a base mesclada: pessoal primeiro, sem duplicar a chave
  const b = baseAlimentos([meuOvo]);
  assert.equal(b.length, 30);
  assert.equal(b[0], meuOvo);
});

test("o que a base não conhece cai na estimativa antiga; texto hostil não quebra", () => {
  const e = estimarComBase("3 ovos e salada", []);
  assert.ok(e.partes.some((p) => p.key === "salada"));
  const x = estimarComBase("x'; DROP TABLE food_log;-- <script>alert(1)</script>", []);
  assert.deepEqual([x.kcal, x.prot, x.partes.length], [0, 0, 0]);
  const muito = reconhecerAlimentos("99 ovos", []);
  assert.equal(muito[0].qtd, 12, "teto de 12 unidades");
});

test("porUnidade/dePorUnidade: ida e volta", () => {
  const u = porUnidade(ovo, ovo.unidades[0]);
  assert.equal(u.prot, Math.round(50 * ovo.prot / 100 * 10) / 10);
  const back = dePorUnidade(50, { kcal: 80, prot: 7, carb: 0.5, gord: 5 });
  assert.deepEqual(back, { kcal: 160, prot: 14, carb: 1, gord: 10 });
});

test("faltaHoje: 'faltam 38 g / ~600 kcal' e 2 sugestões dos alimentos que a pessoa come", () => {
  const meta = { kcal: 2650, protein: 150 };
  const r = faltaHoje(meta, { kcal: 2047, prot: 112 }, [ovo, whey, frango]);
  assert.equal(r.prot, 38);
  assert.equal(r.kcal, 600);
  assert.equal(r.sugestoes.length, 2);
  assert.equal(r.sugestoes[0].texto, "2 ovos + 1 scoop de whey = 37 g");
  assert.equal(r.sugestoes[0].prot, 37);
  assert.ok(r.sugestoes[0].kcal <= 600);
  // a 2ª usa outra combinação
  assert.notDeepEqual(r.sugestoes[1].itens.map((i) => i.key).sort(), r.sugestoes[0].itens.map((i) => i.key).sort());
  assert.ok(r.sugestoes[1].prot >= 30 && r.sugestoes[1].prot <= 50, String(r.sugestoes[1].prot));
});

test("faltaHoje: meta batida não sugere; sem base pessoal usa os comuns ricos em proteína", () => {
  const ok = faltaHoje({ kcal: 2000, protein: 140 }, { kcal: 2100, prot: 139 }, [ovo]);
  assert.deepEqual([ok.prot, ok.kcal, ok.sugestoes.length], [1, 0, 0], "≥ 95% da proteína: batida");
  const vazio = faltaHoje({ kcal: 2600, protein: 150 }, { kcal: 0, prot: 0 }, []);
  assert.equal(vazio.prot, 150);
  assert.equal(vazio.sugestoes.length, 2);
  for (const s of vazio.sugestoes) for (const i of s.itens) assert.ok(ALIMENTO_BY_KEY[i.key].prot >= 8, i.key);
  // só alimentos com proteína entram (banana não)
  const soBanana = faltaHoje({ kcal: 2600, protein: 150 }, { kcal: 1000, prot: 100 }, [ALIMENTO_BY_KEY.banana]);
  assert.ok(soBanana.sugestoes.every((s) => s.itens.every((i) => i.key !== "banana")));
});

test("semanaComida: dias abaixo da meta e bebida separada", () => {
  const end = "2026-11-10";
  const E: FoodEntry[] = [
    { date: "2026-11-08", kcal: 2000, prot: 150 },
    { date: "2026-11-09", kcal: 1500, prot: 100 },
    { id: "bebida-1", date: "2026-11-09", kcal: 300, prot: 0 },
    { date: "2026-11-10", kcal: 2700, prot: 160 },
    { id: "bebida-2", date: "2026-11-10", kcal: 150, prot: 0 },
    { id: "bebida-velha", date: "2026-11-01", kcal: 999, prot: 0 },
  ];
  const s = semanaComida(E, end, { kcal: 2600, protein: 150 });
  assert.deepEqual(s.abaixoProt, 1, "11-09 abaixo de 95%");
  assert.deepEqual(s.abaixoKcal, 2, "11-08 e 11-09 abaixo de 90%");
  assert.deepEqual(s.bebida, { kcal: 450, dias: 2 });
  assert.equal(s.dias, 3);
});
