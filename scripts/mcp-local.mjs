// #81 `npm run mcp:local`: sobe o cenário `semi` (conta fictícia em uso) e imprime o comando pronto para ligar o Claude Code ao MCP
// local, sem túnel. Porta: CENARIO_PORTA (padrão 8811). Com CICLO_URL, usa um cenário já no ar (CENARIO = slug do cenário, padrão semi).
// A chave é uma chave manual da conta do cenário (dado fictício, só no seu computador). Ctrl+C derruba tudo. Só localhost.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CENARIOS } from "./cenarios/index.mjs";

const PORTA = Number(process.env.CENARIO_PORTA) || 8811;
const BASE = (process.env.CICLO_URL ?? `http://localhost:${PORTA}`).replace(/\/$/, "");
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error("✖ só roda em localhost"); process.exit(2); }
const CENARIO = process.env.CENARIO ?? "semi";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let filho = null;
  if (!process.env.CICLO_URL) {
    const ctrl = Number(process.env.CENARIO_CTRL_PORTA) || PORTA + 4;
    filho = spawn(process.execPath, [fileURLToPath(new URL("./dev-cenario.mjs", import.meta.url)), CENARIO, "--sem-abrir", "--porta", String(PORTA)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, CENARIO_CTRL_PORTA: String(ctrl) } });
    let log = ""; filho.stdout.on("data", (d) => { log += d; process.stdout.write(d); });
    const parar = () => { filho.kill("SIGTERM"); process.exit(0); };
    process.on("SIGINT", parar); process.on("SIGTERM", parar);
    const fim = Date.now() + 300_000; // o semi grava 2 semanas de treinos pela API
    while (!log.includes("Resetar:") && Date.now() < fim && filho.exitCode === null) await sleep(300);
    if (!log.includes("Resetar:")) { console.error("✖ o cenário não subiu"); parar(); }
  }
  const r = await fetch(`${BASE}/api/account/tokens`, { method: "POST", headers: { "x-dev-user": CENARIOS[CENARIO]?.slug ?? CENARIO, "Content-Type": "application/json" }, body: JSON.stringify({ label: "Claude Code local" }) });
  const t = await r.json().catch(() => null);
  if (!r.ok || !t?.token) { console.error(`✖ não consegui criar a chave local (HTTP ${r.status})`); filho?.kill("SIGTERM"); process.exit(1); }
  console.log(`
✔ MCP local: ${BASE}/mcp  ·  conta fictícia do cenário ${CENARIO}

Claude Code (cole no terminal):
  claude mcp add --transport http ciclo-local ${BASE}/mcp --header "Authorization: Bearer ${t.token}"

Depois, numa conversa: "Use o ciclo-local: qual é o meu treino de hoje?" ou "tomei café: 2 ovos e pão francês".
Para tirar: claude mcp remove ciclo-local

Claude Desktop / claude.ai: precisam de URL https pública. Use npm run dev:tunnel e cole a URL /mcp em Configurações → Conectores
(o login é o OAuth com passkey do túnel). Detalhes: docs/12-mcp.md.
${filho ? "\nCtrl+C derruba o servidor local." : ""}`);
}

main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
