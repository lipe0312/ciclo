// `npm run dev`: builda o front (Vite), deixa o build em modo watch e sobe o Worker local (wrangler dev :8791),
// que serve apps/web/dist + /api + /mcp na mesma origem (CSP e _headers iguais aos de produção).
import { spawn, execSync } from "node:child_process";
execSync("npm run build -w @ciclo/web", { stdio: "inherit" });
const run = (args) => spawn("npm", args, { stdio: "inherit" });
const kids = [run(["run", "watch", "-w", "@ciclo/web"]), run(["run", "dev", "-w", "@ciclo/worker"])];
const stop = () => { for (const k of kids) k.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
for (const k of kids) k.on("exit", (c) => { if (c) stop(); });
console.log("\n✔ http://localhost:8791  (demo: http://localhost:8791/?demo)\n");
