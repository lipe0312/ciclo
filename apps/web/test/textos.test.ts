// #64/#133 Nenhuma marca de IA solta na UI. A marca só aparece no seletor de IA, no guia da IA, no cadastro da chave e
// quando é a IA escolhida pela pessoa: esses nomes vêm do core (PROVEDORES_IA_APP, NOME_PROVEDOR), nunca escritos na tela.
// Allowlist (arquivo → por quê). Varre as strings do front (sem comentários), o index.html e o manifest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = join(import.meta.dirname, "..");
const PERMITIDOS = new Map([
  ["src/lib/sua-ia/escolha.tsx", "seletor de IA (exemplos de Outras)"],
  ["src/screens/conta/chaves.tsx", "cadastro da chave (provedor da chave de reserva do dono)"],
  ["src/screens/legal/index.tsx", "privacidade: quem recebe os dados"],
]);
export const MARCA = /\b(Claude|ChatGPT|Gemini|Anthropic|OpenAI|DeepSeek|OpenRouter|Grok|Kimi|Qwen|Mistral|Perplexity|Copilot)\b|claude\.ai|chatgpt\.com/;

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

test("marca: o detector pega nome e domínio, mas não identificador de código (ClaudeCard, loadClaude, filledBy claude)", () => {
  for (const t of ["Conectar meu Claude", "abra o ChatGPT", "chave do Gemini", "claude.ai/new", "use o DeepSeek"]) assert.match(t, MARCA, t);
  for (const t of ["ClaudeCard()", "loadClaude()", "filledBy === \"claude\"", "useClaude", "porClaude"]) assert.doesNotMatch(t, MARCA, t);
});

test("nenhuma marca de IA solta na UI fora da allowlist (seletor, guia, cadastro da chave, privacidade)", () => {
  const achados: string[] = [];
  const todos = [...arquivos(join(WEB, "src")), join(WEB, "index.html"), join(WEB, "public", "manifest.webmanifest")];
  for (const f of todos) {
    const rel = relative(WEB, f).split("\\").join("/");
    if (PERMITIDOS.has(rel)) continue;
    semComentarios(readFileSync(f, "utf8")).split("\n").forEach((l, i) => { if (MARCA.test(l)) achados.push(`${rel}:${i + 1}: ${l.trim().slice(0, 120)}`); });
  }
  assert.deepEqual(achados, [], `use "Sua IA", "Chat" ou o nome vindo do core (PROVEDORES_IA_APP):\n${achados.join("\n")}`);
});

// #140 Nome de modelo (Haiku/Sonnet/Opus) e selo de tier não ficam soltos na tela Chat, na caixa, no Hoje nem na comida: só no
// seletor de modelo por pedido (Perfil → Como o Chat trabalha com você), no guia e nas chaves (os IDs vêm do servidor/core).
const MODELO = /\b(Haiku|Sonnet|Opus)\b/;
const MODELO_PERMITIDO = new Map([["src/screens/perfil/index.tsx", "seletor de modelo por tipo de pedido (Como o Chat trabalha com você)"]]);
test("modelo: o detector pega o nome, mas não o id de dado nem o codec (haiku, audio/webm;codecs=opus)", () => {
  for (const t of ["Na fila · Haiku", "o Chat (Haiku) confere", "Sonnet", "usa o Opus"]) assert.match(t, MODELO, t);
  for (const t of ["tier: \"haiku\"", "audio/webm;codecs=opus", "AvisoPush()"]) assert.doesNotMatch(t, MODELO, t);
});
test("nenhum nome de modelo nem selo de tier solto na UI (Chat, caixa, Hoje, comida) fora do seletor", () => {
  const achados: string[] = [];
  for (const f of arquivos(join(WEB, "src"))) {
    const rel = relative(WEB, f).split("\\").join("/");
    if (MODELO_PERMITIDO.has(rel)) continue;
    semComentarios(readFileSync(f, "utf8")).split("\n").forEach((l, i) => {
      if (MODELO.test(l) || /TIER_INFO/.test(l) || /class[=:]\s*[{"'`][^}"'`]*\btier\b/.test(l)) achados.push(`${rel}:${i + 1}: ${l.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(achados, [], `fale "Chat" ou "sua IA"; o modelo só no seletor:\n${achados.join("\n")}`);
  for (const f of MODELO_PERMITIDO.keys()) assert.ok(statSync(join(WEB, f)).isFile(), f);
});

test("a allowlist só tem arquivos que existem (não vira passe livre esquecido)", () => {
  for (const f of PERMITIDOS.keys()) assert.ok(statSync(join(WEB, f)).isFile(), f);
});

// #63 O onboarding/questionário se chama "Perfil de treino" em toda a interface (a rota #primeiros-passos continua igual).
test("nenhum \"Primeiros passos\", \"checkup\" ou \"questionário\" na UI", () => {
  const achados: string[] = [];
  for (const f of [...arquivos(join(WEB, "src")), join(WEB, "index.html")]) {
    const rel = relative(WEB, f).split("\\").join("/");
    semComentarios(readFileSync(f, "utf8")).split("\n").forEach((l, i) => {
      if (/Primeiros passos|[Qq]uestion[aá]rio|(^|[>"'`\s])(o|do|Fazer|Refazer|fazer|refazer) checkup\b|checkup inicial/i.test(l)) achados.push(`${rel}:${i + 1}: ${l.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(achados, [], `troque por "Perfil de treino":\n${achados.join("\n")}`);
});
