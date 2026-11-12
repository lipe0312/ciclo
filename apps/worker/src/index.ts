// Worker "ciclo": serve o app (assets estáticos), /api (JSON) e /mcp (connector do Claude) + cron.
import type { Env } from "./env.ts";
import { DEV_USER_RE, authenticateApi, authenticateMcp, isLocalDev } from "./auth.ts";
import { handleApi, uploadMedia } from "./api.ts";
import { HttpError, json } from "./http.ts";
import { handleMcp } from "./mcp.ts";
import { closeStaleSessions, hitRateLimit, purgeTrash } from "./db.ts";
import { sendDueRests } from "./push.ts";

const unauthorized = () => json({ error: "não autorizado" }, 401, { "WWW-Authenticate": 'Bearer realm="ciclo"' });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/health") return json({ ok: true, version: env.APP_VERSION });

    if (url.pathname === "/mcp") {
      const u = await authenticateMcp(req, env);
      if (!u) return unauthorized();
      return handleMcp(req, env, u);
    }

    // Upload de mídia pelo Claude Code (apps/mcp-local), protegido pelo mesmo token do MCP (da conta)
    if (url.pathname === "/mcp/media" && req.method === "POST") {
      const u = await authenticateMcp(req, env);
      if (!u) return unauthorized();
      try {
        const wait = await hitRateLimit(env, u.id, "upload");
        if (wait) return json({ error: "muitas requisições; tente de novo em instantes" }, 429, { "Retry-After": String(wait) });
        return await uploadMedia(req, env, u.id);
      } catch (e) { return e instanceof HttpError ? json({ error: e.message }, e.status) : json({ error: "erro interno" }, 500); }
    }

    // Só em dev local: troca o usuário de dev pelo navegador (/api/dev/user?u=b) gravando o cookie ciclo_dev_user.
    if (url.pathname === "/api/dev/user") {
      if (!isLocalDev(req, env)) return json({ error: "rota não encontrada" }, 404);
      const slug = url.searchParams.get("u") ?? "";
      if (!DEV_USER_RE.test(slug)) return json({ error: "u inválido (a-z, 0-9, _ e -)" }, 400);
      return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": `ciclo_dev_user=${slug}; Path=/; SameSite=Strict; HttpOnly`, "Cache-Control": "no-store" } });
    }

    if (url.pathname.startsWith("/api/")) {
      // CSRF: escrita só da própria origem (o app não usa CORS)
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("Origin");
        if (origin && origin !== url.origin) return json({ error: "origem inválida" }, 403);
      }
      let u;
      try { u = await authenticateApi(req, env); } catch { return json({ error: "erro interno" }, 500); }
      if (!u) return json({ error: "não autorizado" }, 401);
      return handleApi(req, env, u);
    }

    return env.ASSETS.fetch(req);
  },

  // Cron de 1 min (sem IA): avisa o fim do descanso por Web Push (#25) e, a cada 30 min, fecha treinos esquecidos
  // de todas as contas (iniciou = foi; máx. 2 h).
  async scheduled(c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendDueRests(env).catch(() => 0));
    if (new Date(c.scheduledTime).getUTCMinutes() % 30 === 0) ctx.waitUntil(closeStaleSessions(env));
    if (new Date(c.scheduledTime).getUTCMinutes() === 0) ctx.waitUntil(purgeTrash(env).catch(() => null)); // lixeira de 30 dias (#26)
  },
} satisfies ExportedHandler<Env>;
