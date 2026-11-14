// #54: contas de verdade nos testes do Worker — bootstrap do dono, convite, passkey (autenticador falso) e login.
// Tudo fictício; a origem é a do `call` (http://localhost:8791) e o ambiente roda SEM DEV_NO_AUTH (só o cookie vale).
import assert from "node:assert/strict";
import { call, makeEnv } from "./fakes.ts";
import { assinar, criar, novoAutenticador } from "../../../packages/core/test/fake-autenticador.ts";
import type { Autenticador } from "../../../packages/core/test/fake-autenticador.ts";

export const SETUP = "setup-ficticio-0123456789";
/** E-mail fictício do dono nos testes (o de verdade é o secret OWNER_EMAIL; nunca no repositório). */
export const DONO_EMAIL = "dona@exemplo.com";
/** Etapas 2–5 do cadastro (#62): nome, sobrenome, sexo, nascimento (opcional) e aceite. */
export const CAD = { sobrenome: "Fictícia", sexo: "feminino", aceite: true } as const;
export const ORIGEM = { origin: "http://localhost:8791", rpId: "localhost" };
let ipN = 0;
/** Cada cerimônia sai de um "IP" diferente para o limite de /auth/* não atrapalhar (ele tem teste próprio). */
export const ip = () => ({ "CF-Connecting-IP": `10.0.${(ipN >> 8) & 255}.${ipN++ & 255}` });
export const envConta = (extra: Record<string, unknown> = {}) => makeEnv({ DEV_NO_AUTH: undefined, MCP_TOKEN: undefined, OWNER_SETUP_CODE: SETUP, OWNER_EMAIL: DONO_EMAIL, ...extra });
export const cookieDe = (r: { headers: Headers }) => (r.headers.get("set-cookie") ?? "").split(";")[0];

export interface Conta { cookie: string; auth: Autenticador; codigos?: string[]; status: number; data: any }

/** Opções de registro + passkey criada pelo autenticador + POST /auth/register. */
export async function registrar(env: any, body: Record<string, unknown>, o: { alg?: "ES256" | "RS256"; cookie?: string; auth?: Autenticador } = {}): Promise<Conta> {
  const headers = { ...ip(), ...(o.cookie ? { Cookie: o.cookie } : {}) };
  const opt = await call(env, "POST", "/auth/register/options", { body, headers });
  const auth = o.auth ?? await novoAutenticador(o.alg ?? "ES256");
  if (opt.status !== 200) return { cookie: "", auth, status: opt.status, data: opt.data };
  const credential = await criar(auth, { ...ORIGEM, challenge: opt.data.options.challenge });
  const r = await call(env, "POST", "/auth/register", { body: { challengeId: opt.data.challengeId, credential }, headers: { ...ip(), ...(o.cookie ? { Cookie: o.cookie } : {}) } });
  auth.userHandle = opt.data.options.user.id;
  return { cookie: cookieDe(r), auth, codigos: r.data?.codigos, status: r.status, data: r.data };
}

export async function dono(env: any, nome = "Dona Fictícia") {
  const c = await registrar(env, { setup: SETUP, email: DONO_EMAIL, nome, ...CAD });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  return c;
}
let emailN = 0;
/** Convite do dono (#62: e-mail e nome obrigatórios; a sessão do dono acabou de passar pelo Face ID). `data.email` = e-mail do convite. */
export async function convite(env: any, donoCookie: string, body: Record<string, unknown> = {}) {
  const b = { email: `pessoa${++emailN}@exemplo.com`, nome: "Convidada", ...body };
  const r = await call(env, "POST", "/api/account/invites", { body: b, headers: { Cookie: donoCookie } });
  if (r.data && typeof r.data === "object") r.data.email = b.email;
  return r;
}
/** Corpo de cadastro por convite (#62) com o e-mail travado do convite. */
export const cadastro = (inv: { codigo: string; email: string }, nome: string, extra: Record<string, unknown> = {}) => ({ convite: inv.codigo, email: inv.email, nome, ...CAD, ...extra });
export async function contaPorConvite(env: any, donoCookie: string, nome: string, alg: "ES256" | "RS256" = "ES256") {
  const inv = await convite(env, donoCookie);
  assert.equal(inv.status, 201, inv.text);
  const c = await registrar(env, cadastro(inv.data, nome), { alg });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  return c;
}
/** Login por passkey: opções → assinatura → cookie novo. */
export async function entrar(env: any, auth: Autenticador, mexer: Record<string, unknown> = {}) {
  const opt = await call(env, "POST", "/auth/login/options", { body: {}, headers: ip() });
  const credential = await assinar(auth, { ...ORIGEM, challenge: opt.data.options.challenge, ...mexer });
  const r = await call(env, "POST", "/auth/login", { body: { challengeId: opt.data.challengeId, credential }, headers: ip() });
  return { ...r, cookie: cookieDe(r) };
}
