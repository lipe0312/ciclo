// #54: passkey no navegador (WebAuthn). O servidor manda as opções em base64url; aqui viram ArrayBuffer e voltam.
import { b64urlDecode, b64urlEncode } from "@ciclo/core";
import { HttpError, api } from "../../lib/api/index.ts";

const buf = (s: string) => b64urlDecode(s).buffer as ArrayBuffer;
const enc = (b: ArrayBuffer) => b64urlEncode(new Uint8Array(b));

export const temPasskey = () => typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials;

/** Mensagem curta para erro de cerimônia (cancelou, sem passkey, servidor recusou). */
export function erroPasskey(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  const n = (e as { name?: string })?.name;
  if (n === "NotAllowedError") return "Cancelado, ou não há passkey do Ciclo neste aparelho.";
  if (n === "InvalidStateError") return "Este aparelho já tem uma passkey desta conta.";
  if (n === "SecurityError") return "O navegador recusou: abra o app pelo endereço oficial (https).";
  return "Não deu certo. Tente de novo.";
}

/** Cria a passkey: convite, primeiro acesso (setup) ou mais uma passkey da conta logada ({}). */
export async function criarPasskey(body: Record<string, unknown>): Promise<{ codigos?: string[]; sincronizada?: boolean }> {
  const o = await api<{ challengeId: string; options: any }>("POST", "/auth/register/options", body);
  const op = o.options;
  const cred = await navigator.credentials.create({
    publicKey: {
      ...op, challenge: buf(op.challenge), user: { ...op.user, id: buf(op.user.id) },
      excludeCredentials: (op.excludeCredentials ?? []).map((c: { id: string; type: "public-key" }) => ({ ...c, id: buf(c.id) })),
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelado");
  const r = cred.response as AuthenticatorAttestationResponse;
  return api("POST", "/auth/register", {
    challengeId: o.challengeId,
    credential: { id: cred.id, type: cred.type, response: { clientDataJSON: enc(r.clientDataJSON), attestationObject: enc(r.attestationObject), transports: r.getTransports?.() ?? [] } },
  });
}

/** Login com a passkey deste aparelho (ou de um iPhone por perto, pelo QR do próprio sistema). */
export async function entrarComPasskey(): Promise<void> {
  const o = await api<{ challengeId: string; options: any }>("POST", "/auth/login/options", {});
  const cred = await navigator.credentials.get({ publicKey: { ...o.options, challenge: buf(o.options.challenge) } }) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelado");
  const r = cred.response as AuthenticatorAssertionResponse;
  await api("POST", "/auth/login", {
    challengeId: o.challengeId,
    credential: {
      id: cred.id, type: cred.type,
      response: { clientDataJSON: enc(r.clientDataJSON), authenticatorData: enc(r.authenticatorData), signature: enc(r.signature), userHandle: r.userHandle ? enc(r.userHandle) : null },
    },
  });
}
