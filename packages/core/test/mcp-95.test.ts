// #95 O MCP lê o "Meu treino atual" e as academias: resumo compacto do treino atual (null / [] / divisões + quem
// preencheu), academias com os aparelhos (só IDs de EQUIPMENT), a academia do dia e o aparelho que falta. Fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, MCP_CONTRATO, academiaDoDia, academiasMcp, aparelhosFaltando, resumoTreinoAtual, tamanhoJson } from "../src/index.ts";

const comLegpress = EXERCISES.find((e) => e.eq.includes("legpress"))!;
const soHalter = EXERCISES.find((e) => e.eq.length === 1 && e.eq[0] === "halteres")!;

test("contrato 1.2.1", () => assert.equal(MCP_CONTRATO, "1.2.1"));

test("resumoTreinoAtual: null sem cadastro, [] 'estou começando', divisões compactas e quem preencheu", () => {
  assert.deepEqual(resumoTreinoAtual(null), { treinoAtual: null });
  assert.deepEqual(resumoTreinoAtual({}), { treinoAtual: null });
  assert.deepEqual(resumoTreinoAtual({ treinoAtual: { divisoes: [] }, meta: { filledBy: "app" } }), { treinoAtual: [], treinoAtualPor: "você" });
  const r = resumoTreinoAtual({
    meta: { filledBy: "claude", confirmed: false },
    treinoAtual: { divisoes: [
      { nome: "A", grupos: ["peito", "triceps"], exercicios: [{ id: soHalter.id, sets: 3, reps: 10, kg: 20 }, { nome: "Supino da academia", grupo: "peito" }] },
      { nome: "B", grupos: ["pernas"], exercicios: [{ id: comLegpress.id }] },
    ] },
  });
  assert.equal(r.treinoAtualPor, "Chat");
  assert.ok(Array.isArray(r.treinoAtual) && r.treinoAtual.length === 2);
  const [a, b] = r.treinoAtual as { nome: string; grupos: string[]; ex: string[] }[];
  assert.equal(a.nome, "A"); assert.deepEqual(a.grupos, ["peito", "triceps"]);
  assert.deepEqual(a.ex, [`${soHalter.id} 3×10 20kg`, "livre: Supino da academia (peito)"]);
  assert.deepEqual(b.ex, [comLegpress.id]);
});

test("resumoTreinoAtual é compacto: divisão grande corta e diz quantos faltam (o completo vem do ciclo_treino_atual)", () => {
  const ids = EXERCISES.slice(0, 24).map((e) => ({ id: e.id, sets: 4, reps: 12, kg: 100 }));
  const t = { divisoes: Array.from({ length: 7 }, (_, i) => ({ nome: `Treino ${i}`, grupos: ["peito"], exercicios: ids })) };
  const r = resumoTreinoAtual({ treinoAtual: t });
  const ds = r.treinoAtual as { ex: string[]; mais?: number }[];
  assert.ok(ds.every((d) => d.ex.length <= 12 && d.mais === 12));
  assert.ok(tamanhoJson(r) < 4_500, `${tamanhoJson(r)} bytes`);
});

test("academiasMcp: id, nome numa linha e só aparelhos que existem no catálogo; academiaDoDia: plano > dia da semana > primeira", () => {
  const gyms = [
    { id: "g1", name: "Academia\nExemplo  Centro", equipment: ["halteres", "banco", "nao_existe"] },
    { id: "g2", name: "Prédio", equipment: ["halteres", "legpress"] },
  ];
  assert.deepEqual(academiasMcp(gyms), [{ id: "g1", nome: "Academia Exemplo Centro", aparelhos: ["halteres", "banco"] }, { id: "g2", nome: "Prédio", aparelhos: ["halteres", "legpress"] }]);
  const seg = "2026-11-16"; // segunda
  assert.equal(academiaDoDia(gyms, { date: seg }), "g1");
  assert.equal(academiaDoDia(gyms, { date: seg, dayGym: { seg: "g2" } }), "g2");
  assert.equal(academiaDoDia(gyms, { date: seg, dayGym: { seg: "g2" }, planoGymId: "g1" }), "g1");
  assert.equal(academiaDoDia(gyms, { date: seg, dayGym: { seg: "apagada" } }), "g1", "academia que não existe mais não vale");
  assert.equal(academiaDoDia([], { date: seg }), null);
});

test("aparelhosFaltando: o exercício que pede aparelho que a academia não tem; fora do catálogo é ignorado", () => {
  assert.deepEqual(aparelhosFaltando([soHalter.id, comLegpress.id, "inventado"], ["halteres"]), [{ id: comLegpress.id, nm: comLegpress.nm, faltam: comLegpress.eq.filter((q) => q !== "halteres") }]);
  assert.deepEqual(aparelhosFaltando([comLegpress.id], comLegpress.eq), []);
});
