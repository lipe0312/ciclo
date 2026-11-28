// #165 Vagas por fase: teto vindo da fase (trava de 500 no core), convite pendente reserva, vencido/revogado devolve,
// dono fora da conta, reset de acesso não ocupa vaga. Dados fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TETO_SEGURANCA, faseId, motivoSemConvite, tetoVigente, textoFase, vagasDaFase, vagasDe, validarFase } from "../src/index.ts";

const AGORA = Date.parse("2026-11-27T12:00:00Z");
const DIA = 86_400_000;
const contas = (n: number) => Array.from({ length: n }, () => ({ role: "user" }));
const pend = (n: number, o: { userId?: string | null; expiresAt?: number; usedAt?: number | null } = {}) =>
  Array.from({ length: n }, () => ({ userId: null, expiresAt: AGORA + DIA, usedAt: null, ...o }));

test("tetoVigente: vem da fase, nunca passa da trava de 500; a emergência só abaixa; valor inválido não sobe nada", () => {
  assert.equal(TETO_SEGURANCA, 500);
  assert.equal(tetoVigente({ teto: 50 }), 50);
  assert.equal(tetoVigente({ teto: 50 }, undefined), 50, "sem a var, não há trava extra");
  assert.equal(tetoVigente({ teto: 50 }, ""), 50);
  assert.equal(tetoVigente({ teto: 9999 }), 500, "clamp na trava de segurança");
  assert.equal(tetoVigente({ teto: 50 }, "10"), 10, "emergência abaixa");
  assert.equal(tetoVigente({ teto: 50 }, "80"), 50, "emergência nunca sobe");
  assert.equal(tetoVigente({ teto: 9999 }, "800"), 500);
  assert.equal(tetoVigente({ teto: 50 }, "0"), 0, "emergência 0 = nenhuma conta nova");
  for (const ruim of ["abc", "-3", "2.5", "1e3x", "NaN"]) assert.equal(tetoVigente({ teto: 50 }, ruim), 50, `emergência inválida (${ruim}) é ignorada`);
  for (const ruim of [NaN, -1, 2.5, Infinity]) assert.equal(tetoVigente({ teto: ruim as number }), 0, "teto da fase inválido = fecha (0)");
  assert.equal(tetoVigente(null), 0, "sem fase, sem vagas");
});

test("vagasDaFase: pendentes contam, reset não conta, dono não conta, vencido e usado não contam", () => {
  const v = vagasDaFase({ contas: [{ role: "owner" }, ...contas(10)], convitesPendentes: pend(3), teto: 50, agora: AGORA });
  assert.deepEqual(v, { usadas: 13, teto: 50, livres: 37, cheio: false, texto: "13 de 50 vagas", contas: 10, pendentes: 3 });
  const reset = vagasDaFase({ contas: contas(2), convitesPendentes: pend(4, { userId: "u-ficticia" }), teto: 5, agora: AGORA });
  assert.equal(reset.usadas, 2, "convite de reset de acesso não ocupa vaga"); assert.equal(reset.pendentes, 0);
  const dono = vagasDaFase({ contas: [{ role: "owner" }], convitesPendentes: [], teto: 1, agora: AGORA });
  assert.equal(dono.usadas, 0, "o dono fica fora da conta"); assert.equal(dono.cheio, false);
  const vencido = vagasDaFase({ contas: contas(1), convitesPendentes: [...pend(2, { expiresAt: AGORA }), ...pend(1, { expiresAt: AGORA - 1 })], teto: 2, agora: AGORA });
  assert.equal(vencido.usadas, 1, "convite vencido devolve a vaga (contagem por consulta, sem contador)");
  const usado = vagasDaFase({ contas: contas(1), convitesPendentes: pend(1, { usedAt: AGORA - 5 }), teto: 2, agora: AGORA });
  assert.equal(usado.usadas, 1, "convite já usado virou conta: não conta duas vezes");
  const apagada = vagasDaFase({ contas: [{ role: "user", deletedAt: AGORA }], convitesPendentes: [], teto: 2, agora: AGORA });
  assert.equal(apagada.usadas, 0, "só conta ativa ocupa");
  assert.deepEqual(vagasDe(10, 3, 50), v, "contagens do SQL dão o mesmo resultado");
});

test("vagasDaFase: cheio com 50 + dono; conta antiga (sem fase) conta; passar do teto não dá livre negativo", () => {
  const cheio = vagasDaFase({ contas: [{ role: "owner" }, ...contas(50)], convitesPendentes: [], teto: 50, agora: AGORA });
  assert.equal(cheio.cheio, true); assert.equal(cheio.livres, 0); assert.equal(cheio.texto, "50 de 50 vagas");
  const reservado = vagasDaFase({ contas: contas(49), convitesPendentes: pend(1), teto: 50, agora: AGORA });
  assert.equal(reservado.cheio, true, "49 contas + 1 convite pendente = cheio");
  const acima = vagasDaFase({ contas: contas(12), convitesPendentes: pend(2), teto: 10, agora: AGORA });
  assert.deepEqual([acima.usadas, acima.livres, acima.cheio, acima.texto], [14, 0, true, "14 de 10 vagas"], "teto baixado depois: o número real aparece");
});

test("motivoSemConvite e textoFase: o botão sem vaga explica o porquê", () => {
  const fase = { nome: "Piloto 2027", aberta: true };
  const livre = vagasDaFase({ contas: contas(13), convitesPendentes: pend(3), teto: 50, agora: AGORA });
  assert.equal(motivoSemConvite(fase, livre), null);
  assert.equal(textoFase(fase, livre), "Fase Piloto 2027 · 16 de 50 vagas · 3 convites pendentes");
  assert.equal(textoFase(fase, vagasDaFase({ contas: [], convitesPendentes: pend(1), teto: 5, agora: AGORA })), "Fase Piloto 2027 · 1 de 5 vagas · 1 convite pendente");
  const cheio = vagasDaFase({ contas: contas(49), convitesPendentes: pend(1), teto: 50, agora: AGORA });
  assert.match(motivoSemConvite(fase, cheio)!, /^Sem vagas na fase Piloto 2027/);
  assert.match(motivoSemConvite({ ...fase, aberta: false }, livre)!, /fase Piloto 2027 está fechada/);
  assert.match(motivoSemConvite(null, livre)!, /Nenhuma fase/);
});

test("validarFase: nome até 40, teto inteiro de 1 a 500, datas de verdade, fim depois do início", () => {
  const hoje = "2026-11-27";
  const ok = validarFase({ nome: "  Turma   2 ", teto: 80, fimTestes: "2027-06-30" }, "criar", { hoje });
  assert.deepEqual(ok, { ok: true, valor: { nome: "Turma 2", teto: 80, inicio: hoje, fimTestes: "2027-06-30", aberta: true }, erros: [] });
  assert.equal(validarFase({ nome: "T", teto: 501 }, "criar", { hoje }).ok, false, "teto 501");
  assert.equal(validarFase({ nome: "T", teto: 0 }, "criar", { hoje }).ok, false);
  assert.equal(validarFase({ nome: "T", teto: 2.5 }, "criar", { hoje }).ok, false);
  assert.equal(validarFase({ nome: "T", teto: "50" }, "criar", { hoje }).ok, false, "teto como texto");
  assert.equal(validarFase({ nome: "x".repeat(41), teto: 5 }, "criar", { hoje }).ok, false, "nome de 41");
  assert.equal(validarFase({ teto: 5 }, "criar", { hoje }).ok, false, "nome obrigatório ao criar");
  assert.equal(validarFase({ nome: "T", teto: 5, inicio: "2026-02-30" }, "criar", { hoje }).ok, false, "data inexistente");
  assert.equal(validarFase({ nome: "T", teto: 5, fimTestes: "2026-11-01" }, "criar", { hoje }).ok, false, "fim antes do início");
  assert.equal(validarFase({ nome: "T", teto: 5, aberta: "sim" }, "criar", { hoje }).ok, false);
  // editar: só teto, fimTestes e aberta; precisa de ao menos um
  assert.deepEqual(validarFase({ teto: 60, fimTestes: null, aberta: false, nome: "ignorado" }, "editar", { hoje, inicio: "2026-11-27" }).valor, { teto: 60, fimTestes: null, aberta: false });
  assert.equal(validarFase({}, "editar", { hoje, inicio: hoje }).ok, false, "nada para mudar");
  assert.equal(validarFase({ teto: 501 }, "editar", { hoje, inicio: hoje }).ok, false);
  assert.equal(validarFase({ fimTestes: "2026-01-01" }, "editar", { hoje, inicio: "2026-11-27" }).ok, false);
});

test("faseId: slug estável do nome (sem acento), ou null", () => {
  assert.equal(faseId("Piloto 2027"), "piloto-2027");
  assert.equal(faseId("Turma Ação #2"), "turma-acao-2");
  assert.equal(faseId("!!!"), null);
});
