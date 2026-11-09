// Casca do app: navegação, faixa de avisos, mini-barra, folha e toast. Cada tela vive em screens/<tela>/.
import type { FunctionComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import { S, useStore } from "./lib/store/index.ts";
import { SERVER, onQueue, queue } from "./lib/api/index.ts";
import { useRoute } from "./lib/roteador/index.ts";
import type { Route } from "./lib/roteador/index.ts";
import { Folha, closeSheet, setSheetRerender } from "./lib/folha/index.tsx";
import { Faixa, hideFaixa, setFaixaRerender, showFaixa } from "./lib/faixa/index.tsx";
import { MiniBarra } from "./lib/mini-barra/index.tsx";
import { Icon, Toast } from "./lib/ui/index.tsx";
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
  useEffect(() => { closeSheet(); scrollTo(0, 0); }, [route.screen, route.parts.join("/")]);
  useEffect(() => {
    if (SERVER && (queue.length || !navigator.onLine)) showFaixa({ id: "offline", tone: "warn", text: `Sem conexão: usando o que está no aparelho${queue.length ? ` · ${queue.length} alteração(ões) na fila` : ""}.`, closable: false });
    else hideFaixa("offline");
  }, [tick]);
  const screen = SCREENS[route.screen] ? route.screen : "hoje";
  const Tela = SCREENS[screen];
  const cur = (id: string) => (id === screen || (id === "mais" && MAIS.some((d) => d.id === screen)) ? "page" : undefined);
  void S;
  return <div class="app">
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
        <section class="view on" aria-label={screen}><Tela route={route} /></section>
      </div>
    </main>
    <MiniBarra screen={screen} />
    <nav class="bottom" aria-label="Principal">{PRINCIPAL.map((d) => <a key={d.id} href={`#${d.id}`} aria-current={cur(d.id)}><Icon id={d.icon} />{d.nm}</a>)}</nav>
    <Folha tick={tick} />
    <Toast />
  </div>;
}
