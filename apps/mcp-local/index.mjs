#!/usr/bin/env node
// Ponte MCP stdio ⇄ HTTP para o Claude Code (sem dependências).
// - Repassa tudo para o MCP remoto do Ciclo (o mesmo do connector do claude.ai).
// - Acrescenta ferramentas que só fazem sentido no Mac: anexar vídeo/foto do aparelho a partir de um caminho local.
// Config: CICLO_URL (ex.: http://localhost:8791 ou https://ciclo.<conta>.workers.dev) e CICLO_TOKEN (= MCP_TOKEN).
import { createInterface } from "node:readline";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { homedir } from "node:os";

const BASE = (process.env.CICLO_URL ?? "http://localhost:8791").replace(/\/$/, "");
const TOKEN = process.env.CICLO_TOKEN ?? "";
const MAX = 20 * 1024 * 1024;
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };
// Só lê arquivos dentro destas pastas (evita o modelo ler qualquer coisa do disco).
const ALLOWED_DIRS = (process.env.CICLO_MEDIA_DIRS ?? `${homedir()}/Movies,${homedir()}/Pictures,${homedir()}/Downloads,${homedir()}/Desktop`).split(",").map((d) => resolve(d.trim()));

const LOCAL_TOOLS = [{
  name: "ciclo_anexar_midia",
  description: "Anexa um vídeo (10–15 s) ou foto do SEU aparelho a um exercício, a partir de um arquivo no Mac (Filmes, Imagens, Downloads ou Mesa). Use na montagem do treino quando ciclo_estado/ciclo_planejar_dia mostrar exercício sem mídia.",
  inputSchema: { type: "object", additionalProperties: false, required: ["path", "exerciseId"], properties: {
    path: { type: "string", description: "caminho do arquivo .mp4/.mov/.webm/.jpg/.png/.webp" },
    exerciseId: { type: "string" }, equipmentId: { type: "string" }, gymId: { type: "string" },
    note: { type: "string", description: "regulagem: pino, banco, pegada (≤ 300 caracteres)" },
  } },
  annotations: { readOnlyHint: false, destructiveHint: false },
}];

async function anexar(a) {
  const p = resolve(String(a.path ?? "").replace(/^~(?=\/)/, homedir()));
  if (!ALLOWED_DIRS.some((d) => p.startsWith(d + "/"))) throw new Error(`Arquivo fora das pastas permitidas (${ALLOWED_DIRS.join(", ")}).`);
  const type = MIME[extname(p).toLowerCase()];
  if (!type) throw new Error("Tipo não suportado.");
  const st = await stat(p);
  if (!st.isFile() || st.size > MAX) throw new Error("Arquivo grande demais (máx. 20 MB: grave 10–15 s em 720p).");
  const q = new URLSearchParams(Object.entries({ exerciseId: a.exerciseId, equipmentId: a.equipmentId, gymId: a.gymId, note: a.note }).filter(([, v]) => v));
  const r = await fetch(`${BASE}/mcp/media?${q}`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": type, "Content-Length": String(st.size) }, body: await readFile(p) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

async function forward(msg) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(msg) });
  if (r.status === 202) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok && !j?.jsonrpc) return { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32000, message: j?.error ?? `HTTP ${r.status}` } };
  return j;
}

async function handle(msg) {
  if (msg.method === "tools/call" && LOCAL_TOOLS.some((t) => t.name === msg.params?.name)) {
    try { return { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify(await anexar(msg.params.arguments ?? {})) }] } }; }
    catch (e) { return { jsonrpc: "2.0", id: msg.id, result: { isError: true, content: [{ type: "text", text: e.message }] } }; }
  }
  const res = await forward(msg);
  if (msg.method === "tools/list" && res?.result?.tools) res.result.tools.push(...LOCAL_TOOLS);
  return res;
}

if (!TOKEN) process.stderr.write("[ciclo] CICLO_TOKEN não definido: o servidor vai recusar.\n");
const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  try {
    const out = await handle(msg);
    if (out && msg.id !== undefined) process.stdout.write(JSON.stringify(out) + "\n");
  } catch (e) {
    if (msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `Ciclo indisponível em ${BASE}: ${e.message}` } }) + "\n");
  }
});
