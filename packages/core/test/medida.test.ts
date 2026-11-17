// #106 Exercício por tempo ou repetições: medida/medidaPadrao no catálogo, série por tempo (1–3600 s) e contagem de volume.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXERCISES, EXERCISE_BY_ID, medidaDe, medidaPadraoDe, temSeletorMedida, erroSerie, lerSegundos, fmtSegundos, contarSeries, refsTempo, fmtSerie,
  sessionSummary, detectPrs, creditoMusculos, contexto, tempoSugerido, mergeSessionSets, fmtPrValor,
} from "../src/index.ts";
import type { EstadoContexto } from "../src/index.ts";

test("medida: prancha só tempo, polichinelo ambos com tempo padrão, supino reps sem seletor", () => {
  assert.equal(medidaDe("Plank"), "tempo");
  assert.equal(medidaPadraoDe("Plank"), "tempo");
  assert.equal(temSeletorMedida("Plank"), false);
  assert.equal(medidaDe("Side_Bridge"), "tempo");
  assert.equal(medidaDe("Star_Jump"), "ambos");
  assert.equal(EXERCISE_BY_ID.Star_Jump.nm, "Polichinelo");
  assert.equal(medidaPadraoDe("Star_Jump"), "tempo");
  assert.equal(temSeletorMedida("Star_Jump"), true);
  for (const id of ["Barbell_Bench_Press_-_Medium_Grip", "Side_Lateral_Raise", "Pushups", "id_que_nao_existe"]) {
    assert.equal(medidaDe(id), "reps", id); assert.equal(medidaPadraoDe(id), "reps", id); assert.equal(temSeletorMedida(id), false, id);
  }
});

test("medida: medidaPadrao só existe (e é obrigatório) quando a medida é ambos; a maioria fica em reps", () => {
  for (const e of EXERCISES) {
    if (e.medida === "ambos") assert.ok(e.medidaPadrao === "tempo" || e.medidaPadrao === "reps", e.id);
    else assert.equal(e.medidaPadrao, undefined, e.id);
    assert.ok(e.medida === undefined || e.medida === "tempo" || e.medida === "ambos", `${e.id}: medida reps é o padrão, não declare`);
  }
  assert.ok(EXERCISES.filter((e) => e.medida).length <= 10, "só os exercícios em que tempo faz sentido");
});

test("série por tempo: 1–3600 s inteiros; reps OU segundos; respeita a medida do exercício", () => {
  assert.equal(erroSerie("Plank", { segundos: 45 }), null);
  assert.equal(erroSerie("Plank", { segundos: 1 }), null);
  assert.equal(erroSerie("Plank", { segundos: 3600 }), null);
  for (const s of [0, 3601, 4.5, -1]) assert.match(erroSerie("Plank", { segundos: s })!, /segundos fora/, String(s));
  assert.match(erroSerie("Plank", {})!, /segundos obrigatório/);
  assert.match(erroSerie("Plank", { reps: 10 })!, /tempo/);
  assert.equal(erroSerie("Star_Jump", { segundos: 60 }), null);
  assert.equal(erroSerie("Star_Jump", { reps: 30 }), null);
  assert.match(erroSerie("Star_Jump", { reps: 30, segundos: 60 })!, /não os dois/);
  assert.match(erroSerie("Barbell_Bench_Press_-_Medium_Grip", { segundos: 30 })!, /repetições/);
  assert.equal(erroSerie("Barbell_Bench_Press_-_Medium_Grip", { reps: 8 }), null);
  assert.match(erroSerie("Barbell_Bench_Press_-_Medium_Grip", { reps: 101 })!, /reps fora/);
});

test("tempo: lê s ou mm:ss e formata mm:ss", () => {
  assert.equal(lerSegundos("45"), 45);
  assert.equal(lerSegundos("1:30"), 90);
  assert.equal(lerSegundos("01:05"), 65);
  assert.equal(lerSegundos(" 60:00 "), 3600);
  for (const x of ["", "0", "0:00", "1:75", "abc", "60:01", "3601", "-5"]) assert.equal(lerSegundos(x), null, x);
  assert.equal(fmtSegundos(45), "0:45");
  assert.equal(fmtSegundos(90), "1:30");
  assert.equal(fmtSegundos(3600), "60:00");
});

test("volume: série por tempo conta como série (semana e resumo), fora do kg × reps", () => {
  const prancha = [{ kg: 0, reps: 0, segundos: 45 }, { kg: 0, reps: 0, segundos: 40 }];
  const supino = [{ kg: 60, reps: 8 }, { kg: 60, reps: 0 }];
  assert.equal(contarSeries(prancha), 2);
  assert.equal(contarSeries(supino), 1, "0 reps sem tempo não conta");
  assert.deepEqual(creditoMusculos({ Plank: 2, Star_Jump: 1 }), { core: 2, pant: 1 });
  const r = sessionSummary(60_000, { Plank: prancha, "Barbell_Bench_Press_-_Medium_Grip": [{ kg: 60, reps: 8 }] }, {});
  assert.equal(r.sets, 3);
  assert.equal(r.volume, 480);
});

test("histórico por tempo: último, melhor e recorde de tempo; série mostra mm:ss ou reps", () => {
  const past = [[{ kg: 0, reps: 30 }], [{ kg: 0, reps: 0, segundos: 50 }, { kg: 0, reps: 0, segundos: 40 }], [{ kg: 0, reps: 0, segundos: 60 }]];
  assert.deepEqual(refsTempo(past), { ultimo: 50, melhor: 60, series: 2 });
  assert.equal(refsTempo([[{ kg: 20, reps: 10 }]]), null);
  assert.deepEqual(detectPrs(past, [{ kg: 0, reps: 0, segundos: 75 }]), [{ kind: "tempo", value: 75, prev: 60 }]);
  assert.deepEqual(detectPrs(past, [{ kg: 0, reps: 0, segundos: 55 }]), []);
  assert.equal(fmtSerie({ kg: 0, reps: 0, segundos: 45 }), "0:45");
  assert.equal(fmtSerie({ kg: 0, reps: 30 }), "30 reps");
  assert.equal(fmtSerie({ kg: 20, reps: 10 }), "20 kg × 10");
});

test("contexto trocar/dor informa a medida dos exercícios por tempo (reps fica implícito)", () => {
  const e = {
    data: "2026-11-12", perfil: {}, aparelhos: ["halteres"], academiaCheia: false, dores: [], exercicioId: "Plank",
    dia: { itens: [{ exerciseId: "Plank", sets: 3 }, { exerciseId: "Star_Jump", sets: 2 }, { exerciseId: "Side_Lateral_Raise", sets: 3 }] },
  } as unknown as EstadoContexto;
  const f = contexto("trocar", e) as any;
  assert.deepEqual(f.dia.itens, [{ id: "Plank", sets: 3, medida: "tempo" }, { id: "Star_Jump", sets: 2, medida: "ambos", medidaPadrao: "tempo" }, { id: "Side_Lateral_Raise", sets: 3 }]);
  assert.equal(f.exercicio.medida, "tempo");
});

test("tempo sugerido: isométrico começa no início da faixa (s); 'ambos' em 30 s; último tempo feito vence", () => {
  assert.equal(tempoSugerido("Plank"), 30);
  assert.equal(tempoSugerido("Side_Bridge"), 20);
  assert.equal(tempoSugerido("Star_Jump"), 30);
  assert.equal(tempoSugerido("Plank", [[{ kg: 0, reps: 0, segundos: 50 }]]), 50);
  assert.equal(tempoSugerido("Plank", [[{ kg: 0, reps: 12 }]]), 30);
});

test("recarregar a sessão: série por tempo do servidor volta como tempo (mm:ss)", () => {
  const m = mergeSessionSets({}, [{ exerciseId: "Plank", setNo: 1, kg: null, reps: null, segundos: 45 }, { exerciseId: "Star_Jump", setNo: 1, kg: null, reps: 30, segundos: null }]);
  assert.deepEqual(m.Plank, [{ kg: "", reps: "", done: true, modo: "tempo", seg: "0:45" }]);
  assert.deepEqual(m.Star_Jump, [{ kg: "", reps: 30, done: true }]);
});

test("recorde em texto: tempo em mm:ss, reps em reps, carga/e1RM em kg", () => {
  assert.equal(fmtPrValor("tempo", 75), "1:15");
  assert.equal(fmtPrValor("reps", 12), "12 reps");
  assert.equal(fmtPrValor("carga", 62.5), "62,5 kg");
  assert.equal(fmtPrValor("e1rm", 80), "80 kg");
});
