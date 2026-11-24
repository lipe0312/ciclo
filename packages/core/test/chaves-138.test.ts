// #138 Limites de gasto blindados (ADR-0015): assimetria da prova (baixar = sessão; subir/ativar/trocar = Face ID de
// 60 s), subida com espera de 24 h, teto global da conta, disjuntor de velocidade e aviso a 80%. Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERTA_CONSUMO, CHAVE_ESPERA_SUBIDA_MS, CHAVE_REAUTH_LIMITE_MS, CHAVE_TETO_CONTA_CENT, CHAVE_TETO_MAX_USD, DISJUNTOR, alertaConsumo, aplicarPendente,
  cabeNoTetoConta, chaveGratis, disjuntor, planejarTetos, provaExigida, textoAlertaConsumo,
} from "../src/chaves.ts";
import { REAUTH_SENSIVEL_MS, faceIdRecente } from "../src/cadastro.ts";

const H = 3_600_000;
const T0 = Date.parse("2026-11-23T12:00:00Z");

test("faceIdRecente: janela padrão de 5 min e janela curta de 60 s parametrizada", () => {
  assert.equal(CHAVE_REAUTH_LIMITE_MS, 60_000);
  assert.ok(CHAVE_REAUTH_LIMITE_MS < REAUTH_SENSIVEL_MS);
  assert.equal(faceIdRecente(T0 - 2 * 60_000, T0), true, "5 min: 2 min atrás vale");
  assert.equal(faceIdRecente(T0 - 2 * 60_000, T0, CHAVE_REAUTH_LIMITE_MS), false, "60 s: 2 min atrás não vale");
  assert.equal(faceIdRecente(T0 - 30_000, T0, CHAVE_REAUTH_LIMITE_MS), true);
  assert.equal(faceIdRecente(null, T0, CHAVE_REAUTH_LIMITE_MS), false);
});

test("assimetria: reduzir risco nunca pede prova; subir, ativar e trocar pedem Face ID de 60 s; o resto, Face ID de 5 min", () => {
  assert.equal(provaExigida({}), "sessao", "baixar teto, desativar, apagar, cancelar subida");
  assert.equal(provaExigida({ sobeTeto: true }), "faceid60");
  assert.equal(provaExigida({ ativa: true }), "faceid60");
  assert.equal(provaExigida({ trocaSegredo: true }), "faceid60");
  assert.equal(provaExigida({ cadastra: true }), "faceid", "cadastrar segue com os 5 min da #88 (o teto nasce dentro do global)");
  assert.equal(provaExigida({ ajuste: true }), "faceid", "apelido, modelo e esforço seguem com os 5 min");
  assert.equal(provaExigida({ ajuste: true, sobeTeto: true }), "faceid60", "o mais forte vence");
});

test("subida de teto: baixa vale na hora, subida fica pendente por 24 h; mudança mista separa as duas partes", () => {
  const atual = { dia: 100, mes: 1000 };
  const baixa = planejarTetos(atual, { dia: 50, mes: 1000 }, null, T0);
  assert.deepEqual(baixa, { agora: { dia: 50, mes: 1000 }, pendente: null, sobe: false, baixa: true, anterior: "nenhuma" });
  const sobe = planejarTetos(atual, { dia: 300, mes: 2000 }, null, T0);
  assert.deepEqual(sobe.agora, atual, "nada sobe na hora");
  assert.deepEqual(sobe.pendente, { dia: 300, mes: 2000, valeEm: T0 + 24 * H });
  assert.equal(CHAVE_ESPERA_SUBIDA_MS, 24 * H);
  const mista = planejarTetos(atual, { dia: 200, mes: 500 }, null, T0);
  assert.deepEqual(mista.agora, { dia: 100, mes: 500 }, "o mês baixa já");
  assert.deepEqual(mista.pendente, { dia: 200, mes: 500, valeEm: T0 + 24 * H }, "o dia sobe depois");
  assert.ok(mista.agora.dia <= mista.agora.mes);
  const igual = planejarTetos(atual, atual, null, T0);
  assert.deepEqual(igual, { agora: atual, pendente: null, sobe: false, baixa: false, anterior: "nenhuma" });
});

test("pendente: uma baixa cancela; uma subida nova substitui e recomeça as 24 h; sem mudança, mantém", () => {
  const atual = { dia: 100, mes: 1000 };
  const pend = { dia: 300, mes: 2000, valeEm: T0 + 24 * H };
  const b = planejarTetos(atual, { dia: 100, mes: 900 }, pend, T0 + H);
  assert.equal(b.pendente, null); assert.equal(b.anterior, "cancelada");
  const s = planejarTetos(atual, { dia: 400, mes: 2000 }, pend, T0 + H);
  assert.deepEqual(s.pendente, { dia: 400, mes: 2000, valeEm: T0 + 25 * H }); assert.equal(s.anterior, "substituida");
  const m = planejarTetos(atual, atual, pend, T0 + H);
  assert.deepEqual(m.pendente, pend); assert.equal(m.anterior, "mantida");
});

test("aplicarPendente com relógio falso: antes das 24 h nada muda; depois, o teto novo vale e a pendente some", () => {
  const atual = { dia: 100, mes: 1000 };
  const pend = { dia: 300, mes: 2000, valeEm: T0 + 24 * H };
  assert.deepEqual(aplicarPendente(atual, pend, T0 + 24 * H - 1), { tetos: atual, pendente: pend, aplicou: false });
  assert.deepEqual(aplicarPendente(atual, pend, T0 + 24 * H), { tetos: { dia: 300, mes: 2000 }, pendente: null, aplicou: true });
  assert.deepEqual(aplicarPendente(atual, null, T0), { tetos: atual, pendente: null, aplicou: false });
  // pendente inválida (não deveria existir: a baixa cancela) → descartada sem aplicar
  assert.deepEqual(aplicarPendente(atual, { dia: 3000, mes: 2000, valeEm: T0 }, T0), { tetos: atual, pendente: null, aplicou: false });
});

test("teto global da conta: a soma de todas as chaves cabe em US$ 100 por mês (e por dia), seja qual for o número de chaves", () => {
  assert.equal(CHAVE_TETO_CONTA_CENT.mes, CHAVE_TETO_MAX_USD * 100);
  assert.ok(CHAVE_TETO_CONTA_CENT.dia <= CHAVE_TETO_CONTA_CENT.mes);
  const m = (usd: number) => Math.round(usd * 1e6);
  assert.equal(cabeNoTetoConta({ gastoDiaMicro: 0, gastoMesMicro: m(60), estMicro: m(40) }), true);
  assert.equal(cabeNoTetoConta({ gastoDiaMicro: 0, gastoMesMicro: m(60), estMicro: m(40.01) }), false);
  assert.equal(cabeNoTetoConta({ gastoDiaMicro: m(99.99), gastoMesMicro: m(99.99), estMicro: m(0.02) }), false);
  assert.equal(cabeNoTetoConta({ gastoDiaMicro: 0, gastoMesMicro: 0, estMicro: -1 }), false, "estimativa negativa: recusa");
});

test("disjuntor: pausa por gasto acima da fração do teto do dia em 10 min, ou por rajada de chamadas; abaixo, segue", () => {
  assert.equal(DISJUNTOR.janelaMs, 10 * 60_000);
  const teto = 100; // US$ 1,00/dia
  const limiteMicro = DISJUNTOR.fracaoTetoDia * teto * 10_000;
  assert.equal(disjuntor({ gastoJanelaMicro: limiteMicro, chamadasJanela: 1, tetoDiaCent: teto }), null, "no limite, ainda segue");
  assert.equal(disjuntor({ gastoJanelaMicro: limiteMicro + 1, chamadasJanela: 1, tetoDiaCent: teto }), "gasto_10min");
  assert.equal(disjuntor({ gastoJanelaMicro: 0, chamadasJanela: DISJUNTOR.maxChamadas - 1, tetoDiaCent: teto }), null);
  assert.equal(disjuntor({ gastoJanelaMicro: 0, chamadasJanela: DISJUNTOR.maxChamadas, tetoDiaCent: teto }), "rajada");
  assert.ok(DISJUNTOR.maxChamadas < 20 * 10, "pega o ataque lento que o rate limit de 20/min deixa passar");
});

test("aviso de consumo a 80%: o período mais cheio vence; abaixo de 80%, nada", () => {
  assert.equal(ALERTA_CONSUMO, 0.8);
  assert.equal(alertaConsumo({ gastoDiaMicro: 790_000, gastoMesMicro: 790_000, tetoDiaCent: 100, tetoMesCent: 1000 }), null);
  assert.deepEqual(alertaConsumo({ gastoDiaMicro: 800_000, gastoMesMicro: 800_000, tetoDiaCent: 100, tetoMesCent: 1000 }), { periodo: "dia", pct: 80 });
  assert.deepEqual(alertaConsumo({ gastoDiaMicro: 0, gastoMesMicro: 9_500_000, tetoDiaCent: 100, tetoMesCent: 1000 }), { periodo: "mes", pct: 95 });
  assert.deepEqual(alertaConsumo({ gastoDiaMicro: 1_200_000, gastoMesMicro: 1_200_000, tetoDiaCent: 100, tetoMesCent: 1000 }), { periodo: "dia", pct: 100 }, "passou do teto: 100%");
  assert.equal(textoAlertaConsumo("Chave fictícia", { periodo: "dia", pct: 85 }), "Chave fictícia usou 85% do teto do dia.");
  assert.equal(textoAlertaConsumo("X", { periodo: "mes", pct: 100 }), "X chegou ao teto do mês.");
});

test("chave grátis: só os provedores com aviso exigem o aceite", () => {
  assert.equal(chaveGratis("gemini"), true);
  assert.equal(chaveGratis("openrouter"), true);
  assert.equal(chaveGratis("openai"), false);
  assert.equal(chaveGratis("anthropic"), false);
  assert.equal(chaveGratis("deepseek"), false);
});
