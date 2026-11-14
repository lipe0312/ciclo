// #56 Proteção contra abuso e custo: contadores no D1 (janela fixa), bloqueio por falhas, Turnstile e cotas.
// Regras puras em packages/core/src/limites.ts. Aqui só SQL (sempre com bind) e a chamada ao siteverify.
// Por que D1 e não o binding `ratelimits`: ele só aceita janelas de 10 s ou 60 s e é aproximado por local; os limites
// por hora, o bloqueio de 15 min e os testes determinísticos pedem um contador exato.
import {
  AUTH_GLOBAL, COTA_MSG, CONTA_R2_MAX_BYTES, bloqueioRestante, cabeNaConta, diaUtc, esperaJanela, inicioJanela, nivelGlobal,
  precisaTurnstile, registrarFalha,
} from "@ciclo/core";
import type { Falhas, Janela, NivelCota } from "@ciclo/core";
import type { Env } from "./env.ts";
import { HttpError } from "./http.ts";

const te = new TextEncoder();
const hex = (u8: Uint8Array) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Pepper do HMAC do IP: secret AUTH_PEPPER (recomendado); sem ele, o OWNER_SETUP_CODE; em último caso, fixo (só dev/teste). */
const pepperOf = (env: Env) => env.AUTH_PEPPER || env.OWNER_SETUP_CODE || "ciclo-auth-dev";
async function hmacHex(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", te.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(msg))));
}
export const ipDe = (req: Request) => req.headers.get("CF-Connecting-IP") ?? "local";
/** Chave da origem: HMAC do IP (nunca o IP puro nem um hash adivinhável). */
export const chaveIp = async (env: Env, req: Request) => (await hmacHex(pepperOf(env), ipDe(req))).slice(0, 32);

/** Conta +1 na chave (tabela auth_rate_limit, janela fixa) e devolve os segundos de espera (0 = pode). */
export async function contarJanela(env: Env, key: string, j: Janela, now = Date.now()): Promise<number> {
  const w = inicioJanela(now, j.windowMs);
  const r = await env.DB.prepare(`INSERT INTO auth_rate_limit (key, window_start, count) VALUES (?1, ?2, 1)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END, window_start = ?2 RETURNING count`)
    .bind(key, w).first<{ count: number }>();
  return esperaJanela(r?.count ?? 0, j, now);
}
/** Limite global de uma rota sensível (todas as origens juntas). */
export const contarGlobal = (env: Env, rota: keyof typeof AUTH_GLOBAL, now = Date.now()) => contarJanela(env, `g:${rota}`, AUTH_GLOBAL[rota], now);

// ---- falhas seguidas (bloqueio de 15 min e Turnstile) ----
export async function lerFalhas(env: Env, key: string): Promise<Falhas | null> {
  return env.DB.prepare("SELECT falhas, ate FROM auth_falhas WHERE key = ?1").bind(key).first<Falhas>();
}
export async function anotarFalha(env: Env, key: string, now = Date.now()) {
  const f = registrarFalha(await lerFalhas(env, key), now);
  await env.DB.prepare(`INSERT INTO auth_falhas (key, falhas, ate, updated_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(key) DO UPDATE SET falhas = ?2, ate = ?3, updated_at = ?4`).bind(key, f.falhas, f.ate, now).run();
}
export async function zerarFalhas(env: Env, key: string) {
  await env.DB.prepare("DELETE FROM auth_falhas WHERE key = ?1").bind(key).run();
}
export { bloqueioRestante, precisaTurnstile };

// ---- Turnstile (opcional: sem TURNSTILE_SECRET fica desligado, como no dev local e nos testes) ----
export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const turnstileLigado = (env: Env) => !!env.TURNSTILE_SECRET && !!env.TURNSTILE_SITE_KEY;
/** Valida o token no servidor. Sem token, token inválido, já usado ou siteverify fora do ar → 403 (falha fechada). */
export async function exigirTurnstile(env: Env, req: Request, token: unknown): Promise<void> {
  if (!turnstileLigado(env)) return;
  if (typeof token !== "string" || !token || token.length > 2048) throw new HttpError(403, "confirme que você não é um robô", "turnstile");
  let ok = false;
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET!, response: token, remoteip: ipDe(req) });
    const r = await fetch(SITEVERIFY, { method: "POST", body });
    ok = r.ok && (await r.json() as { success?: boolean }).success === true;
  } catch { ok = false; }
  if (!ok) throw new HttpError(403, "a verificação contra robôs falhou; tente de novo", "turnstile");
}

// ---- cotas: conta (R2) e app inteiro (plano grátis) ----
/** Uma escrita a mais no contador do dia (cota global). Vai no mesmo batch do limite por usuário. */
export const somarEscrita = (env: Env, now = Date.now()) =>
  env.DB.prepare("INSERT INTO uso_dia (dia, escritas) VALUES (?1, 1) ON CONFLICT(dia) DO UPDATE SET escritas = escritas + 1").bind(diaUtc(now));
export const somarBytesR2 = (env: Env, bytes: number, now = Date.now()) =>
  env.DB.prepare("INSERT INTO uso_dia (dia, r2_bytes) VALUES (?1, ?2) ON CONFLICT(dia) DO UPDATE SET r2_bytes = r2_bytes + ?2").bind(diaUtc(now), bytes);

/** Uso global agora: escritas de hoje e bytes guardados no R2 (soma de `media` de todas as contas; só números). */
export async function usoGlobal(env: Env, now = Date.now()): Promise<{ pct: number; nivel: NivelCota }> {
  const r = await env.DB.prepare(`SELECT (SELECT COALESCE(escritas, 0) FROM uso_dia WHERE dia = ?1) AS escritas,
    (SELECT COALESCE(SUM(bytes), 0) FROM media) AS bytes`).bind(diaUtc(now)).first<{ escritas: number | null; bytes: number }>();
  return nivelGlobal({ escritasHoje: r?.escritas ?? 0, r2Bytes: r?.bytes ?? 0 });
}
/** A 95% do grátis, uploads e convites param (a leitura e o resto seguem). */
export async function exigirCotaGlobal(env: Env, now = Date.now()) {
  if ((await usoGlobal(env, now)).nivel === "trava") throw new HttpError(429, COTA_MSG.global, "cota_global");
}
/** Cota de R2 da conta (inclui a lixeira, que ainda ocupa espaço até o cron apagar). */
export async function exigirCotaConta(env: Env, uid: string, novos: number) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(bytes), 0) AS n FROM media WHERE user_id = ?1").bind(uid).first<{ n: number }>();
  if (!cabeNaConta(r?.n ?? 0, novos)) throw new HttpError(429, COTA_MSG.conta, "cota_conta");
}
export { CONTA_R2_MAX_BYTES };

/** Limpeza (cron de hora em hora): falhas velhas e dias de uso com mais de 35 dias. */
export async function purgeLimites(env: Env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_falhas WHERE updated_at <= ?1 AND (ate IS NULL OR ate <= ?2)").bind(now - 86_400_000, now),
    env.DB.prepare("DELETE FROM uso_dia WHERE dia < ?1").bind(diaUtc(now - 35 * 86_400_000)),
  ]);
}
