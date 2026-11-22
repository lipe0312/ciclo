// #70 Chrome headless pelo protocolo CDP (WebSocket do Node 22, sem dependência). Usado pelos roteiros e2e de cenário.
// Só abre localhost: a página recebe o usuário de dev pelo cabeçalho x-dev-user. CHROME=/caminho/do/chrome para outro Chromium.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");

/** Mata o Chrome e os filhos (renderer, GPU): sem isso sobravam dezenas de processos órfãos a cada roteiro. */
const matarGrupo = (ch) => { try { process.kill(-ch.pid, "SIGKILL"); } catch { ch.kill("SIGKILL"); } };

export async function abrirChrome({ usuario, largura = 390, altura = 844 } = {}) {
  const port = 9500 + Math.floor(Math.random() * 400), prof = mkdtempSync(join(tmpdir(), "ciclo-e2e-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run", "--disable-gpu", `--window-size=${largura},${altura}`, "about:blank"], { stdio: "ignore", detached: true });
  let aberto = true; chrome.on("error", () => { aberto = false; });
  let tabs; for (let i = 0; i < 60 && !tabs && aberto; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
  if (!tabs) { matarGrupo(chrome); throw new Error("Chrome não abriu (defina CHROME=/caminho/do/chrome)"); }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let n = 0; const pend = new Map(); const consola = [];
  const txt = (a) => (a.value !== undefined ? String(a.value) : a.description ?? a.type);
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") consola.push({ nivel: "exception", texto: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text });
    else if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) consola.push({ nivel: m.params.type, texto: m.params.args.map(txt).join(" ") });
    else if (m.method === "Network.responseReceived" && m.params.response.status >= 400 && !/favicon/i.test(m.params.response.url)) consola.push({ nivel: "http", texto: `${m.params.response.status} ${new URL(m.params.response.url).pathname}` });
    else if (m.method === "Log.entryAdded" && m.params.entry.source === "network") { /* já contado em Network.responseReceived, com a rota */ }
    else if (m.method === "Log.entryAdded" && ["error", "warning"].includes(m.params.entry.level) && !/favicon/i.test(`${m.params.entry.url ?? ""}${m.params.entry.text}`)) consola.push({ nivel: m.params.entry.level, texto: m.params.entry.text });
  });
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  for (const d of ["Runtime", "Log", "Page", "Network"]) await send(`${d}.enable`);
  await send("Emulation.setDeviceMetricsOverride", { width: largura, height: altura, deviceScaleFactor: 1, mobile: largura < 700 });
  if (usuario) await send("Network.setExtraHTTPHeaders", { headers: { "x-dev-user": usuario } });
  const ev = async (expressao) => {
    const r = await send("Runtime.evaluate", { expression: expressao, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(`erro na página: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
    return r.result?.result?.value;
  };
  /** Espera `cond` (expressão JS que vira true) por até `ms`; devolve o último valor. */
  const esperar = async (cond, ms = 8000) => { const fim = Date.now() + ms; let v; while (Date.now() < fim) { try { v = await ev(cond); } catch { v = false; } if (v) return v; await sleep(150); } return v; };
  return {
    consola, ev, esperar, send,
    abrir: async (url) => { await send("Page.navigate", { url }); await sleep(300); },
    recarregar: async () => { await send("Page.reload", {}); await sleep(300); },
    /** Texto visível do app. */
    texto: () => ev("document.querySelector('#app')?.innerText ?? ''"),
    hash: () => ev("location.hash"),
    /** Clica o botão ou link pelo texto (ou aria-label) exato dentro de `raiz`. Falha se não existe ou está desabilitado. */
    clicar: async (rotulo, raiz = "#app") => {
      const r = await ev(`(() => { const L = ${JSON.stringify(rotulo)}; const els = [...document.querySelectorAll(${JSON.stringify(raiz)} + ' button, ' + ${JSON.stringify(raiz)} + ' a')];
        const el = els.find((e) => (e.getAttribute('aria-label') ?? '') === L) ?? els.find((e) => e.textContent.replace(/\\s+/g, ' ').trim() === L) ?? els.find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith(L));
        if (!el) return 'nao-achei'; if (el.disabled) return 'desabilitado'; el.click(); return 'ok'; })()`);
      if (r !== "ok") throw new Error(`botão "${rotulo}": ${r === "desabilitado" ? "está desabilitado" : "não encontrado"}`);
      await sleep(250);
    },
    fechar: async () => { try { ws.close(); } catch { /* já fechado */ } matarGrupo(chrome); await sleep(200); try { rmSync(prof, { recursive: true, force: true }); } catch { /* ok */ } },
  };
}
