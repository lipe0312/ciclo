// Worker "ciclo": serve o app (assets estáticos), /api (JSON) e /mcp (connector do Claude) + cron.
import type { Env } from "./env.ts";
import { DEV_USER_RE, authenticateApi, authenticateMcp, isLocalDev } from "./auth.ts";
import { handleApi, uploadMedia } from "./api.ts";
import { HttpError, json } from "./http.ts";
import { handleAuth, purgeAuth } from "./auth-conta.ts";
import { handleMcp } from "./mcp.ts";
import { purgePrevias } from "./mcp-previa.ts";
import { closeStaleSessions, hitRateLimit, purgeTrash } from "./db.ts";
import { sendDueRests } from "./push.ts";
import { ambiente } from "./ambiente.ts";
import { purgeExpiredExams } from "./diario.ts";
import { purgeLimites } from "./limites.ts";
import { handleOauth, purgeOauth } from "./oauth.ts";
import { podeEscrever, wwwAuthenticate } from "@ciclo/core";
import { handleDevCenario } from "./dev-cenario.ts";
import { subirVersaoDepois } from "./versao.ts";

const LIVRE_SEM_ACEITE = new Set(["GET /api/account", "POST /api/account/consent", "GET /api/account/export", "DELETE /api/account", "POST /api/account/logout-all"]);
// #66: o 401 diz onde está a metadata OAuth (RFC 9728): o claude.ai descobre o login sozinho a partir da URL do /mcp.
const unauthorized = (req: Request) => json({ error: "não autorizado" }, 401, { "WWW-Authenticate": wwwAuthenticate(new URL(req.url).origin) });

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/health") return json({ ok: true, version: env.APP_VERSION, ambiente: ambiente(env) });

    // #66 OAuth 2.1 do MCP: metadata, registro dinâmico, authorize, token, revoke e a decisão da tela /autorizar.
    if (url.pathname.startsWith("/.well-known/") || url.pathname.startsWith("/oauth/")) {
      const r = await handleOauth(req, env, async (r2, e) => (await authenticateApi(r2, e).catch(() => null))?.user ?? null);
      if (r) return r;
    }

    if (url.pathname === "/mcp") {
      const u = await authenticateMcp(req, env);
      if (!u) return unauthorized(req);
      if (u.aceitePendente) return json({ error: "aceite os termos e a privacidade atualizados no app do Ciclo antes de usar pela sua IA", code: "aceite" }, 403); // #62
      return handleMcp(req, env, u, ctx);
    }

    // Upload de mídia pelo Claude Code (apps/mcp-local), protegido pelo mesmo token do MCP (da conta)
    if (url.pathname === "/mcp/media" && req.method === "POST") {
      const u = await authenticateMcp(req, env);
      if (!u) return unauthorized(req);
      if (u.aceitePendente) return json({ error: "aceite os termos e a privacidade atualizados no app", code: "aceite" }, 403); // #62
      if (!podeEscrever(u.escopo)) return json({ error: "esta conexão só tem o escopo ler" }, 403, { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="ler escrever"` }); // #81
      try {
        const wait = await hitRateLimit(env, u.id, "upload");
        if (wait) return json({ error: "muitas requisições; tente de novo em instantes" }, 429, { "Retry-After": String(wait) });
        const up = await uploadMedia(req, env, u.id);
        if (up.status < 400) await subirVersaoDepois(env, u.id, ctx); // #114 mídia enviada pelo Claude Code também atualiza o app aberto
        return up;
      } catch (e) { return e instanceof HttpError ? json({ error: e.message }, e.status) : json({ error: "erro interno" }, 500); }
    }

    // Só em dev local: troca o usuário de dev pelo navegador (/api/dev/user?u=b) gravando o cookie ciclo_dev_user.
    if (url.pathname === "/api/dev/user") {
      if (!isLocalDev(req, env)) return json({ error: "rota não encontrada" }, 404);
      const slug = url.searchParams.get("u") ?? "";
      if (!DEV_USER_RE.test(slug)) return json({ error: "u inválido (a-z, 0-9, _ e -)" }, 400);
      // #70: `t` = tela para abrir já logado (npm run dev:cenario --tela); só rota simples, nunca URL externa
      const t = url.searchParams.get("t") ?? "";
      if (t && !/^[a-z0-9][a-z0-9/_-]{0,60}$/.test(t)) return json({ error: "t inválido" }, 400);
      return new Response(null, { status: 302, headers: { Location: t ? `/#${t}` : "/", "Set-Cookie": `ciclo_dev_user=${slug}; Path=/; SameSite=Strict; HttpOnly`, "Cache-Control": "no-store" } });
    }

    // #70 cenários de teste local: botão "↺ cenário" (só localhost; 404 fora do dev:cenario)
    const dc = await handleDevCenario(req, env);
    if (dc) return dc;

    // #54 login próprio (passkey, convite, recuperação). Mesma regra de origem da API; limite por IP dentro.
    if (url.pathname.startsWith("/auth/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("Origin");
        if (origin && origin !== url.origin) return json({ error: "origem inválida" }, 403);
      }
      return handleAuth(req, env, async (r, e) => (await authenticateApi(r, e).catch(() => null))?.user ?? null);
    }

    if (url.pathname.startsWith("/api/")) {
      // CSRF: escrita só da própria origem (o app não usa CORS)
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.get("Origin");
        if (origin && origin !== url.origin) return json({ error: "origem inválida" }, 403);
      }
      let a;
      try { a = await authenticateApi(req, env); } catch { return json({ error: "erro interno" }, 500); }
      if (!a) return json({ error: "não autorizado", code: "entrar" }, 401);
      // #62: app fechado há mais de 7 dias → Face ID de novo, sem deslogar (a sessão continua; /auth/reauth destrava)
      if (a.trava) return json({ error: "confirme que é você com o Face ID", code: "faceid" }, 401);
      // #62: versão nova dos termos/privacidade → aceite antes de usar (dá para ler a conta, exportar, apagar e aceitar)
      if (a.user.aceitePendente && !LIVRE_SEM_ACEITE.has(`${req.method} ${url.pathname}`)) return json({ error: "aceite os termos e a privacidade atualizados", code: "aceite" }, 403);
      const res = await handleApi(req, env, a.user, ctx);
      // sessão renovada no uso (30 dias a partir de agora, até o teto de 180); a rota pode ter limpado o cookie (sair) e isso vence
      if (a.setCookie && !res.headers.has("Set-Cookie")) res.headers.append("Set-Cookie", a.setCookie);
      return res;
    }

    return env.ASSETS.fetch(req);
  },

  // Cron de 1 min (sem IA): avisa o fim do descanso por Web Push (#25) e, a cada 30 min, fecha treinos esquecidos
  // de todas as contas (iniciou = foi; máx. 2 h) e apaga o texto bruto de exames vencidos (#27).
  async scheduled(c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendDueRests(env).catch(() => 0));
    if (new Date(c.scheduledTime).getUTCMinutes() % 30 === 0) {
      ctx.waitUntil(closeStaleSessions(env));
      ctx.waitUntil(purgeExpiredExams(env, c.scheduledTime).catch(() => null)); // #27: texto bruto de exame some em até 7 dias
    }
    if (new Date(c.scheduledTime).getUTCMinutes() === 0) {
      ctx.waitUntil(purgeTrash(env).catch(() => null)); // lixeira de 30 dias (#26)
      ctx.waitUntil(purgeAuth(env, c.scheduledTime).catch(() => null)); // sessões vencidas, desafios e convites velhos (#54)
      ctx.waitUntil(purgeLimites(env, c.scheduledTime).catch(() => null)); // falhas de login e uso diário antigos (#56)
      ctx.waitUntil(purgeOauth(env, c.scheduledTime).catch(() => null)); // pedidos/códigos OAuth vencidos e clientes ociosos (#66)
      ctx.waitUntil(purgePrevias(env, c.scheduledTime).catch(() => null)); // prévias do MCP vencidas há mais de 1 dia (#81)
    }
  },
} satisfies ExportedHandler<Env>;
