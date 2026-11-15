// #70 `npm run dev:cenario -- <vazio|semi|dono> [--tela <rota>] [--reset] [--lista] [--com-login] [--porta N] [--sem-abrir]`
// Sobe o app local (wrangler dev) com um D1 LOCAL próprio do cenário (.wrangler/cenarios/<nome>), zerado, com as migrations e o seed
// fictício de scripts/cenarios/<nome>.mjs. No localhost o app já abre logado na conta do cenário (usuário de dev, como o DEV_NO_AUTH)
// e direto na --tela. `--reset` (de outro terminal) ou o botão "↺ cenário" do app voltam o banco ao início sem derrubar o servidor.
// NUNCA toca a produção: só --local (garantirLocal recusa --remote) e o D1 deste cenário. Documento: docs/11-testar-antes-de-subir.md
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CENARIOS, PORTA_CTRL, ROOT, comandos, garantirLocal, lerArgs, textoLista, urlAbertura } from "./cenarios/index.mjs";
import { hojeSP, limparTudo, somarDias } from "./cenarios/lib.mjs";

const WORKER = join(ROOT, "apps/worker");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ctx de verdade: SQL pelo wrangler (arquivo temporário) e API pelo fetch com o usuário de dev do cenário. */
export function ctxReal(cmd, base, slug) {
  const agora = Date.now(), hoje = hojeSP(agora);
  const sql = (texto) => {
    const dir = mkdtempSync(join(tmpdir(), "ciclo-cenario-")), arq = join(dir, "q.sql");
    try {
      writeFileSync(arq, texto + ";\n", { mode: 0o600 });
      const out = execFileSync("npx", cmd.sql(arq), { cwd: WORKER, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
      return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? [];
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const api = async (method, path, body, { status } = {}) => {
    const h = { "x-dev-user": slug };
    if (body !== undefined) h["Content-Type"] = "application/json";
    let r, txt;
    for (let t = 0; t < 4; t++) { // 429 (limite de escritas por minuto): espera o que o servidor pede e repete
      r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      txt = await r.text();
      if (r.status !== 429) break;
      await sleep((Number(r.headers.get("Retry-After")) || 5) * 1000);
    }
    if (status ? r.status !== status : r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${txt.slice(0, 200)}`);
    try { return JSON.parse(txt); } catch { return null; }
  };
  return { sql: async (t) => sql(t), api, agora, hoje, dia: (n) => somarDias(hoje, n) };
}

const wrangler = (args) => { garantirLocal(args); return spawn("npx", args, { cwd: WORKER, stdio: "inherit" }); };
const viva = async (base) => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } };

async function main() {
  let o;
  try { o = lerArgs(process.argv.slice(2)); } catch (e) { console.error(`✖ ${e.message}`); process.exit(2); }
  if (o.lista) { console.log(textoLista()); return; }
  const base = `http://localhost:${o.porta}`, cen = CENARIOS[o.nome], codigo = o.comLogin ? randomBytes(12).toString("hex") : "";
  // porta de controle: CENARIO_CTRL_PORTA ou --porta + 4 (dois cenários abertos não colidem); o filho herda pelo env
  const ctrlPorta = process.env.CENARIO_CTRL_PORTA ? PORTA_CTRL : o.porta + 4;
  process.env.CENARIO_CTRL_PORTA = String(ctrlPorta);
  const cmd = comandos(o.nome, { porta: o.porta, comLogin: o.comLogin, codigo, ctrl: ctrlPorta });

  if (o.reset) { // servidor deste cenário no ar: pede o reset a ele (sem derrubar nada)
    try {
      const r = await fetch(`http://127.0.0.1:${ctrlPorta}/reset`, { method: "POST", headers: { "x-ciclo-cenario": "reset" } });
      if (r.ok) { console.log(`✔ cenário ${o.nome} voltou ao início`); return; }
    } catch { /* ninguém no ar: sobe do zero */ }
    console.log("ℹ nenhum cenário no ar: subindo do zero.");
  }
  if (await viva(base)) { console.error(`✖ já há um servidor em ${base} (npm run dev?). Pare-o ou use --porta.`); process.exit(1); }

  if (!existsSync(join(ROOT, "apps/web/dist/index.html"))) execFileSync("npm", ["run", "build", "-w", "@ciclo/web"], { cwd: ROOT, stdio: "inherit" });
  rmSync(cmd.dir, { recursive: true, force: true }); mkdirSync(cmd.dir, { recursive: true });
  console.log(`→ banco local do cenário ${o.nome}: ${cmd.dir}`);
  const mig = wrangler(cmd.migrar);
  if (await new Promise((r) => mig.on("exit", r))) { console.error("✖ migrations falharam"); process.exit(1); }

  const kids = [spawn("npm", ["run", "watch", "-w", "@ciclo/web"], { cwd: ROOT, stdio: "inherit" }), wrangler(cmd.dev)];
  let ctrl;
  const parar = () => { ctrl?.close(); for (const k of kids) k.kill("SIGTERM"); process.exit(0); };
  process.on("SIGINT", parar); process.on("SIGTERM", parar);
  for (const k of kids) k.on("exit", (c) => { if (c) parar(); });
  for (let i = 0; i < 120 && !(await viva(base)); i++) await sleep(500);
  if (!(await viva(base))) { console.error("✖ o servidor não subiu"); parar(); }

  const ctx = () => ctxReal(cmd, base, cen.slug);
  if (!o.comLogin) {
    await cen.seed(ctx());
    // controle do reset (só 127.0.0.1; o cabeçalho próprio impede que uma página qualquer dispare)
    let ocupado = false;
    ctrl = createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/reset" || req.headers["x-ciclo-cenario"] !== "reset") { res.writeHead(404).end(); return; }
      if (ocupado) { res.writeHead(409).end("reset em andamento"); return; }
      ocupado = true;
      try { await limparTudo(ctx()); await cen.seed(ctx()); res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}'); console.log(`↺ cenário ${o.nome} voltou ao início`); }
      catch (e) { console.error(`✖ reset: ${e.message}`); res.writeHead(500).end("falhou"); }
      finally { ocupado = false; }
    }).listen(ctrlPorta, "127.0.0.1");
  }
  const alvo = o.comLogin ? `${base}/#${o.tela ?? "entrar"}` : urlAbertura(o.nome, o.tela, o.porta);
  console.log(`\n✔ ${base}  ·  cenário ${o.nome}${o.comLogin ? " (com login: banco vazio, 1º acesso)" : ` · conta ${cen.slug}`}`);
  if (o.comLogin) console.log(`  Código do 1º acesso: ${codigo}  ·  e-mail do dono: dono@exemplo.com\n  (Chrome → DevTools → WebAuthn → autenticador virtual)`);
  else console.log(`  Resetar: botão ↺ cenário no app, ou npm run dev:cenario -- ${o.nome} --reset`);
  if (!o.semAbrir) {
    const abre = process.platform === "darwin" ? ["open", [alvo]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", alvo]] : ["xdg-open", [alvo]];
    spawn(abre[0], abre[1], { stdio: "ignore", detached: true }).on("error", () => console.log(`  Abra: ${alvo}`)).unref();
  } else console.log(`  Abra: ${alvo}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
