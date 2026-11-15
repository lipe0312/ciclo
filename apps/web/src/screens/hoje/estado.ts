// Estado da Home de evolução (#29). Servidor: GET /api/home (uma chamada; o core faz a conta). Demonstração: o mesmo core
// roda no navegador sobre 6 semanas de dados fictícios (demo.ts). A última resposta fica no aparelho para abrir sem sinal.
import * as C from "@ciclo/core";
import { S, commit, today } from "../../lib/store/index.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { lsGet, lsSet } from "../../lib/util.ts";
import { demoRaw } from "./demo.ts";

const CACHE = `ciclo:v1:${SERVER ? "srv" : "demo"}:home:${today}`;
export interface Carga { view: C.HomeView | null; carregando: boolean; erro: boolean }
export const H: Carga = { view: lsGet<C.HomeView | null>(CACHE, null), carregando: false, erro: false };
let pedido: Promise<void> | null = null;

/** Demonstração: o servidor conta no D1; aqui o mesmo core conta sobre os dados fictícios + o que a pessoa registrar. */
function demoView(): C.HomeView {
  const ctx = C.ctxDoPerfil(S.profile);
  const raw = demoRaw(today);
  // a comida de hoje (e dos dias que a pessoa registrar na demo) vem do estado local, por cima da fictícia
  const feitos = new Set((S.food as { date: string }[]).map((f) => f.date));
  const comida = raw.comida.filter((c) => !feitos.has(c.date)).concat(C.lastDays(today, 7).filter((d) => feitos.has(d)).map((d) => {
    const t = C.dayTotals(S.food as C.FoodEntry[], d); return { date: d, kcal: t.kcal, prot: t.prot };
  }));
  const midias = S.gymMedia.map((m) => ({ gymId: m.gymId, equipmentId: m.equipmentId }));
  return C.homeView({ ...raw, comida }, { ...ctx, hoje: today, diasDevidos: 7, aparelhosSemMidia: C.aparelhosSemMidia(S.gyms, midias, ctx.prioridades) });
}

/** Carrega uma vez por abertura (e de novo com `force`). Falha de rede mantém o que já estava na tela. */
export function carregarHome(force = false): Promise<void> {
  if (pedido && !force) return pedido;
  H.carregando = true; H.erro = false;
  pedido = (async () => {
    await Promise.resolve(); // o efeito da tela roda antes de a casca assinar o commit
    try {
      H.view = SERVER ? (await api<{ home: C.HomeView }>("GET", `/api/home?date=${today}`)).home : demoView();
      reaplicarCache(H.view);
      lsSet(CACHE, H.view);
    } catch (e) {
      if (!H.view) H.erro = true;
      if (!SERVER) console.error("home (demo)", e instanceof Error ? e.message : e);
    } finally { H.carregando = false; commit(); }
  })();
  return pedido;
}

// ---------- #73 cartão de boas-vindas e "Complete o perfil": o servidor manda; o aparelho guarda só um cache otimista ----------
const conta = () => (SERVER ? S.account?.email ?? "?" : "demo");
const KEY_BV = () => `ciclo:boas-vindas-dispensado:${conta()}`, KEY_PERFIL = () => `ciclo:perfil-adiado:${conta()}`;

/** O servidor ainda não sabe da dispensa feita aqui (rede caiu no meio): esconde já e tenta gravar de novo. */
function reaplicarCache(v: C.HomeView) {
  if (lsGet<string | null>(KEY_BV(), null) && v.boasVindas === "mostrar") { v.boasVindas = "oculto"; void gravar({ boasVindas: "dispensar" }); }
  const adiado = lsGet<string | null>(KEY_PERFIL(), null);
  if (adiado && (!v.perfilAdiadoEm || v.perfilAdiadoEm < adiado)) { v.perfilAdiadoEm = adiado; void gravar({ perfil: "adiar" }); }
}

async function gravar(body: { boasVindas?: "dispensar"; perfil?: "adiar" }) {
  if (!SERVER) return;
  try { await api("PATCH", "/api/home/preferencias", body); }
  catch { /* fica no cache do aparelho; a próxima abertura tenta de novo */ }
}

/** "✕ Dispensar" do "Sua semana está pronta": some aqui na hora e no servidor para sempre. */
export function dispensarBoasVindas() {
  lsSet(KEY_BV(), today);
  if (H.view) { H.view.boasVindas = "oculto"; lsSet(CACHE, H.view); }
  commit();
  void gravar({ boasVindas: "dispensar" });
}

/** "Lembrar depois" do "Complete o Perfil de treino": 7 dias. */
export function adiarPerfil() {
  lsSet(KEY_PERFIL(), today);
  if (H.view) { H.view.perfilAdiadoEm = today; lsSet(CACHE, H.view); }
  commit();
  void gravar({ perfil: "adiar" });
}

/** O cartão aparece? (o cache da Home pode ser de antes da dispensa feita neste aparelho) */
export const boasVindasVisivel = (v: C.HomeView) => v.boasVindas === "mostrar" && !lsGet<string | null>(KEY_BV(), null);
export const perfilAdiadoEm = (v: C.HomeView): string | null => {
  const l = lsGet<string | null>(KEY_PERFIL(), null), s = v.perfilAdiadoEm ?? null;
  return l && (!s || l > s) ? l : s;
};
