// Casca do app: navegação, faixa de avisos, mini-barra, folha e toast. Cada tela vive em screens/<tela>/.
import type { FunctionComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import { S, commit, useStore } from "./lib/store/index.ts";
import { planIsStale, regeneratePlan } from "./lib/store/regras.ts";
import { SERVER, onQueue, queue } from "./lib/api/index.ts";
import { useRoute } from "./lib/roteador/index.ts";
import type { Route } from "./lib/roteador/index.ts";
import { Folha, closeSheet, setSheetRerender } from "./lib/folha/index.tsx";
import { Faixa, hideFaixa, setFaixaRerender, showFaixa } from "./lib/faixa/index.tsx";
import { MiniBarra } from "./lib/mini-barra/index.tsx";
import { LembreteDiario } from "./lib/lembrete-diario/index.tsx";
import { Icon, Toast, toast } from "./lib/ui/index.tsx";
import { lsGet, lsSet } from "./lib/util.ts";
import { MAIS, PRINCIPAL } from "./nav.ts";
import { Voltar, useGestosVoltar } from "./lib/voltar/index.tsx";
import { preloadNoOcio, telaLenta } from "./lib/tela-lenta/index.tsx";
import Hoje from "./screens/hoje/index.tsx";
import Treino from "./screens/treino/index.tsx";
import Conta from "./screens/conta/index.tsx";
import Mais from "./screens/mais/index.tsx";
import Entrar from "./screens/entrar/index.tsx";
import Legal from "./screens/legal/index.tsx";

// #64 Hoje e Treino (a academia) vêm no pacote inicial; o resto baixa ao abrir ou no ócio (fica no service worker).
type P = { route: Route };
const Semana = telaLenta<P>(() => import("./screens/semana/index.tsx"));
const Diario = telaLenta<P>(() => import("./screens/diario/index.tsx"));
const Comida = telaLenta<P>(() => import("./screens/comida/index.tsx"));
const Chat = telaLenta<P>(() => import("./screens/claude/index.tsx"));
const Corpo = telaLenta<P>(() => import("./screens/corpo/index.tsx"));
const Academias = telaLenta<P>(() => import("./screens/academias/index.tsx"));
const Perfil = telaLenta<P>(() => import("./screens/perfil/index.tsx"));
const Vida = telaLenta<P>(() => import("./screens/vida/index.tsx"));
const PrimeirosPassos = telaLenta<P>(() => import("./screens/primeiros-passos/index.tsx"));
const LENTAS = [Semana, Diario, Comida, Chat, Perfil, Corpo, Academias, PrimeirosPassos, Vida];

const SCREENS: Record<string, FunctionComponent<{ route: Route }>> = {
  hoje: Hoje, treino: Treino, diario: Diario, comida: Comida, chat: Chat, corpo: Corpo, academias: Academias,
  perfil: Perfil, conta: Conta, vida: Vida, semana: Semana, "primeiros-passos": PrimeirosPassos, mais: Mais,
};
/** Telas da barra inferior: na raiz, a saída é a própria barra (sem "voltar" no topo para não poluir). */
const RAIZ = new Set(PRINCIPAL.map((d) => d.id));

function pillText() { return !SERVER ? "Demonstração" : queue.length ? `Offline · ${queue.length} na fila` : navigator.onLine ? "Online" : "Offline"; }

function toggleTheme() {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme = dark ? "light" : "dark"; lsSet("ciclo:theme", r.dataset.theme);
}
const th = lsGet<string | null>("ciclo:theme", null); if (th) document.documentElement.dataset.theme = th;

const route2Of = (route: Route, screen: string): Route =>
  screen === route.screen ? route : screen === "chat" && route.screen === "claude" ? { ...route, screen } : { screen, parts: [], query: {} };

export function App() {
  useStore();
  const route = useRoute();
  const [tick, setTick] = useState(0);
  useEffect(() => { const f = () => setTick((x) => x + 1); setSheetRerender(f); setFaixaRerender(f); return onQueue(f); }, []);
  // #58: staging e túnel avisam que os dados não são os de verdade (o servidor diz em /api/health).
  useEffect(() => {
    if (!SERVER) return;
    fetch("/api/health", { credentials: "same-origin" }).then((r) => r.json()).then((h: { ambiente?: string | null }) => {
      if (h.ambiente === "staging" || h.ambiente === "tunel") showFaixa({ id: "ambiente", tone: "warn", closable: false,
        text: h.ambiente === "staging" ? "AMBIENTE DE TESTES: dados de teste, não são os de verdade." : "AMBIENTE DE TESTES: túnel temporário com dados locais fictícios." });
    }).catch(() => {});
  }, []);
  useEffect(() => { closeSheet(); scrollTo(0, 0); }, [route.screen, route.parts.join("/")]);
  useEffect(() => { preloadNoOcio(LENTAS); }, []);
  useEffect(() => {
    if (SERVER && (queue.length || !navigator.onLine)) showFaixa({ id: "offline", tone: "warn", text: `Sem conexão: usando o que está no aparelho${queue.length ? ` · ${queue.length} alteração(ões) na fila` : ""}.`, closable: false });
    else hideFaixa("offline");
  }, [tick]);
  // Conta nova: tudo cai nos Primeiros passos até terminar (Conta continua acessível).
  const pendente = SERVER && S.onboarding === "pendente";
  const pedida = route.screen === "claude" ? "chat" : route.screen; // #64: a aba virou Chat; #claude antigo continua abrindo
  const wanted = SCREENS[pedida] ? pedida : "hoje";
  const screen = pendente && wanted !== "conta" ? "primeiros-passos" : wanted;
  // Perfil mudou depois de o treino ser gerado: avisa e oferece regenerar (nunca regenera sozinho).
  const stale = planIsStale() && !pendente;
  useEffect(() => {
    if (stale) showFaixa({ id: "treino-desatualizado", tone: "warn", text: "Você mudou o perfil: o treino de hoje está desatualizado.", closable: false,
      action: { label: "Regenerar", onClick: () => { regeneratePlan(); commit(); toast("Treino regenerado com o perfil de hoje"); } } });
    else hideFaixa("treino-desatualizado");
  }, [stale]);
  const comVoltar = !pendente && !(RAIZ.has(screen) && route.parts.length === 0) && screen !== "hoje";
  const telaCheia = ["entrar", "convite", "termos", "privacidade"].includes(route.screen);
  useGestosVoltar(route2Of(route, screen), !pendente && !telaCheia);
  // #54/#62: #entrar, #convite/<código>, #termos e #privacidade são tela cheia, sem navegação (abrem sem sessão).
  if (route.screen === "entrar" || route.screen === "convite") return <div class="app focus entrar-app"><main class="main"><div class="wrap"><Faixa /><Entrar route={route} /></div></main><Toast /></div>;
  if (route.screen === "termos" || route.screen === "privacidade") return <div class="app focus entrar-app"><main class="main"><div class="wrap"><Legal route={route} /></div></main><Toast /></div>;
  const Tela = SCREENS[screen];
  const route2 = route2Of(route, screen);
  const cur = (id: string) => (id === screen || (id === "mais" && MAIS.some((d) => d.id === screen)) ? "page" : undefined);
  void S;
  return <div class={`app${screen === "primeiros-passos" ? " focus" : ""}`}>
    <nav class="side" aria-label="Principal">
      <div class="brand"><span class="logo"><Icon id="cycle" /></span>Ciclo</div>
      {PRINCIPAL.map((d) => <a key={d.id} href={`#${d.id}`} aria-current={cur(d.id)}><Icon id={d.icon} />{d.nm}</a>)}
      <p class="side-sep kicker">Mais</p>
      {MAIS.map((d) => <a key={d.id} href={`#${d.id}`} aria-current={cur(d.id)}><Icon id={d.icon} />{d.nm}</a>)}
      <div class="foot">{SERVER ? "Dados no seu Cloudflare (D1/R2)." : "Demonstração: dados fictícios, salvos só neste navegador."}</div>
    </nav>
    <main class="main">
      <div class="wrap">
        <div class="top">
          {comVoltar ? <Voltar route={route2} /> : <div class="brand"><span class="logo"><Icon id="cycle" /></span>Ciclo</div>}
          <div class="row" style="gap:8px"><span class="status-pill">{pillText()}</span>
            <button type="button" class="iconbtn" onClick={toggleTheme} aria-label="Alternar tema"><Icon id="moon" /></button>
            <a class="iconbtn only-mobile" href="#mais" aria-label="Mais opções" aria-current={cur("mais")}><Icon id="more" /></a></div>
        </div>
        <Faixa />
        <LembreteDiario hidden={screen === "primeiros-passos"} />
        <section key={screen} class="view on" aria-label={screen}><Tela route={route2} /></section>
      </div>
    </main>
    <MiniBarra screen={screen} />
    <nav class="bottom" aria-label="Principal">{PRINCIPAL.map((d) => <a key={d.id} href={`#${d.id}`} aria-current={cur(d.id)}><Icon id={d.icon} />{d.nm}</a>)}</nav>
    <Folha tick={tick} />
    <Toast />
  </div>;
}
