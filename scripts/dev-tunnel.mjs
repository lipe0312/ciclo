// #58 `npm run dev:tunnel`: o mesmo `npm run dev` (dados locais fictícios) atrás de um túnel https temporário do cloudflared
// (quick tunnel: sem conta, sem deploy). Serve para testar no celular e com o connector do claude.ai.
// O WebAuthn usa o host do túnel (rpId e origem); DEV_TUNNEL=1 só existe aqui. 1º acesso: código de uso único mostrado abaixo.
import { spawn, spawnSync, execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const INSTALL = "cloudflared não encontrado. Instale e rode de novo:\n  macOS:  brew install cloudflared\n  outros: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/";
export const tunnelUrl = (line) => /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(line)?.[0] ?? null;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (spawnSync("cloudflared", ["--version"], { stdio: "ignore" }).error) { console.error("✖ " + INSTALL); process.exit(1); }
  execSync("npm run build -w @ciclo/web", { stdio: "inherit" });
  const code = randomBytes(12).toString("hex"); // 24 caracteres, só desta execução
  // O código vai num arquivo temporário (modo 600, apagado ao sair), nunca na linha de comando (ps). DEV_NO_AUTH e MCP_TOKEN são
  // forçados fora: o túnel é público, só vale a conta por passkey/código (o guard de auth.ts também exige host localhost).
  const dir = mkdtempSync(join(tmpdir(), "ciclo-tunel-"));
  const envFile = join(dir, "tunel.env");
  writeFileSync(envFile, `OWNER_SETUP_CODE=${code}\n`, { mode: 0o600 });
  const limpa = () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } };
  process.on("exit", limpa);
  const kids = [
    spawn("npm", ["run", "watch", "-w", "@ciclo/web"], { stdio: "inherit" }),
    spawn("npm", ["run", "dev", "-w", "@ciclo/worker", "--", "--env-file", envFile, "--var", "DEV_TUNNEL:1", "--var", "DEV_NO_AUTH:0", "--var", "MCP_TOKEN:"], { stdio: "inherit" }),
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
