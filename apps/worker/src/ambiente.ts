// #58 Ambiente de testes: de onde vêm o rpId e a origem do WebAuthn, e qual faixa o app mostra.
// Local (localhost) funciona sem nada; o túnel (cloudflared) chega com outro host e em https.
import type { Env } from "./env.ts";

export type Ambiente = "producao" | "staging" | "tunel";

/** rpId = host da requisição (sem porta). Origem = PUBLIC_ORIGIN, se houver; senão a da requisição. No túnel de dev
 *  (DEV_TUNNEL=1, só passado pelo `npm run dev:tunnel`) o wrangler vê http, então vale o X-Forwarded-Proto do cloudflared. */
export function webauthnWhere(req: Request, env: Pick<Env, "PUBLIC_ORIGIN" | "DEV_TUNNEL">): { rpId: string; origin: string } {
  const u = new URL(req.url);
  const fixa = env.PUBLIC_ORIGIN?.trim();
  if (fixa) { try { const o = new URL(fixa); if (o.protocol === "https:" || o.hostname === "localhost") return { rpId: o.hostname, origin: o.origin }; } catch { /* ignora valor inválido */ } }
  const https = env.DEV_TUNNEL === "1" && req.headers.get("X-Forwarded-Proto") === "https";
  return { rpId: u.hostname, origin: https ? `https://${u.host}` : u.origin };
}

export const ambiente = (env: Pick<Env, "ENVIRONMENT" | "DEV_TUNNEL">): Ambiente | null =>
  env.ENVIRONMENT === "staging" ? "staging" : env.DEV_TUNNEL === "1" ? "tunel" : null;
