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
      lsSet(CACHE, H.view);
    } catch (e) {
      if (!H.view) H.erro = true;
      if (!SERVER) console.error("home (demo)", e instanceof Error ? e.message : e);
    } finally { H.carregando = false; commit(); }
  })();
  return pedido;
}
