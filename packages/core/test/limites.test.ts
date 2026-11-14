// #56 Regras de abuso e custo: janela, bloqueio por falhas, Turnstile, magic bytes, cota da conta e cota global.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_BLOQUEIO, AUTH_GLOBAL, AUTH_TENTATIVAS, COTA_ESCRITAS_DIA, falhasVigentes, globalAuth, grupoIp, CONTA_R2_MAX_BYTES, GRATIS, LINHAS_POR_ESCRITA, ARQUIVO_MAX_BYTES, bloqueioRestante, cabeNaConta,
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

test("bloqueio: 10 falhas seguidas → 15 min; o sucesso não zera; 15 min sem falha decai; bloqueio vencido recomeça", () => {
  let f: Falhas | null = null;
  for (let i = 1; i < AUTH_BLOQUEIO.falhas; i++) { f = registrarFalha(f, NOW + i); assert.equal(bloqueioRestante(f, NOW + i), 0, `falha ${i}`); }
  assert.equal(f!.falhas, 9);
  f = registrarFalha(f, NOW);
  assert.equal(bloqueioRestante(f, NOW), 15 * 60);
  assert.equal(bloqueioRestante(f, NOW + 15 * 60_000), 0);
  assert.deepEqual(registrarFalha(f, NOW + 15 * 60_000), { falhas: 1, ate: null, em: NOW + 15 * 60_000 }, "depois do bloqueio, do zero");
  const velho = { falhas: 7, ate: null, em: NOW };
  assert.equal(falhasVigentes(velho, NOW + 14 * 60_000), 7);
  assert.equal(falhasVigentes(velho, NOW + 15 * 60_000), 0, "decai em 15 min sem falha");
});

test("Turnstile a partir da 3ª falha vigente", () => {
  assert.equal(precisaTurnstile(null, NOW), false);
  assert.equal(precisaTurnstile({ falhas: 2, ate: null, em: NOW }, NOW), false);
  assert.equal(precisaTurnstile({ falhas: 3, ate: null, em: NOW }, NOW), true);
  assert.equal(precisaTurnstile({ falhas: 3, ate: null, em: NOW }, NOW + AUTH_BLOQUEIO.decaiMs), false);
});

test("global: conta falhas; no teto, só com Turnstile (até 10×); acima disso fecha", () => {
  const j = AUTH_GLOBAL.recover;
  assert.equal(globalAuth(j.max - 1, j), "livre");
  assert.equal(globalAuth(j.max, j), "turnstile");
  assert.equal(globalAuth(j.max * 10 - 1, j), "turnstile");
  assert.equal(globalAuth(j.max * 10, j), "fechado");
});

test("IP: IPv4 inteiro, IPv6 pelo /64, mapeado vira IPv4, lixo → null", () => {
  assert.equal(grupoIp("203.0.113.9"), "203.0.113.9");
  assert.equal(grupoIp("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
  assert.equal(grupoIp("2001:DB8:1:2:ffff:ffff:ffff:ffff"), "2001:db8:1:2::/64", "mesmo /64, mesma chave");
  assert.equal(grupoIp("2001:0db8:0000:0002::"), "2001:db8:0:2::/64");
  assert.equal(grupoIp("::1"), "0:0:0:0::/64");
  assert.equal(grupoIp("::ffff:198.51.100.4"), "198.51.100.4");
  for (const x of ["", "local", "999.1.1.1", "1::2::3", "2001:db8:zz::1", "1:2:3:4:5:6:7:8:9"]) assert.equal(grupoIp(x), null, x);
  assert.equal(COTA_ESCRITAS_DIA, 2000);
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
