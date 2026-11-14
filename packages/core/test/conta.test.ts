import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_LEN, MAX_USERS, RECOVERY_LEN, SESSION_MS, aparelhoDe, b64urlDecode, b64urlEncode, backupEligible, cborDecode, checkClientData,
  codeFromBytes, coseToJwk, counterOk, derToRawEcdsa, formatCode, inviteState, maxUsers, nomeValido, normalizeCode, parseAuthData,
  sessionAlive, sessionRenewal, vagas,
} from "../src/index.ts";
import { assinar, cborEncode, criar, novoAutenticador, rawToDer } from "./fake-autenticador.ts";

const NOW = Date.UTC(2026, 10, 13, 12);
const O = { challenge: "desafio-ficticio", origin: "https://ciclo.exemplo.workers.dev", rpId: "ciclo.exemplo.workers.dev" };

test("teto: config nunca passa de 10; vagas em texto", () => {
  assert.equal(MAX_USERS, 10);
  assert.equal(maxUsers(undefined), 10); assert.equal(maxUsers("3"), 3); assert.equal(maxUsers("50"), 10);
  assert.equal(maxUsers("0"), 10); assert.equal(maxUsers("abc"), 10); assert.equal(maxUsers("2.5"), 10);
  assert.deepEqual(vagas(8, 10), { usadas: 8, max: 10, livres: 2, cheio: false, texto: "8 de 10 vagas" });
  assert.equal(vagas(10).cheio, true); assert.equal(vagas(12).livres, 0); assert.equal(vagas(12).texto, "10 de 10 vagas");
});

test("sessão de 90 dias: viva até expirar e renovada no uso no máx. 1×/dia", () => {
  const exp = NOW + SESSION_MS;
  assert.ok(sessionAlive(exp, NOW)); assert.ok(!sessionAlive(NOW, NOW));
  assert.equal(sessionRenewal(exp, NOW), null, "acabou de nascer");
  assert.equal(sessionRenewal(exp, NOW + 3_600_000), null, "menos de 1 dia");
  assert.equal(sessionRenewal(exp, NOW + 86_400_000), NOW + 86_400_000 + SESSION_MS);
  assert.equal(sessionRenewal(exp, exp + 1), null, "expirada não renova");
  assert.equal(SESSION_MS, 90 * 86_400_000);
});

test("convite: ok, usado, expirado, inexistente", () => {
  assert.equal(inviteState(null, NOW), "inexistente");
  assert.equal(inviteState({ expires_at: NOW + 1, used_at: null }, NOW), "ok");
  assert.equal(inviteState({ expires_at: NOW + 1, used_at: NOW - 5 }, NOW), "usado");
  assert.equal(inviteState({ expires_at: NOW, used_at: null }, NOW), "expirado");
});

test("códigos: base32 sem letras ambíguas, formato e normalização do que se digita", () => {
  const c = codeFromBytes(new Uint8Array(10).fill(255), INVITE_LEN);
  assert.equal(c, "Z".repeat(16));
  const r = codeFromBytes(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), RECOVERY_LEN);
  assert.equal(r.length, 10); assert.match(r, /^[0-9A-HJKMNP-TV-Z]+$/);
  assert.throws(() => codeFromBytes(new Uint8Array(2), 10));
  assert.equal(formatCode("ABCDEFGHJK"), "ABCD-EFGH-JK");
  assert.equal(normalizeCode(" abcd-efgh-jk ", 10), "ABCDEFGHJK");
  assert.equal(normalizeCode("oIlo-0000-00", 10), "0110000000");
  assert.equal(normalizeCode("ABCD", 10), null); assert.equal(normalizeCode("ABCDEFGHJU", 10), null, "U não existe");
  assert.equal(normalizeCode(42, 10), null); assert.equal(normalizeCode("x".repeat(100), 10), null);
});

test("nome e aparelho", () => {
  assert.equal(nomeValido("  Ana   Maria "), "Ana Maria");
  assert.equal(nomeValido(""), null); assert.equal(nomeValido("x".repeat(41)), null); assert.equal(nomeValido(3), null);
  assert.equal(nomeValido("A\u0000na"), "Ana");
  assert.equal(aparelhoDe("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "iPhone · Safari");
  assert.equal(aparelhoDe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"), "Mac · Chrome");
  assert.equal(aparelhoDe(null), "Aparelho");
});

test("base64url e CBOR (ida e volta, entrada malformada)", () => {
  const b = Uint8Array.from([0, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(b64urlDecode(b64urlEncode(b)), b);
  assert.ok(!/[+/=]/.test(b64urlEncode(b)));
  assert.throws(() => b64urlDecode("a+b"));
  const v = new Map<any, any>([["fmt", "none"], [1, -7], [-3, Uint8Array.from([1, 2])], ["l", [1, true, null]], ["n", 70000]]);
  const back = cborDecode(cborEncode(v)).value as Map<any, any>;
  assert.equal(back.get("fmt"), "none"); assert.equal(back.get(1), -7); assert.deepEqual(back.get(-3), Uint8Array.from([1, 2]));
  assert.deepEqual(back.get("l"), [1, true, null]); assert.equal(back.get("n"), 70000);
  assert.throws(() => cborDecode(Uint8Array.from([0x5a, 0, 0, 0, 9, 1])), /truncado/);
  assert.throws(() => cborDecode(Uint8Array.from([0x9f])), /indefinido/);
  assert.throws(() => cborDecode(new Uint8Array(40).fill(0x81)), /aninhado/);
});

test("DER ↔ r||s da assinatura ES256", () => {
  const raw = Uint8Array.from({ length: 64 }, (_, i) => (i === 0 || i === 32 ? 0x80 : i));
  assert.deepEqual(derToRawEcdsa(rawToDer(raw)), raw);
  const small = new Uint8Array(64); small[31] = 5; small[63] = 7;
  assert.deepEqual(derToRawEcdsa(rawToDer(small)), small);
  assert.throws(() => derToRawEcdsa(Uint8Array.from([0x30, 3, 2, 1])));
  assert.throws(() => derToRawEcdsa(Uint8Array.from([0x31, 0])));
  assert.throws(() => derToRawEcdsa(Uint8Array.from([0x30, 6, 2, 1, 5, 2, 1, 0x80])), /negativo/);
  assert.throws(() => derToRawEcdsa(Uint8Array.from([0x30, 7, 2, 2, 0, 5, 2, 1, 7])), /zero à esquerda/);
  assert.throws(() => derToRawEcdsa(Uint8Array.from([0x30, 0x81, 6, 2, 1, 5, 2, 1, 7])), /não canônico/);
});

test("registro: authData com credencial e chave COSE (ES256 e RS256) vira JWK que o WebCrypto aceita", async () => {
  for (const alg of ["ES256", "RS256"] as const) {
    const a = await novoAutenticador(alg);
    const cred = await criar(a, O);
    const att = cborDecode(b64urlDecode(cred.response.attestationObject)).value as Map<any, any>;
    const ad = parseAuthData(att.get("authData"));
    assert.ok(ad.up && ad.uv); assert.deepEqual(ad.credId, a.credId); assert.equal(ad.signCount, 0);
    assert.ok(backupEligible(att.get("authData")), "passkey sincronizável (BE)");
    const jwk = coseToJwk(ad.cose!);
    assert.equal(jwk.alg, alg);
    const params = alg === "ES256" ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    await crypto.subtle.importKey("jwk", jwk, params, false, ["verify"]);
  }
  assert.throws(() => coseToJwk(new Map<any, any>([[1, 1], [3, -8]])), /só ES256 e RS256/);
  assert.throws(() => coseToJwk(new Map<any, any>([[1, 2], [3, -7], [-1, 2]])), /P-256/);
  assert.throws(() => coseToJwk(new Map<any, any>([[1, 3], [3, -257], [-1, new Uint8Array(256).fill(1)], [-2, Uint8Array.from([3])]])), /65537/);
  assert.throws(() => parseAuthData(new Uint8Array(10)), /curto/);
});

test("login: flags, contador e clientData (tipo, desafio e origem)", async () => {
  const a = await novoAutenticador("ES256", 5);
  const g = await assinar(a, O);
  const ad = parseAuthData(b64urlDecode(g.response.authenticatorData));
  assert.equal(ad.signCount, 6); assert.ok(ad.uv); assert.equal(ad.credId, undefined);
  const cd = new TextDecoder().decode(b64urlDecode(g.response.clientDataJSON));
  assert.equal(checkClientData(cd, { type: "webauthn.get", challenge: O.challenge, origin: O.origin }), null);
  assert.equal(checkClientData(cd, { type: "webauthn.create", challenge: O.challenge, origin: O.origin }), "tipo");
  assert.equal(checkClientData(cd, { type: "webauthn.get", challenge: "outro", origin: O.origin }), "desafio");
  assert.equal(checkClientData(cd, { type: "webauthn.get", challenge: O.challenge, origin: "https://phishing.exemplo" }), "origem");
  assert.equal(checkClientData("{", { type: "webauthn.get", challenge: "", origin: "" }), "json");
  assert.ok(counterOk(0, 0)); assert.ok(counterOk(5, 6)); assert.ok(!counterOk(6, 6)); assert.ok(!counterOk(6, 2)); assert.ok(counterOk(0, 3));
});
