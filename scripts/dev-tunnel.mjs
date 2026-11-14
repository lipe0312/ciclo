// #58 `npm run dev:tunnel`: o mesmo `npm run dev` (dados locais fictícios) atrás de um túnel https temporário do cloudflared
// (quick tunnel: sem conta, sem deploy). Serve para testar no celular e com o connector do claude.ai.
// O WebAuthn usa o host do túnel (rpId e origem); DEV_TUNNEL=1 só existe aqui. 1º acesso: código de uso único mostrado abaixo.
import { spawn, spawnSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const INSTALL = "cloudflared não encontrado. Instale e rode de novo:\n  macOS:  brew install cloudflared\n  outros: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/";
export const tunnelUrl = (line) => /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(line)?.[0] ?? null;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (spawnSync("cloudflared", ["--version"], { stdio: "ignore" }).error) { console.error("✖ " + INSTALL); process.exit(1); }
  execSync("npm run build -w @ciclo/web", { stdio: "inherit" });
  const code = randomBytes(12).toString("hex"); // 24 caracteres, só desta execução
  const kids = [
    spawn("npm", ["run", "watch", "-w", "@ciclo/web"], { stdio: "inherit" }),
    spawn("npm", ["run", "dev", "-w", "@ciclo/worker", "--", "--var", "DEV_TUNNEL:1", "--var", `OWNER_SETUP_CODE:${code}`], { stdio: "inherit" }),
  ];
  const t = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", "http://localhost:8791"], { stdio: ["ignore", "pipe", "pipe"] });
  kids.push(t);
  let mostrou = false;
  const onData = (d) => { const u = !mostrou && tunnelUrl(String(d)); if (u) { mostrou = true; console.log(`\n✔ Túnel: ${u}\n  Código do 1º acesso (conta nova nesta URL): ${code}\n  Connector do claude.ai: ${u}/mcp\n`); } };
  t.stdout.on("data", onData); t.stderr.on("data", onData);
  const stop = () => { for (const k of kids) k.kill("SIGTERM"); process.exit(0); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  for (const k of kids) k.on("exit", (c) => { if (c) stop(); });
}
