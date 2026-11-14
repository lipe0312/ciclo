// #66 E2E do leitor de PDF no BUILD DE PRODUÇÃO (CSP, MIME do .mjs e service worker iguais aos de produção).
// Uso: `npm run build` + `npm run dev` (ou wrangler dev) rodando → `npm run e2e:pdf` (outra porta: CICLO_URL=http://localhost:8866).
// Abre o Chrome headless (sem dependência: protocolo CDP pelo WebSocket do Node 22), gera um PDF de exame FICTÍCIO,
// escolhe o arquivo na tela Diário → Exames e confere o texto extraído. Roda duas vezes: Chrome normal e "como o
// Safari" (sem ReadableStream[Symbol.asyncIterator], a API que faltava no iPhone e quebrava a leitura).
// Só localhost (usa o usuário de dev). CHROME=/caminho/do/chrome para outro navegador Chromium.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.CICLO_URL ?? "http://localhost:8791").replace(/\/$/, "");
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error("✖ só roda em localhost"); process.exit(2); }
const CHROME = process.env.CHROME ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");
const USER = `e2epdf-${Math.random().toString(16).slice(2, 8)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** PDF mínimo com camada de texto (laudo fictício). */
function pdfFicticio(arquivo) {
  const linhas = ["LAUDO FICTICIO - LABORATORIO EXEMPLO", "Vitamina D: 32 ng/mL (ref. 30 a 100)", "Ferritina: 85 ng/mL (ref. 30 a 400)"];
  const content = "BT /F1 12 Tf 50 750 Td 16 TL " + linhas.map((l) => `(${l}) Tj T*`).join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n"; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  writeFileSync(arquivo, out);
}

async function rodada(nome, pdf, antes) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const prof = mkdtempSync(join(tmpdir(), "ciclo-e2e-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run", "--window-size=390,844", "about:blank"], { stdio: "ignore" });
  try {
    let tabs; for (let i = 0; i < 50 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
    if (!tabs) throw new Error("Chrome não abriu (defina CHROME=…)");
    const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    let n = 0; const pend = new Map(); const erros = [];
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      else if (m.method === "Runtime.exceptionThrown") erros.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      else if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && /Content Security Policy|MIME|pdf/i.test(m.params.entry.text)) erros.push(m.params.entry.text);
    });
    const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    for (const d of ["Runtime", "Log", "Page", "DOM", "Network"]) await send(`${d}.enable`);
    await send("Network.setExtraHTTPHeaders", { headers: { "x-dev-user": USER } });
    if (antes) await send("Page.addScriptToEvaluateOnNewDocument", { source: antes });
    await send("Page.navigate", { url: `${BASE}/#diario/exames` });
    let node = 0;
    for (let i = 0; i < 40 && !node; i++) {
      await sleep(250);
      const doc = await send("DOM.getDocument", { depth: -1 });
      node = (await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "input[type=file]" })).result?.nodeId ?? 0;
    }
    if (!node) throw new Error("tela de exames sem o campo de PDF");
    await send("DOM.setFileInputFiles", { nodeId: node, files: [pdf] });
    let texto = "";
    for (let i = 0; i < 60 && !texto.includes("Ferritina"); i++) {
      await sleep(250);
      texto = (await send("Runtime.evaluate", { expression: "document.querySelector('#exText')?.value ?? ''", returnByValue: true })).result.result.value;
    }
    ws.close();
    if (!texto.includes("Vitamina D: 32") || !texto.includes("Ferritina: 85")) throw new Error(`texto não extraído${erros.length ? ` · ${erros.slice(0, 3).join(" | ")}` : ""}`);
    console.log(`✔ ${nome}: PDF fictício lido no build de produção`);
  } finally { chrome.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true }); }
}

const h = await fetch(`${BASE}/api/health`).catch(() => null);
if (!h?.ok) { console.error(`✖ ${BASE} não respondeu. Rode antes: npm run build && npm run dev`); process.exit(2); }
// conta de dev nova e fictícia, com os Primeiros passos concluídos (senão a tela cai no onboarding)
await fetch(`${BASE}/api/account`, { method: "PATCH", headers: { "x-dev-user": USER, "Content-Type": "application/json" }, body: JSON.stringify({ onboarding: "concluido" }) });
const dir = mkdtempSync(join(tmpdir(), "ciclo-pdf-"));
const pdf = join(dir, "exame-ficticio.pdf");
pdfFicticio(pdf);
let falhas = 0;
for (const [nome, antes] of [["Chrome", null], ["como o Safari (sem async iterator em ReadableStream)", "delete ReadableStream.prototype[Symbol.asyncIterator]; delete ReadableStream.prototype.values;"]]) {
  try { await rodada(nome, pdf, antes); } catch (e) { falhas++; console.log(`✖ ${nome}: ${e.message}`); }
}
rmSync(dir, { recursive: true, force: true });
process.exit(falhas ? 1 : 0);
