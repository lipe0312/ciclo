// #54 Conta própria: regras puras do login por passkey (WebAuthn), convite, teto de contas, sessão e recuperação.
// Sem dependência e sem criptografia aqui: o core só decodifica e confere formatos; a assinatura é verificada no
// Worker com WebCrypto (ES256/RS256). Tudo o que dá para testar sem rede e sem chave fica neste arquivo.

// ---- teto de contas ----
export const MAX_USERS = 10;
/** Teto vindo da config (MAX_USERS). Nunca passa de 10 e nunca é menor que 1; valor inválido = 10. */
export function maxUsers(cfg?: string | null): number {
  const n = Number(cfg ?? "");
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_USERS) : MAX_USERS;
}
export interface Vagas { usadas: number; max: number; livres: number; cheio: boolean; texto: string }
export function vagas(usadas: number, max = MAX_USERS): Vagas {
  const livres = Math.max(0, max - usadas);
  return { usadas, max, livres, cheio: livres === 0, texto: `${Math.min(usadas, max)} de ${max} vagas` };
}

// ---- sessão ----
export const SESSION_DAYS = 90;
export const SESSION_MS = SESSION_DAYS * 86_400_000;
const RENEW_GAP_MS = 86_400_000; // renova no uso, no máx. 1 vez por dia (1 escrita no D1)
/** Sessão válida agora? */
export const sessionAlive = (expiresAt: number, now: number) => expiresAt > now;
/** Nova validade se a sessão deve ser renovada neste uso (null = não precisa). */
export function sessionRenewal(expiresAt: number, now: number): number | null {
  if (!sessionAlive(expiresAt, now)) return null;
  return now + SESSION_MS - expiresAt >= RENEW_GAP_MS ? now + SESSION_MS : null;
}

// ---- convite ----
export const INVITE_DAYS = 7;
export const INVITE_MS = INVITE_DAYS * 86_400_000;
export type EstadoConvite = "ok" | "inexistente" | "usado" | "expirado";
export function inviteState(row: { expires_at: number; used_at: number | null } | null, now: number): EstadoConvite {
  if (!row) return "inexistente";
  if (row.used_at != null) return "usado";
  return row.expires_at > now ? "ok" : "expirado";
}
export const INVITE_MSG: Record<Exclude<EstadoConvite, "ok">, string> = {
  inexistente: "Convite inválido. Confira o código com quem te convidou.",
  usado: "Este convite já foi usado. Peça um novo.",
  expirado: "Este convite venceu (vale 7 dias). Peça um novo.",
};

// ---- códigos (convite e recuperação): base32 de Crockford, sem I, L, O, U ----
const ALFA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RECOVERY_COUNT = 8;
export const INVITE_LEN = 16;   // 80 bits
export const RECOVERY_LEN = 10; // 50 bits (uso único, com limite de tentativas)
/** Código de `len` caracteres a partir de bytes aleatórios (o chamador passa crypto.getRandomValues). */
export function codeFromBytes(bytes: Uint8Array, len: number): string {
  if (bytes.length * 8 < len * 5) throw new Error("bytes insuficientes");
  let out = "", acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5 && out.length < len) { out += ALFA[(acc >> (bits - 5)) & 31]; bits -= 5; }
    acc &= (1 << bits) - 1;
  }
  return out;
}
/** Exibição em grupos de 4 (ex.: ABCD-EFGH-JKMN-PQRS). */
export const formatCode = (c: string) => c.match(/.{1,4}/g)?.join("-") ?? "";
/** O que a pessoa digitou → forma canônica (sem espaço/traço, maiúscula, O→0, I/L→1). null se não parece código. */
export function normalizeCode(input: unknown, len: number): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const c = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return c.length === len && [...c].every((ch) => ALFA.includes(ch)) ? c : null;
}

/** Nome exibido da pessoa (não é login): 1–40 caracteres, sem controle. null = inválido. */
export function nomeValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const n = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  return n.length >= 1 && n.length <= 40 ? n : null;
}

/** "iPhone · Safari", "Mac · Chrome"… para a lista de aparelhos (só o necessário; o texto bruto não vai à tela). */
export function aparelhoDe(ua: string | null | undefined): string {
  const s = ua ?? "";
  const so = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Macintosh|Mac OS X/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "Aparelho";
  const nav = /Edg\//.test(s) ? "Edge" : /Firefox\/|FxiOS/.test(s) ? "Firefox" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "";
  return nav ? `${so} · ${nav}` : so;
}

// ---- base64url ----
export function b64urlEncode(u8: Uint8Array): string {
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("base64url inválido");
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

// ---- CBOR (só o necessário para attestationObject e chave COSE; RFC 8949) ----
export type Cbor = number | string | boolean | null | undefined | Uint8Array | Cbor[] | Map<Cbor, Cbor>;
/** Decodifica um item CBOR e diz onde ele terminou (a chave COSE vem colada a extensões no authData). */
export function cborDecode(u8: Uint8Array, start = 0): { value: Cbor; end: number } {
  let i = start;
  const need = (n: number) => { if (i + n > u8.length) throw new Error("CBOR truncado"); };
  const len = (info: number): number => {
    if (info < 24) return info;
    const n = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : -1;
    if (n < 0) throw new Error("CBOR: tamanho indefinido não suportado");
    need(n);
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + u8[i + k];
    i += n;
    if (!Number.isSafeInteger(v)) throw new Error("CBOR: número grande demais");
    return v;
  };
  let depth = 0;
  const item = (): Cbor => {
    if (++depth > 16) throw new Error("CBOR: aninhado demais");
    need(1);
    const b = u8[i++], major = b >> 5, info = b & 31;
    let out: Cbor;
    switch (major) {
      case 0: out = len(info); break;
      case 1: out = -1 - len(info); break;
      case 2: { const n = len(info); need(n); out = u8.slice(i, i + n); i += n; break; }
      case 3: { const n = len(info); need(n); out = new TextDecoder().decode(u8.subarray(i, i + n)); i += n; break; }
      case 4: { const n = len(info); if (n > 1000) throw new Error("CBOR: lista grande demais"); const a: Cbor[] = []; for (let k = 0; k < n; k++) a.push(item()); out = a; break; }
      case 5: { const n = len(info); if (n > 1000) throw new Error("CBOR: mapa grande demais"); const m = new Map<Cbor, Cbor>(); for (let k = 0; k < n; k++) { const key = item(); m.set(key, item()); } out = m; break; }
      case 7: out = info === 20 ? false : info === 21 ? true : info === 22 ? null : info === 23 ? undefined : (() => { throw new Error("CBOR: simples/float não suportado"); })(); break;
      default: throw new Error("CBOR: tipo não suportado");
    }
    depth--;
    return out;
  };
  const value = item();
  return { value, end: i };
}

// ---- WebAuthn: authenticatorData ----
export interface AuthData {
  rpIdHash: Uint8Array; up: boolean; uv: boolean; signCount: number;
  credId?: Uint8Array; cose?: Map<Cbor, Cbor>;
}
export function parseAuthData(u8: Uint8Array): AuthData {
  if (u8.length < 37) throw new Error("authData curto");
  const flags = u8[32];
  const signCount = ((u8[33] << 24) >>> 0) + (u8[34] << 16) + (u8[35] << 8) + u8[36];
  const out: AuthData = { rpIdHash: u8.slice(0, 32), up: !!(flags & 0x01), uv: !!(flags & 0x04), signCount };
  if (flags & 0x40) {
    if (u8.length < 55) throw new Error("authData sem credencial");
    const n = (u8[53] << 8) + u8[54];
    if (n < 16 || n > 1023 || u8.length < 55 + n) throw new Error("credencial com tamanho inválido");
    out.credId = u8.slice(55, 55 + n);
    const { value } = cborDecode(u8, 55 + n);
    if (!(value instanceof Map)) throw new Error("chave COSE inválida");
    out.cose = value;
  }
  return out;
}

export type Jwk = { kty: string; crv?: string; x?: string; y?: string; n?: string; e?: string; alg: string; ext: boolean };
/** Chave COSE → JWK aceito pelo WebCrypto. Só ES256 (-7, P-256) e RS256 (-257). */
export function coseToJwk(cose: Map<Cbor, Cbor>): Jwk {
  const kty = cose.get(1), alg = cose.get(3);
  const bytes = (k: number) => { const v = cose.get(k); if (!(v instanceof Uint8Array)) throw new Error("COSE incompleta"); return v; };
  if (alg === -7) {
    if (kty !== 2 || cose.get(-1) !== 1) throw new Error("ES256 exige EC2 P-256");
    const x = bytes(-2), y = bytes(-3);
    if (x.length !== 32 || y.length !== 32) throw new Error("ponto P-256 inválido");
    return { kty: "EC", crv: "P-256", x: b64urlEncode(x), y: b64urlEncode(y), alg: "ES256", ext: true };
  }
  if (alg === -257) {
    if (kty !== 3) throw new Error("RS256 exige RSA");
    const n = bytes(-1), e = bytes(-2);
    if (n.length < 256) throw new Error("RSA menor que 2048 bits");
    return { kty: "RSA", n: b64urlEncode(n), e: b64urlEncode(e), alg: "RS256", ext: true };
  }
  throw new Error("algoritmo não suportado (só ES256 e RS256)");
}

/** Assinatura ECDSA em DER (WebAuthn) → r||s de 64 bytes (formato do WebCrypto). */
export function derToRawEcdsa(der: Uint8Array, size = 32): Uint8Array {
  let i = 0;
  const bad = (m: string): never => { throw new Error(`DER inválido: ${m}`); };
  const readLen = () => { let n = der[i++]; if (n === 0x81) n = der[i++]; else if (n & 0x80) bad("tamanho"); return n ?? bad("truncado"); };
  const fit = (v: Uint8Array) => {
    let s = 0; while (s < v.length - 1 && v[s] === 0) s++;
    const t = v.subarray(s);
    if (t.length > size) bad("inteiro grande demais");
    const o = new Uint8Array(size); o.set(t, size - t.length); return o;
  };
  const int = () => {
    if (der[i++] !== 0x02) bad("inteiro");
    const n = readLen(), v = der.subarray(i, i + n);
    if (v.length !== n || n === 0) bad("truncado");
    i += n; return fit(v);
  };
  if (der[i++] !== 0x30) bad("sequência");
  const total = readLen();
  if (i + total !== der.length) bad("tamanho da sequência");
  const r = int(), s = int();
  if (i !== der.length) bad("sobra");
  const out = new Uint8Array(size * 2); out.set(r); out.set(s, size);
  return out;
}

export type ErroClientData = "tipo" | "desafio" | "origem" | "json";
/** Confere clientDataJSON: tipo da cerimônia, desafio emitido pelo servidor e origem do app. null = ok. */
export function checkClientData(json: string, want: { type: "webauthn.create" | "webauthn.get"; challenge: string; origin: string }): ErroClientData | null {
  let c: { type?: unknown; challenge?: unknown; origin?: unknown; crossOrigin?: unknown };
  try { c = JSON.parse(json); } catch { return "json"; }
  if (!c || typeof c !== "object") return "json";
  if (c.type !== want.type) return "tipo";
  if (typeof c.challenge !== "string" || c.challenge !== want.challenge) return "desafio";
  if (c.origin !== want.origin || c.crossOrigin === true) return "origem";
  return null;
}

/** Contador de assinaturas: se algum lado conta (>0), o novo tem que ser maior (senão pode ser clone). */
export const counterOk = (stored: number, got: number) => (stored === 0 && got === 0) || got > stored;

/** Passkey sincronizada (iCloud Keychain / Google)? Pelo flag BE do authData. Só informativo. */
export const backupEligible = (authData: Uint8Array) => authData.length > 32 && !!(authData[32] & 0x08);
