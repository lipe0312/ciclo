// #88 Varredura de segredo no repositório (sem dependência): nenhum arquivo versionado (ou novo, ainda não ignorado)
// pode ter algo com cara de chave de API real (sk-…, sk-ant-…, AIza…). Roda no `npm test` (apps/worker/test/chaves-88)
// e sozinho: `node scripts/segredos.mjs`. Os testes montam as chaves fictícias por concatenação; o canário
// (`…CANARIO…`) é a única exceção aceita.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PADROES = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,                // Anthropic
  /sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/g, // OpenAI (projeto, conta de serviço, admin)
  /sk-[A-Za-z0-9]{32,}/g,                      // OpenAI legado
  /AIza[0-9A-Za-z_-]{35}/g,                    // Google (Gemini)
];
const BINARIO = /\.(png|jpe?g|webp|gif|ico|mp4|mov|webm|pdf|woff2?|ttf|zip|gz|sqlite|db)$/i;
const PERMITIDO = (m) => m.includes("CANARIO");

/** Achados `arquivo:linha: começo…` (nunca o segredo inteiro, para não espalhá-lo no log). */
const lerArquivo = (f) => (statSync(f).size > 2_000_000 ? "" : readFileSync(f, "utf8"));
export function procurarSegredos(arquivos, ler = lerArquivo) {
  const achados = [];
  for (const f of arquivos) {
    if (BINARIO.test(f) || f.endsWith("package-lock.json")) continue;
    let txt;
    try { txt = ler(f); } catch { continue; }
    txt.split("\n").forEach((l, i) => {
      for (const re of PADROES) for (const m of l.matchAll(re)) if (!PERMITIDO(m[0])) achados.push(`${f}:${i + 1}: ${m[0].slice(0, 7)}…`);
    });
  }
  return achados;
}

export function arquivosDoRepo(cwd = ROOT) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd, encoding: "utf8" }).split("\0").filter(Boolean).map((f) => `${cwd}${f}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = procurarSegredos(arquivosDoRepo());
  if (a.length) { console.error("✖ Possível chave de API no repositório:\n  - " + a.join("\n  - ")); process.exit(1); }
  console.log("✔ nenhum segredo com cara de chave de API no repositório");
}
