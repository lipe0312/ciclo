// #70 Registro dos cenários, leitura dos argumentos e os comandos do wrangler. SÓ LOCAL: todo comando passa por `garantirLocal`
// (recusa --remote) e usa --persist-to numa pasta própria do cenário, nunca o D1 de produção nem o de `npm run dev`.
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import * as vazio from "./vazio.mjs";
import * as semi from "./semi.mjs";
import * as dono from "./dono.mjs";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const PORTA_PADRAO = 8791;
export const PORTA_CTRL = Number(process.env.CENARIO_CTRL_PORTA) || 8795;
export const CENARIOS = { vazio, semi, dono };
export const NOMES = Object.keys(CENARIOS);

export const dirCenario = (nome, root = ROOT) => join(root, ".wrangler", "cenarios", nome);

/** Recusa qualquer argumento que fale com a produção. Chamada em TODO comando antes de executar. */
export function garantirLocal(args) {
  if (args.some((a) => /^(--remote|-r|--env)(=|$)/.test(String(a)))) throw new Error("cenário é só local: nunca --remote nem --env");
  return args;
}

/** `npm run dev:cenario -- <nome> [--tela <rota>] [--reset] [--lista] [--com-login] [--porta N] [--sem-abrir]`. */
export function lerArgs(argv) {
  const o = { nome: null, tela: null, reset: false, lista: false, comLogin: false, semAbrir: false, porta: PORTA_PADRAO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lista") o.lista = true;
    else if (a === "--reset") o.reset = true;
    else if (a === "--com-login") o.comLogin = true;
    else if (a === "--sem-abrir") o.semAbrir = true;
    else if (a === "--tela" || a === "--porta") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} pede um valor`);
      if (a === "--tela") { o.tela = v.replace(/^#/, ""); if (!/^[a-z0-9][a-z0-9/_-]{0,60}$/.test(o.tela)) throw new Error("--tela inválida (ex.: hoje, conta, primeiros-passos/0)"); }
      else { o.porta = Number(v); if (!Number.isInteger(o.porta) || o.porta < 1024 || o.porta > 65535 || o.porta === PORTA_CTRL) throw new Error("--porta inválida"); }
    } else if (/^--(remote|env)/.test(a) || a === "-r") throw new Error("cenário é só local: nunca --remote nem --env");
    else if (a.startsWith("-")) throw new Error(`opção desconhecida: ${a}`);
    else if (o.nome) throw new Error("só um cenário por vez");
    else o.nome = a;
  }
  if (!o.lista) {
    if (!o.nome) throw new Error(`diga o cenário: ${NOMES.join(" | ")} (ou --lista)`);
    if (!NOMES.includes(o.nome)) throw new Error(`cenário desconhecido: ${o.nome} (${NOMES.join(" | ")})`);
  }
  return o;
}

export const textoLista = () => NOMES.map((n) => `${n}\n  ${CENARIOS[n].descricao}\n${CENARIOS[n].tem.map((t) => `    · ${t}`).join("\n")}`).join("\n\n");

/** Os comandos do wrangler (rodam em apps/worker). Sempre `--local` + `--persist-to` do cenário. */
export function comandos(nome, { porta = PORTA_PADRAO, comLogin = false, codigo = "", root = ROOT, ctrl = PORTA_CTRL } = {}) {
  const dir = dirCenario(nome, root), alvo = ["--local", "--persist-to", dir];
  const vars = comLogin
    ? ["--var", "DEV_NO_AUTH:0", "--var", "MCP_TOKEN:", "--var", `OWNER_SETUP_CODE:${codigo}`, "--var", "OWNER_EMAIL:dono@exemplo.com"]
    : ["--var", "DEV_NO_AUTH:1"];
  return {
    dir,
    migrar: garantirLocal(["wrangler", "d1", "migrations", "apply", "ciclo-db", ...alvo]),
    sql: (arquivo) => garantirLocal(["wrangler", "d1", "execute", "ciclo-db", ...alvo, "--json", "--yes", "--file", arquivo]),
    dev: garantirLocal(["wrangler", "dev", "--port", String(porta), "--persist-to", dir, ...vars, "--var", `CENARIO_NOME:${nome}`, "--var", `CENARIO_CTRL:${ctrl}`]),
  };
}

/** URL que abre o navegador: grava o cookie do usuário do cenário e cai na tela pedida. */
export const urlAbertura = (nome, tela, porta = PORTA_PADRAO) =>
  `http://localhost:${porta}/api/dev/user?u=${CENARIOS[nome].slug}${tela ? `&t=${encodeURIComponent(tela)}` : ""}`;
