// Autenticador WebAuthn falso para os testes (core e Worker): gera chave ES256 ou RS256 com o WebCrypto do Node,
// monta attestationObject ("none") e assinaturas de login exatamente como um iPhone/Mac mandaria. Dados fictícios.
import { b64urlEncode } from "../src/conta.ts";
import type { Cbor } from "../src/conta.ts";
type CryptoKeyPair = import("node:crypto").webcrypto.CryptoKeyPair;

const te = new TextEncoder();
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const sha = async (u8: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", u8));

function head(major: number, n: number): Uint8Array {
  if (n < 24) return new Uint8Array([(major << 5) | n]);
  if (n < 256) return new Uint8Array([(major << 5) | 24, n]);
  if (n < 65536) return new Uint8Array([(major << 5) | 25, n >> 8, n & 255]);
  return new Uint8Array([(major << 5) | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
}
export function cborEncode(v: Cbor): Uint8Array {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") { const b = te.encode(v); return cat(head(3, b.length), b); }
  if (v instanceof Uint8Array) return cat(head(2, v.length), v);
  if (Array.isArray(v)) return cat(head(4, v.length), ...v.map(cborEncode));
  if (v instanceof Map) return cat(head(5, v.size), ...[...v].flatMap(([k, x]) => [cborEncode(k), cborEncode(x)]));
  if (v === true) return new Uint8Array([0xf5]);
  if (v === false) return new Uint8Array([0xf4]);
  return new Uint8Array([0xf6]);
}

/** r||s (WebCrypto) → DER (formato que o autenticador manda). */
export function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => { let s = 0; while (s < b.length - 1 && b[s] === 0) s++; let t = b.subarray(s); if (t[0] & 0x80) t = cat(new Uint8Array([0]), t); return cat(new Uint8Array([2, t.length]), t); };
  const body = cat(int(raw.subarray(0, 32)), int(raw.subarray(32)));
  return cat(new Uint8Array([0x30, body.length]), body);
}

export interface Autenticador { alg: "ES256" | "RS256"; credId: Uint8Array; keys: CryptoKeyPair; cose: Map<Cbor, Cbor>; counter: number; userHandle?: string }

export async function novoAutenticador(alg: "ES256" | "RS256" = "ES256", counter = 0): Promise<Autenticador> {
  const credId = crypto.getRandomValues(new Uint8Array(32));
  if (alg === "ES256") {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
    const cose = new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, raw.slice(1, 33)], [-3, raw.slice(33, 65)]]);
    return { alg, credId, keys, cose, counter };
  }
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const d = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
  const cose = new Map<Cbor, Cbor>([[1, 3], [3, -257], [-1, d(jwk.n!)], [-2, d(jwk.e!)]]);
  return { alg, credId, keys, cose, counter };
}

const authData = async (rpId: string, flags: number, counter: number, attested?: Uint8Array) => {
  const c = new Uint8Array([(counter >>> 24) & 255, (counter >> 16) & 255, (counter >> 8) & 255, counter & 255]);
  return cat(await sha(te.encode(rpId)), new Uint8Array([flags]), c, attested ?? new Uint8Array());
};

export interface Cerimonia { challenge: string; origin: string; rpId: string; type?: string; flags?: number }

/** navigator.credentials.create → o JSON que o app manda ao servidor. */
export async function criar(a: Autenticador, o: Cerimonia) {
  const cd = te.encode(JSON.stringify({ type: o.type ?? "webauthn.create", challenge: o.challenge, origin: o.origin, crossOrigin: false }));
  const att = cat(new Uint8Array(16), new Uint8Array([a.credId.length >> 8, a.credId.length & 255]), a.credId, cborEncode(a.cose));
  const ad = await authData(o.rpId, o.flags ?? 0x45 | 0x08, a.counter, att);
  const ao = cborEncode(new Map<Cbor, Cbor>([["fmt", "none"], ["attStmt", new Map()], ["authData", ad]]));
  const id = b64urlEncode(a.credId);
  return { id, rawId: id, type: "public-key", response: { clientDataJSON: b64urlEncode(cd), attestationObject: b64urlEncode(ao), transports: ["internal", "hybrid"] } };
}

/** navigator.credentials.get → o JSON que o app manda ao servidor (conta +1 no contador, se ele conta). */
export async function assinar(a: Autenticador, o: Cerimonia & { userHandle?: string }) {
  if (a.counter > 0) a.counter++;
  const cd = te.encode(JSON.stringify({ type: o.type ?? "webauthn.get", challenge: o.challenge, origin: o.origin }));
  const ad = await authData(o.rpId, o.flags ?? 0x05, a.counter);
  const msg = cat(ad, await sha(cd));
  const sig = a.alg === "ES256"
    ? rawToDer(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, a.keys.privateKey, msg)))
    : new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", a.keys.privateKey, msg));
  const id = b64urlEncode(a.credId);
  return { id, rawId: id, type: "public-key", response: { clientDataJSON: b64urlEncode(cd), authenticatorData: b64urlEncode(ad), signature: b64urlEncode(sig), userHandle: o.userHandle ?? a.userHandle ?? null } };
}
