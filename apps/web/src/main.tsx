// Entrada do app (Vite + Preact). Modos: DEMO (?demo) guarda tudo no navegador com dados fictícios;
// SERVIDOR (Worker) lê /api/state e grava pela API, com fila offline para a academia sem sinal.
import { render } from "preact";
import "./app.css";
import { App } from "./app.tsx";
import { C, S, commit, loadLocal, loadServer, seedDemo, today } from "./lib/store/index.ts";
import { defaultGymFor } from "./lib/store/regras.ts";
import { SERVER, setHttpErrorHandler } from "./lib/api/index.ts";
import { showFaixa } from "./lib/faixa/index.tsx";
import { toast } from "./lib/ui/index.tsx";
import { setVozAI } from "./lib/voz/index.tsx";
import { autoClose, running } from "./screens/treino/sessao.ts";

setHttpErrorHandler(toast);

async function boot() {
  if (!SERVER) { seedDemo(); loadLocal(); }
  else {
    loadLocal();
    try { await loadServer(); }
    catch (e: any) {
      if (e?.status === 401) showFaixa({ id: "auth", tone: "bad", text: "Sessão expirada — recarregue para entrar.", action: { label: "Recarregar", onClick: () => location.reload() } });
      else showFaixa({ id: "boot", tone: "warn", text: "Sem conexão: usando o que está no aparelho." });
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    setInterval(() => { if (!document.hidden && !running()) loadServer().then(commit).catch(() => {}); }, 60000);
  }
  setVozAI(!!S.features.ai);
  S.ui.gymId = S.ui.gymId && S.gyms.some((g) => g.id === S.ui.gymId) ? S.ui.gymId : defaultGymFor(today);
  if (!S.ui.minutesSet) { S.ui.minutes = S.profile.minutes; S.ui.minutesSet = true; S.ui.format = S.profile.dynamics; }
  if (S.session && !S.session.finishedAt && C.resolveSession(S.session, Date.now()).status === "fechado_auto") autoClose();
  render(<App />, document.getElementById("app")!);
}
boot();
