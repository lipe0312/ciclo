// Prepara o ambiente local: .dev.vars com token forte, build do core, migrations no D1 local.
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
const vars = "apps/worker/.dev.vars";
if (!existsSync(vars)) {
  const token = randomBytes(32).toString("hex");
  writeFileSync(vars, `DEV_NO_AUTH=1\nMCP_TOKEN=${token}\n`, { mode: 0o600 });
  console.log(`✔ ${vars} criado. MCP_TOKEN local: ${token}`);
}
if (!existsSync(".mcp.json")) console.log("ℹ Para o Claude Code: cp .mcp.json.example .mcp.json e cole o MCP_TOKEN.");
execSync("npm run build:core", { stdio: "inherit" });
execSync("npm run db:migrate:local -w @ciclo/worker", { stdio: "inherit" });
console.log("✔ Pronto. Rode: npm run dev  →  http://localhost:8791");
