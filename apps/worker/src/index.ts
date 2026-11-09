// Worker "ciclo": serve o app (assets estáticos), /api (JSON) e /mcp (connector do Claude) + cron.
import type { Env } from "./env.ts";
import { verifyAccess, verifyBearer } from "./auth.ts";
import { handleApi, uploadMedia } from "./api.ts";
import { HttpError } from "./http.ts";
import { handleMcp } from "./mcp.ts";
import { closeStaleSessions } from "./db.ts";
import { json } from "./http.ts";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/health") return json({ ok: true, version: env.APP_VERSION });

    if (url.pathname === "/mcp") {
      if (!(await verifyBearer(req, env.MCP_TOKEN))) {
        return json({ error: "não autorizado" }, 401, { "WWW-Authenticate": 'Bearer realm="ciclo"' });
      }
      return handleMcp(req, env);
    }

    // Upload de mídia pelo Claude Code (apps/mcp-local), protegido pelo mesmo token do MCP
    if (url.pathname === "/mcp/media" && req.method === "POST") {
      if (!(await verifyBearer(req, env.MCP_TOKEN))) return json({ error: "não autorizado" }, 401);
      try { return await uploadMedia(req, env); } catch (e) { return e instanceof HttpError ? json({ error: e.message }, e.status) : json({ error: "erro interno" }, 500); }
    }

    if (url.pathname.startsWith("/api/")) {
      const user = await verifyAccess(req, env);
      if (!user) return json({ error: "não autorizado" }, 401);
      // CSRF: escrita só da própria origem (o app não usa CORS)
      if (req.method !== "GET") {
        const origin = req.headers.get("Origin");
        if (origin && origin !== url.origin) return json({ error: "origem inválida" }, 403);
      }
      return handleApi(req, env);
    }

    return env.ASSETS.fetch(req);
  },

  // Cron (sem IA): fecha treinos esquecidos (iniciou = foi; máx. 2 h).
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(closeStaleSessions(env));
  },
} satisfies ExportedHandler<Env>;
