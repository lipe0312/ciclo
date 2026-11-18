// #114 O app percebe sozinho que a conta mudou: só recarrega se a versão mudou, avisa "Atualizado" só quando a mudança veio de fora,
// não recarrega por cima do treino em andamento e nunca roda duas conferências ao mesmo tempo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERVALO_MS, JANELA_PROPRIA_MS, criarAtualizador } from "../src/lib/atualizar/regras.ts";

function montar(versao: number | null, opts: { ocupado?: boolean } = {}) {
  const log = { buscas: 0, recargas: 0, avisos: [] as string[] };
  const est = { versao, t: 1_000_000, ocupado: !!opts.ocupado, falhaRecarga: false };
  const a = criarAtualizador({
    buscarVersao: async () => { log.buscas++; await Promise.resolve(); return est.versao; },
    recarregar: async () => { log.recargas++; if (est.falhaRecarga) throw new Error("rede"); a.marcar(est.versao); },
    ocupado: () => est.ocupado,
    agora: () => est.t,
    avisar: (t) => log.avisos.push(t),
  });
  return { a, log, est };
}

test("versão igual: não recarrega nem avisa", async () => {
  const { a, log } = montar(5); a.marcar(5);
  assert.equal(await a.conferir(), false);
  assert.deepEqual([log.buscas, log.recargas, log.avisos.length], [1, 0, 0]);
});

test("o Claude mudou algo (versão subiu): recarrega e avisa 'Atualizado'; a conferência seguinte não repete", async () => {
  const { a, log, est } = montar(5); a.marcar(5);
  est.versao = 6;
  assert.equal(await a.conferir(), true);
  assert.deepEqual(log.avisos, ["Atualizado"]);
  assert.equal(a.vista(), 6);
  assert.equal(await a.conferir(), false);
  assert.equal(log.recargas, 1);
});

test("só escrita deste aparelho (a tela já está certa): adota a versão sem recarregar nem avisar", async () => {
  const { a, log, est } = montar(5); a.marcar(5);
  a.escreveu(); a.escreveu(); est.versao = 7; est.t += 500;
  assert.equal(await a.conferir(), false);
  assert.deepEqual([log.recargas, log.avisos.length, a.vista()], [0, 0, 7]);
});

test("escrita deste aparelho + a do Claude ao mesmo tempo: a conta andou além do que fizemos → recarrega e avisa (fora da janela)", async () => {
  const { a, log, est } = montar(5); a.marcar(5);
  a.escreveu(); est.versao = 7; est.t += JANELA_PROPRIA_MS + 1; // +1 nossa, +1 de fora
  assert.equal(await a.conferir(), true);
  assert.deepEqual(log.avisos, ["Atualizado"]);
  est.versao = 8; est.t += 10;
  assert.equal(await a.conferir(), true, "depois de recarregar, o contador das nossas zera");
});

test("treino em andamento: não mexe na tela e mantém a versão antiga para recarregar quando acabar", async () => {
  const { a, log, est } = montar(5, { ocupado: true }); a.marcar(5);
  est.versao = 6;
  assert.equal(await a.conferir(), false);
  assert.equal(log.recargas, 0); assert.equal(a.vista(), 5);
  est.ocupado = false;
  assert.equal(await a.conferir(), true);
});

test("sem rede (versão null) ou sem versão vista ainda: não quebra; abriu sem sinal → recarrega quieto quando volta", async () => {
  const sem = montar(null); sem.a.marcar(5);
  assert.equal(await sem.a.conferir(), false);
  const frio = montar(9); // nunca carregou do servidor
  assert.equal(await frio.a.conferir(), true);
  assert.deepEqual(frio.log.avisos, [], "primeira carga não avisa");
});

test("recarga que falha não derruba nem marca como vista (tenta de novo na próxima)", async () => {
  const { a, log, est } = montar(5); a.marcar(5);
  est.versao = 6; est.falhaRecarga = true;
  assert.equal(await a.conferir(), false);
  assert.equal(a.vista(), 5); assert.deepEqual(log.avisos, []);
  est.falhaRecarga = false;
  assert.equal(await a.conferir(), true);
});

test("duas conferências ao mesmo tempo viram uma só", async () => {
  const { a, log, est } = montar(5); a.marcar(5); est.versao = 6;
  const [x, y] = await Promise.all([a.conferir(), a.conferir()]);
  assert.deepEqual([x, y].sort(), [false, true]);
  assert.equal(log.recargas, 1);
});

test("intervalo de poucos segundos (não é polling agressivo)", () => { assert.ok(INTERVALO_MS >= 5000 && INTERVALO_MS <= 15000); });
