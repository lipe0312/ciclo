// #64 "Claude" vira "Chat" em toda a UI. Varre as strings do front (sem comentários) atrás da palavra "Claude".
// Exceção: o passo a passo de conexão (Conta → Conectar meu Chat), onde o nome é necessário para a pessoa achar o app certo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = join(import.meta.dirname, "..");
const PERMITIDOS = new Set(["src/screens/conta/conectar.tsx"]);

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|html|webmanifest)$/.test(n) ? [p] : [];
  });
}
/** Tira comentários de bloco, de JSX e de linha (sem pegar o // de uma URL). */
export const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").split("\n").map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")).join("\n");

test("remove comentários sem cortar URL", () => {
  assert.equal(semComentarios('const a = "https://x.y"; // Claude'), 'const a = "https://x.y"; ');
  assert.equal(semComentarios("a /* Claude */ b"), "a  b");
});

test("nenhum \"Claude\" na UI fora do passo a passo de conexão", () => {
  const achados: string[] = [];
  const todos = [...arquivos(join(WEB, "src")), join(WEB, "index.html"), join(WEB, "public", "manifest.webmanifest")];
  for (const f of todos) {
    const rel = relative(WEB, f).split("\\").join("/");
    if (PERMITIDOS.has(rel)) continue;
    semComentarios(readFileSync(f, "utf8")).split("\n").forEach((l, i) => { if (/\bClaude\b/.test(l)) achados.push(`${rel}:${i + 1}: ${l.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(achados, [], `troque por "Chat":\n${achados.join("\n")}`);
});

test("o passo a passo mantém o crédito discreto", () => {
  assert.match(readFileSync(join(WEB, "src/screens/conta/conectar.tsx"), "utf8"), /Funciona com o Claude, da Anthropic/);
});
