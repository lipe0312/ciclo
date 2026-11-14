// #70 Só dev local (localhost + DEV_NO_AUTH=1 + `npm run dev:cenario`, que passa CENARIO_NOME e CENARIO_CTRL). Em qualquer outro
// lugar estas rotas respondem 404, como se não existissem.
//   GET  /api/dev/cenario        → { nome }: o app só mostra o botão "↺ cenário" se isto responder.
//   POST /api/dev/cenario/reset  → pede ao `dev:cenario` (127.0.0.1:CENARIO_CTRL) que zere o banco e rode o seed de novo.
// Não lê nem grava dado de conta: quem zera e semeia é o script, que só tem acesso ao D1 local do cenário.
import type { Env } from "./env.ts";
import { isLocalDev } from "./auth.ts";
import { json } from "./http.ts";

const naoExiste = () => json({ error: "rota não encontrada" }, 404);
const NOME_RE = /^[a-z]{1,20}$/;

export function portaCtrl(env: Pick<Env, "CENARIO_CTRL">): number | null {
  const n = Number(env.CENARIO_CTRL);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : null;
}

/** `/api/dev/cenario*`: resposta ou null se o caminho não é desta rota. `buscar` existe para o teste trocar o fetch. */
export async function handleDevCenario(req: Request, env: Env, buscar: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/dev/cenario" && url.pathname !== "/api/dev/cenario/reset") return null;
  const nome = env.CENARIO_NOME ?? "";
  if (!isLocalDev(req, env) || !NOME_RE.test(nome)) return naoExiste();
  if (url.pathname === "/api/dev/cenario") return req.method === "GET" ? json({ nome }) : naoExiste();
  if (req.method !== "POST") return naoExiste();
  const origin = req.headers.get("Origin");
  if (origin && origin !== url.origin) return json({ error: "origem inválida" }, 403);
  const porta = portaCtrl(env);
  if (!porta) return naoExiste();
  try {
    const r = await buscar(`http://127.0.0.1:${porta}/reset`, { method: "POST", headers: { "x-ciclo-cenario": "reset" } });
    return r.ok ? json({ ok: true, nome }) : json({ error: "o reset falhou; veja o terminal do dev:cenario" }, 502);
  } catch { return json({ error: "o dev:cenario não respondeu; ele está rodando?" }, 502); }
}
