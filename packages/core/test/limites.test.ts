// #56 Regras de abuso e custo: janela, bloqueio por falhas, Turnstile, magic bytes, cota da conta e cota global.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_BLOQUEIO, AUTH_GLOBAL, AUTH_TENTATIVAS, CONTA_R2_MAX_BYTES, GRATIS, LINHAS_POR_ESCRITA, ARQUIVO_MAX_BYTES, bloqueioRestante, cabeNaConta,
  diaUtc, esperaJanela, nivelGlobal, precisaTurnstile, registrarFalha, tipoConfere, tipoPorConteudo,
} from "../src/index.ts";
import type { Falhas } from "../src/index.ts";

const NOW = Date.UTC(2026, 10, 13, 12, 0, 30);

test("janela: 5 tentativas por minuto; a 6ª espera o fim do minuto", () => {
  assert.equal(AUTH_TENTATIVAS.max, 5); assert.equal(AUTH_TENTATIVAS.windowMs, 60_000);
  assert.equal(esperaJanela(5, AUTH_TENTATIVAS, NOW), 0);
  assert.equal(esperaJanela(6, AUTH_TENTATIVAS, NOW), 30);
  assert.equal(esperaJanela(6, AUTH_TENTATIVAS, NOW + 29_999), 1, "nunca 0 quando estourou");
  assert.ok(AUTH_GLOBAL.recover.max >= 50 && AUTH_GLOBAL.setup.max >= 5, "global sobra para o uso real");
});

test("bloqueio: 10 falhas seguidas → 15 min; sucesso (null) zera; bloqueio vencido recomeça", () => {
  let f: Falhas | null = null;
  for (let i = 1; i < AUTH_BLOQUEIO.falhas; i++) { f = registrarFalha(f, NOW); assert.equal(bloqueioRestante(f, NOW), 0, `falha ${i}`); }
  assert.equal(f!.falhas, 9);
  f = registrarFalha(f, NOW);
  assert.equal(bloqueioRestante(f, NOW), 15 * 60);
  assert.equal(bloqueioRestante(f, NOW + 15 * 60_000), 0);
  assert.deepEqual(registrarFalha(f, NOW + 15 * 60_000), { falhas: 1, ate: null }, "depois do bloqueio, conta de novo do zero");
});

test("Turnstile a partir da 3ª falha seguida", () => {
  assert.equal(precisaTurnstile(null), false);
  assert.equal(precisaTurnstile({ falhas: 2, ate: null }), false);
  assert.equal(precisaTurnstile({ falhas: 3, ate: null }), true);
});

test("magic bytes: o conteúdo manda, não o Content-Type", () => {
  const b = (...x: number[]) => new Uint8Array(x);
  const s = (t: string) => [...t].map((c) => c.charCodeAt(0));
  assert.equal(tipoPorConteudo(b(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(tipoPorConteudo(b(0x89, 0x50, 0x4e, 0x47, 13, 10)), "image/png");
  assert.equal(tipoPorConteudo(b(...s("RIFF"), 0, 0, 0, 0, ...s("WEBP"))), "image/webp");
  assert.equal(tipoPorConteudo(b(0, 0, 0, 24, ...s("ftypisom"))), "video/mp4");
  assert.equal(tipoPorConteudo(b(0x1a, 0x45, 0xdf, 0xa3)), "video/webm");
  assert.equal(tipoPorConteudo(b(...s("<html>"))), null);
  assert.equal(tipoPorConteudo(b()), null);
  assert.equal(tipoConfere("video/quicktime", b(0, 0, 0, 20, ...s("ftypqt  "))), true, "MOV é ftyp");
  assert.equal(tipoConfere("image/png", b(...s("<svg onload=x>"))), false, "tipo falso");
  assert.equal(tipoConfere("video/mp4", b(0x89, 0x50, 0x4e, 0x47)), false, "PNG dizendo ser MP4");
});

test("cota da conta: 500 MB; arquivo até 20 MB (abaixo do teto de 25 MB)", () => {
  assert.equal(CONTA_R2_MAX_BYTES, 500 * 1024 * 1024);
  assert.ok(ARQUIVO_MAX_BYTES <= 25 * 1024 * 1024);
  assert.equal(cabeNaConta(CONTA_R2_MAX_BYTES - 10, 10), true);
  assert.equal(cabeNaConta(CONTA_R2_MAX_BYTES - 10, 11), false);
});

test("cota global: 80% avisa, 95% trava; vale o pior entre escritas do dia e R2 guardado", () => {
  const escritas = (pct: number) => Math.ceil((GRATIS.d1EscritasDia * pct) / LINHAS_POR_ESCRITA);
  assert.equal(nivelGlobal({ escritasHoje: 0, r2Bytes: 0 }).nivel, "ok");
  assert.equal(nivelGlobal({ escritasHoje: escritas(0.79), r2Bytes: 0 }).nivel, "ok");
  assert.equal(nivelGlobal({ escritasHoje: escritas(0.8), r2Bytes: 0 }).nivel, "aviso");
  assert.equal(nivelGlobal({ escritasHoje: escritas(0.95), r2Bytes: 0 }).nivel, "trava");
  assert.equal(nivelGlobal({ escritasHoje: 0, r2Bytes: GRATIS.r2Bytes * 0.96 }).nivel, "trava");
  assert.equal(diaUtc(NOW), "2026-11-13");
});
