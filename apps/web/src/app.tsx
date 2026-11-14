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
import Hoje from "./screens/hoje/index.tsx";
import Treino from "./screens/treino/index.tsx";
import Diario from "./screens/diario/index.tsx";
import Comida from "./screens/comida/index.tsx";
import Claude from "./screens/claude/index.tsx";
import Corpo from "./screens/corpo/index.tsx";
import Academias from "./screens/academias/index.tsx";
import Perfil from "./screens/perfil/index.tsx";
import Conta from "./screens/conta/index.tsx";
import Vida from "./screens/vida/index.tsx";
import Semana from "./screens/semana/index.tsx";
import PrimeirosPassos from "./screens/primeiros-passos/index.tsx";
import Mais from "./screens/mais/index.tsx";
import Entrar from "./screens/entrar/index.tsx";

const SCREENS: Record<string, FunctionComponent<{ route: Route }>> = {
  hoje: Hoje, treino: Treino, diario: Diario, comida: Comida, claude: Claude, corpo: Corpo, academias: Academias,
  perfil: Perfil, conta: Conta, vida: Vida, semana: Semana, "primeiros-passos": PrimeirosPassos, mais: Mais,
};

function pillText() { return !SERVER ? "Demonstração" : queue.length ? `Offline · ${queue.length} na fila` : navigator.onLine ? "Online" : "Offline"; }

function toggleTheme() {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme = dark ? "light" : "dark"; lsSet("ciclo:theme", r.dataset.theme);
}
const th = lsGet<string | null>("ciclo:theme", null); if (th) document.documentElement.dataset.theme = th;

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
  useEffect(() => {
    if (SERVER && (queue.length || !navigator.onLine)) showFaixa({ id: "offline", tone: "warn", text: `Sem conexão: usando o que está no aparelho${queue.length ? ` · ${queue.length} alteração(ões) na fila` : ""}.`, closable: false });
    else hideFaixa("offline");
  }, [tick]);
  // Conta nova: tudo cai nos Primeiros passos até terminar (Conta continua acessível).
  const pendente = SERVER && S.onboarding === "pendente";
  const wanted = SCREENS[route.screen] ? route.screen : "hoje";
  const screen = pendente && wanted !== "conta" ? "primeiros-passos" : wanted;
  // Perfil mudou depois de o treino ser gerado: avisa e oferece regenerar (nunca regenera sozinho).
  const stale = planIsStale() && !pendente;
  useEffect(() => {
    if (stale) showFaixa({ id: "treino-desatualizado", tone: "warn", text: "Você mudou o perfil: o treino de hoje está desatualizado.", closable: false,
      action: { label: "Regenerar", onClick: () => { regeneratePlan(); commit(); toast("Treino regenerado com o perfil de hoje"); } } });
    else hideFaixa("treino-desatualizado");
  }, [stale]);
  // #54: #entrar é tela cheia, sem navegação (não há conta ainda); some a faixa e a mini-barra.
  if (route.screen === "entrar") return <div class="app focus entrar-app"><main class="main"><div class="wrap"><Faixa /><Entrar route={route} /></div></main><Toast /></div>;
  const Tela = SCREENS[screen];
  const route2: Route = screen === route.screen ? route : { screen, parts: [], query: {} };
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
          <div class="brand"><span class="logo"><Icon id="cycle" /></span>Ciclo</div>
          <div class="row" style="gap:8px"><span class="status-pill">{pillText()}</span>
            <button type="button" class="iconbtn" onClick={toggleTheme} aria-label="Alternar tema"><Icon id="moon" /></button>
            <a class="iconbtn only-mobile" href="#mais" aria-label="Mais opções" aria-current={cur("mais")}><Icon id="more" /></a></div>
        </div>
        <Faixa />
        <LembreteDiario hidden={screen === "primeiros-passos"} />
        <section class="view on" aria-label={screen}><Tela route={route2} /></section>
      </div>
    </main>
    <MiniBarra screen={screen} />
    <nav class="bottom" aria-label="Principal">{PRINCIPAL.map((d) => <a key={d.id} href={`#${d.id}`} aria-current={cur(d.id)}><Icon id={d.icon} />{d.nm}</a>)}</nav>
    <Folha tick={tick} />
    <Toast />
  </div>;
}
