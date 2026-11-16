// #80 Porções faladas no Worker: camada 0 (regra + porção pessoal, no core) → camada 1 (IA leve: Workers AI → Haiku →
// OpenAI, os pagos só com chave + teto) com cache por texto, cota diária por conta, trava global (#56) e teto mensal em
// US$ reservado antes de cada chamada paga. O parser roda em modo sombra (grava só a comparação). Toda resposta de IA passa
// pelo validador do core; fora das regras, fica a camada 0. Todo SQL com bind e filtrado por user_id; nada do texto em log.
import { PRATO_BY_KEY, duvidasDoTeto, fecharRefeicao, interpretarPorcoes, paraPrevia, temConferir } from "@ciclo/core/porcoes";
import type { InterpretacaoPorcoes, ItemPorcao, PorcaoPessoal, RefeicaoPorcao } from "@ciclo/core/porcoes";
import {
  CACHE_PORCAO_DIAS, COTA_PORCAO_DIA, HAIKU_MODELO, MODELO_WORKERS_AI, custoHaikuUsd, PORCAO_MAX_SAIDA, candidatosBase, chaveCachePorcao, configHaiku, mensagensPorcao, mesclarItens,
  ordemProvedoresPorcao, validarPorcaoIA,
} from "@ciclo/core/porcao-ia";
import type { Candidato, ProvedorPorcao } from "@ciclo/core/porcao-ia";
import { aprenderPorcoes, compararSombra, parsePorcao } from "@ciclo/core/porcao-parser";
import { ALIMENTO_BY_KEY, MAX_DUVIDAS, configOpenai, custoUsd, estimarTokens, estimativaPiorUsd, mesUtc, normTexto } from "@ciclo/core";
import type { InterpretarEntrada } from "@ciclo/core";
import type { Env } from "./env.ts";
import { id } from "./http.ts";
import { sha256Hex } from "./auth.ts";
import { contarJanela, usoGlobal } from "./limites.ts";
import { searchTacoIdx } from "./taco.ts";

export const MAX_PORCOES_PESSOAIS = 200;
const IA_TIMEOUT_MS = 8_000;
const OFF_TIMEOUT_MS = 2_000;
const OFF_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DIA = 86_400_000;
const MAX_SOMBRA = 2000;

// ---------- porção pessoal ----------
export async function porcoesPessoais(env: Env, uid: string): Promise<PorcaoPessoal[]> {
  const { results } = await env.DB.prepare("SELECT alimento, medida, gramas FROM porcao_pessoal WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT ?2")
    .bind(uid, MAX_PORCOES_PESSOAIS).all<PorcaoPessoal>();
  return results;
}
/** A pessoa corrigiu ("meu prato de arroz é 200 g"): vale na hora para a próxima estimativa e passa por cima do aprendido.
 *  Teto de itens no mesmo comando (atômico). */
export function salvarPorcao(env: Env, uid: string, p: PorcaoPessoal, now = Date.now()) {
  return env.DB.prepare(`INSERT INTO porcao_pessoal (user_id, alimento, medida, gramas, n, origem, updated_at)
    SELECT ?1, ?2, ?3, ?4, 1, 'correcao', ?5
    WHERE EXISTS (SELECT 1 FROM porcao_pessoal WHERE user_id = ?1 AND alimento = ?2 AND medida = ?3) OR (SELECT COUNT(*) FROM porcao_pessoal WHERE user_id = ?1) < ?6
    ON CONFLICT (user_id, alimento, medida) DO UPDATE SET gramas = excluded.gramas, origem = 'correcao', updated_at = excluded.updated_at,
      n = CASE WHEN porcao_pessoal.origem = 'correcao' THEN porcao_pessoal.n + 1 ELSE 1 END`)
    .bind(uid, p.alimento, p.medida, Math.round(p.gramas * 10) / 10, now, MAX_PORCOES_PESSOAIS).run();
}
/** Aprende com os pares texto → itens finais que já estão no food_log (registros do Chat e as correções da #87). */
export async function aprenderDoHistorico(env: Env, uid: string, now = Date.now()) {
  const { results } = await env.DB.prepare(`SELECT raw_text, items FROM food_log WHERE user_id = ?1 AND items IS NOT NULL AND source = 'claude' AND created_at >= ?2
    ORDER BY created_at DESC LIMIT 200`).bind(uid, now - 60 * DIA).all<{ raw_text: string; items: string }>();
  const pares = results.flatMap((r) => {
    try {
      const it = JSON.parse(r.items) as { key?: unknown; g?: unknown }[];
      if (!Array.isArray(it)) return [];
      return [{ texto: r.raw_text, itens: it.map((x) => ({ key: typeof x?.key === "string" ? x.key : null, g: typeof x?.g === "number" ? x.g : null })) }];
    } catch { return []; }
  });
  const novas = aprenderPorcoes(pares, 2).filter((a) => ALIMENTO_BY_KEY[a.alimento] || PRATO_BY_KEY[a.alimento]);
  if (novas.length) await env.DB.batch(novas.slice(0, 20).map((a) => salvarPorcaoStmt(env, uid, a, now)));
  return novas.length;
}
const salvarPorcaoStmt = (env: Env, uid: string, a: PorcaoPessoal & { n: number }, now: number) =>
  env.DB.prepare(`INSERT INTO porcao_pessoal (user_id, alimento, medida, gramas, n, origem, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, 'aprendido', ?6 WHERE EXISTS (SELECT 1 FROM porcao_pessoal WHERE user_id = ?1 AND alimento = ?2 AND medida = ?3) OR (SELECT COUNT(*) FROM porcao_pessoal WHERE user_id = ?1) < ?7
    ON CONFLICT (user_id, alimento, medida) DO UPDATE SET gramas = excluded.gramas, n = excluded.n, updated_at = excluded.updated_at WHERE porcao_pessoal.origem = 'aprendido'`)
    .bind(uid, a.alimento, a.medida, a.gramas, a.n, now, MAX_PORCOES_PESSOAIS);

// ---------- buscar_alimento: TACO local e, se não achar, Open Food Facts (ADR-0014) ----------
const plaus = (n: unknown, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
/** Só o NOME do alimento sai (sem conta, sem texto inteiro), com timeout de 2 s e cache global de 30 dias. Falhou: lista vazia. */
export async function buscarOpenFoodFacts(env: Env, nome: string, now = Date.now()): Promise<Candidato[]> {
  const q = normTexto(nome).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.length < 3) return [];
  const chave = await sha256Hex(`off:${q}`);
  const hit = await env.DB.prepare("SELECT resultado FROM alimento_externo WHERE chave = ?1 AND created_at >= ?2").bind(chave, now - CACHE_PORCAO_DIAS * DIA).first<{ resultado: string }>();
  if (hit) { try { return JSON.parse(hit.resultado) as Candidato[]; } catch { /* refaz */ } }
  let out: Candidato[] = [];
  try {
    const u = new URL(OFF_URL);
    u.search = new URLSearchParams({ search_terms: q, search_simple: "1", json: "1", page_size: "3", fields: "code,product_name,nutriments" }).toString();
    const r = await fetch(u, { signal: AbortSignal.timeout(OFF_TIMEOUT_MS), headers: { "User-Agent": "Ciclo/0.1 (app pessoal de treino)" } });
    const j = r.ok ? await r.json() as { products?: { code?: unknown; product_name?: unknown; nutriments?: Record<string, unknown> }[] } : null;
    out = (j?.products ?? []).flatMap((p) => {
      const code = String(p.code ?? ""), kcal = p.nutriments?.["energy-kcal_100g"], prot = p.nutriments?.proteins_100g;
      if (!/^\d{6,14}$/.test(code) || typeof p.product_name !== "string" || !plaus(kcal, 900) || !plaus(prot, 100)) return [];
      return [{ id: `off:${code}`, nome: p.product_name.replace(/[\u0000-\u001f«»<>]/g, " ").trim().slice(0, 60) || "produto", kcal, prot, gTipico: 100, gMax: 1000 }];
    }).slice(0, 3);
  } catch { return []; } // rede, tempo esgotado: segue sem
  await env.DB.prepare("INSERT INTO alimento_externo (chave, resultado, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(chave) DO UPDATE SET resultado = excluded.resultado, created_at = excluded.created_at")
    .bind(chave, JSON.stringify(out), now).run();
  return out;
}
/** Candidatos de um trecho que a regra não reconheceu: TACO primeiro; sem nada na TACO, Open Food Facts. */
async function buscarAlimento(env: Env, nome: string): Promise<Candidato[]> {
  const taco = searchTacoIdx(nome, 3).map((t): Candidato => ({ id: `taco:${t.idx}`, nome: t.nome, kcal: t.kcal, prot: t.prot, gTipico: 150, gMax: 1000 }));
  return taco.length ? taco : buscarOpenFoodFacts(env, nome);
}

// ---------- provedores ----------
async function reservar(env: Env, modelo: string, maxUsd: number, entrada: string) {
  const mes = mesUtc(Date.now());
  const pior = modelo === HAIKU_MODELO ? custoHaikuUsd({ input_tokens: estimarTokens(entrada), output_tokens: PORCAO_MAX_SAIDA }) : estimativaPiorUsd(modelo, estimarTokens(entrada), PORCAO_MAX_SAIDA);
  const est = Math.ceil(pior * 1e6);
  const [, r] = await env.DB.batch([
    env.DB.prepare("INSERT INTO cerebro_gasto (mes, usd_micro, chamadas) VALUES (?1, 0, 0) ON CONFLICT(mes) DO NOTHING").bind(mes),
    env.DB.prepare("UPDATE cerebro_gasto SET usd_micro = usd_micro + ?2, chamadas = chamadas + 1 WHERE mes = ?1 AND usd_micro + ?2 <= ?3 RETURNING usd_micro").bind(mes, est, Math.floor(maxUsd * 1e6)),
  ]);
  return r.results?.length ? { mes, est } : null;
}
const acertar = (env: Env, mes: string, est: number, real: number) =>
  env.DB.prepare("UPDATE cerebro_gasto SET usd_micro = MAX(0, usd_micro - ?2 + ?3) WHERE mes = ?1").bind(mes, est, real).run();

/** Resposta crua do provedor (string) ou null (desligado, sem cota, erro, tempo esgotado). Nunca loga o texto. */
export async function chamarProvedor(env: Env, prov: ProvedorPorcao, msgs: { role: "system" | "user"; content: string }[]): Promise<string | null> {
  try {
    if (prov === "workers-ai") {
      if (!env.AI) return null;
      const out = await Promise.race([
        env.AI.run(MODELO_WORKERS_AI, { messages: msgs, max_tokens: PORCAO_MAX_SAIDA, temperature: 0.2 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("tempo")), IA_TIMEOUT_MS)),
      ]) as { response?: unknown };
      return typeof out?.response === "string" ? out.response : out?.response && typeof out.response === "object" ? JSON.stringify(out.response) : null;
    }
    if (prov === "haiku") {
      const cfg = configHaiku(env);
      if (!cfg.ligado) return null;
      const res = await reservar(env, cfg.modelo, cfg.maxUsd, JSON.stringify(msgs));
      if (!res) return null; // teto do mês
      const r = await fetch(ANTHROPIC_URL, {
        method: "POST", signal: AbortSignal.timeout(IA_TIMEOUT_MS),
        headers: { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.modelo, max_tokens: PORCAO_MAX_SAIDA, system: msgs[0].content, messages: [{ role: "user", content: msgs[1].content }], thinking: { type: "disabled" }, output_config: { effort: "low" } }),
      });
      const j = (await r.json().catch(() => null)) as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string } | null;
      if (j?.usage) await acertar(env, res.mes, res.est, Math.ceil(custoHaikuUsd(j.usage) * 1e6));
      if (!r.ok || j?.stop_reason === "refusal") return null;
      return j?.content?.find((b) => b.type === "text")?.text ?? null;
    }
    const cfg = configOpenai(env);
    if (!cfg.ligado) return null;
    const res = await reservar(env, cfg.modelo, cfg.maxUsd, JSON.stringify(msgs));
    if (!res) return null;
    const r = await fetch(OPENAI_URL, {
      method: "POST", signal: AbortSignal.timeout(IA_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.modelo, messages: msgs, response_format: { type: "json_object" }, max_completion_tokens: PORCAO_MAX_SAIDA, temperature: 0.2 }),
    });
    const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
    if (j?.usage) await acertar(env, res.mes, res.est, Math.ceil(custoUsd(cfg.modelo, j.usage) * 1e6));
    if (!r.ok) return null;
    const c = j?.choices?.[0]?.message?.content;
    return typeof c === "string" ? c : null;
  } catch { return null; } // sem o conteúdo (privacidade): segue para o próximo provedor
}

// ---------- interpretador com IA ----------
export type InterpretacaoIA = InterpretacaoPorcoes & { ia: ProvedorPorcao | "cache" | null };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A troca da #80 por trás do `interpretarComida` da #81: mesma forma, com IA quando houver. Sem IA: só a camada 0. */
export async function interpretarComIA(env: Env, uid: string, e: InterpretarEntrada, now = Date.now()): Promise<InterpretacaoIA> {
  await aprenderDoHistorico(env, uid, now).catch(() => 0);
  const pessoais = await porcoesPessoais(env, uid);
  const c0 = interpretarPorcoes({ ...e, pessoais });
  const ordem = ordemProvedoresPorcao({ ai: !!env.AI, haiku: configHaiku(env), openai: configOpenai(env) });
  if (!ordem.length) return { ...c0, ia: null };
  if ((await usoGlobal(env, now)).nivel === "trava") return { ...c0, ia: null };
  const base = e.base ?? [];
  let usou: InterpretacaoIA["ia"] = null, semCota = false;
  const refeicoes: RefeicaoPorcao[] = [];
  for (const r of c0.refeicoes) {
    const chave = await sha256Hex(chaveCachePorcao(r.texto));
    let itens: ItemPorcao[] | null = null;
    const hit = await env.DB.prepare("SELECT itens FROM porcao_cache WHERE user_id = ?1 AND chave = ?2 AND created_at >= ?3").bind(uid, chave, now - CACHE_PORCAO_DIAS * DIA).first<{ itens: string }>();
    if (hit) { try { itens = JSON.parse(hit.itens) as ItemPorcao[]; usou = usou ?? "cache"; } catch { itens = null; } }
    if (!itens && !semCota && refeicoes.length < 4) {
      // cota diária por conta: a chave do contador é o hash do id, nunca o id
      if (await contarJanela(env, `porcao:${(await sha256Hex("porcao:" + uid)).slice(0, 32)}`, { max: COTA_PORCAO_DIA, windowMs: DIA }, now)) semCota = true;
      else {
        const extras = (await Promise.all(r.itens.filter((i) => !i.key && i.conferir).slice(0, 3).map((i) => buscarAlimento(env, i.nome)))).flat();
        const cands = [...candidatosBase(base), ...extras];
        const parser = parsePorcao(r.texto);
        const msgs = mensagensPorcao(r.texto, cands, parser.map((p) => p.tags.join(" ")));
        for (const prov of ordem) {
          const v = validarPorcaoIA(await chamarProvedor(env, prov, msgs), cands);
          if (!v.ok) continue;
          itens = v.itens; usou = prov;
          const cmp = compararSombra(parser, v.itens);
          await env.DB.batch([
            env.DB.prepare("INSERT INTO porcao_cache (user_id, chave, itens, provedor, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, chave) DO UPDATE SET itens = excluded.itens, provedor = excluded.provedor, created_at = excluded.created_at")
              .bind(uid, chave, JSON.stringify(v.itens).slice(0, 8000), prov, now),
            env.DB.prepare(`INSERT INTO porcao_sombra (user_id, id, categoria, concordou, erro_g, comparacao, created_at)
              SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE (SELECT COUNT(*) FROM porcao_sombra WHERE user_id = ?1) < ?8`)
              .bind(uid, id(), cmp.categoria.slice(0, 20), cmp.concordou ? 1 : 0, cmp.erroG, JSON.stringify(cmp).slice(0, 4000), now, MAX_SOMBRA),
          ]);
          break;
        }
      }
    }
    if (!itens) { refeicoes.push(r); continue; }
    const zero = r.itens.filter((i) => !i.key && !i.conferir); // café, água, chá
    const mescla = mesclarItens(r.itens.filter((i) => i.key) as ItemPorcao[], itens);
    refeicoes.push(fecharRefeicao({ refeicao: r.refeicao, texto: r.texto, itens: [...mescla.map(paraPrevia), ...zero] }));
  }
  if (!usou) return { ...c0, ia: null };
  // dúvidas: as do teto primeiro; "não reconheci" só para o que continua sem chave
  const restam = new Set(refeicoes.flatMap((r) => r.itens.filter((i) => !i.key && i.conferir).map((i) => i.nome)));
  const doTeto = duvidasDoTeto(refeicoes);
  const outras = c0.duvidas.filter((d) => !d.startsWith("⚠") && (!d.startsWith("Não reconheci") || [...restam].some((n) => d.includes(`"${n}"`))));
  const duvidas = [...doTeto, ...outras].slice(0, MAX_DUVIDAS);
  const supIA = refeicoes.flatMap((r) => r.itens.filter((i) => i.origem === "ia").flatMap((i) => i.suposicoes));
  const total = { kcal: refeicoes.reduce((s, r) => s + r.kcal, 0), prot: r1(refeicoes.reduce((s, r) => s + r.prot, 0)) };
  const pior: InterpretacaoIA["confianca"] = refeicoes.some((r) => r.confianca === "baixa") || temConferir({ refeicoes }) ? "baixa" : refeicoes.some((r) => r.confianca === "media") || duvidas.length ? "media" : "alta";
  return { ...c0, refeicoes, total, duvidas, suposicoes: [...new Set([...c0.suposicoes.filter((s) => !s.includes("(não reconheci)")), ...supIA])].slice(0, 10), confianca: pior, ia: usou };
}
