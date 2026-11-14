// #66 Login com a passkey (Face ID) dentro da tela de consentimento, pela mesma API do #54 (/auth/login/*).
// Fica aqui (e não importado de screens/entrar) para a tela de consentimento não depender da casca do app.
import { b64urlDecode, b64urlEncode } from "@ciclo/core";

const buf = (s: string) => b64urlDecode(s).buffer as ArrayBuffer;
const enc = (b: ArrayBuffer) => b64urlEncode(new Uint8Array(b));

export class ErroApi extends Error { status: number; code?: string; constructor(m: string, s: number, c?: string) { super(m); this.status = s; this.code = c; } }

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = r.headers.get("Content-Type")?.includes("json") ? await r.json() : null;
  if (!r.ok) throw new ErroApi(data?.error || `HTTP ${r.status}`, r.status, data?.code);
  return data as T;
}

export const temPasskey = () => "PublicKeyCredential" in window && !!navigator.credentials;

export async function entrarComPasskey(): Promise<void> {
  const o = await api<{ challengeId: string; options: any }>("POST", "/auth/login/options", {});
  const cred = await navigator.credentials.get({ publicKey: { ...o.options, challenge: buf(o.options.challenge) } }) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelado");
  const r = cred.response as AuthenticatorAssertionResponse;
  await api("POST", "/auth/login", {
    challengeId: o.challengeId,
    credential: { id: cred.id, type: cred.type, response: { clientDataJSON: enc(r.clientDataJSON), authenticatorData: enc(r.authenticatorData), signature: enc(r.signature), userHandle: r.userHandle ? enc(r.userHandle) : null } },
  });
}

export function erroTexto(e: unknown): string {
  if (e instanceof ErroApi) return e.code === "turnstile" ? "Muitas tentativas. Entre pelo app do Ciclo primeiro e volte a esta tela." : e.message;
  const n = (e as { name?: string })?.name;
  if (n === "NotAllowedError") return "Cancelado, ou não há passkey do Ciclo neste aparelho.";
  if (n === "SecurityError") return "O navegador recusou: abra pelo endereço oficial do Ciclo (https).";
  return "Não deu certo. Tente de novo.";
}
