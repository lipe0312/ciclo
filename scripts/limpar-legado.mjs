// #62 Limpeza do legado do Cloudflare Access: a conta antiga (role=user, SEM passkey, criada pelo login do Access, com dados
// herdados) é exportada para um arquivo local FORA do git e depois apagada pela MESMA rotina da tela (deleteAccount, db.ts).
// Depois disso o primeiro acesso (código + OWNER_EMAIL) cria o dono vazio.
//
// Uso (padrão = D1 LOCAL; só exporta, não apaga):
//   node scripts/limpar-legado.mjs                       # acha a conta legada, mostra e exporta
//   node scripts/limpar-legado.mjs --apagar              # exporta e, só então, apaga
//   node scripts/limpar-legado.mjs --id <uuid> --apagar  # escolhe a conta pelo id (quando houver mais de uma candidata)
//   --saida <arquivo.json>  (padrão: ~/ciclo-legado-<data>.json, fora do repositório)
//   --persist-to <pasta>    (D1 local de teste, passado ao wrangler)
//   --remote                PRODUÇÃO: só o dono roda. Exige --id; com --apagar, exporta, mostra id e contagens e só então pede confirmação.
// Nunca apaga o owner nem conta com passkey. Nada de dado pessoal na saída do terminal além do id e das contagens.
// Reexecutável: o apagamento é um lote de DELETE ... WHERE user_id = <id> (a linha do user sai por último). Se cair no meio,
// rodar de novo com o mesmo --id termina o serviço. O lote vai num arquivo só (`wrangler d1 execute --file`).
// R2: o wrangler não lista objetos (só get/put/delete); as chaves apagadas são as registradas na tabela media da conta.
// Objeto sem linha em media (não deveria existir) fica no bucket: confira no painel do R2 pelo prefixo u/<id>/.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { deleteAccount, exportAccount } from "../apps/worker/src/db.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Candidatas a legado: conta comum, sem passkey, com e-mail de verdade (o Access criava pelo e-mail). */
export const SQL_CANDIDATAS = `SELECT u.id, u.created_at FROM user u WHERE u.role = 'user' AND u.deleted_at IS NULL
  AND u.email NOT LIKE '%@passkey.invalid' AND NOT EXISTS (SELECT 1 FROM passkeys p WHERE p.user_id = u.id) ORDER BY u.created_at`;

/** Escolhe a conta legada (exatamente uma) ou explica por que não. `id` opcional força a escolha entre as candidatas. */
export async function escolherLegado(db, id) {
  const { results } = await db.prepare(SQL_CANDIDATAS).all();
  if (id) {
    if (!UUID.test(id)) return { erro: "id inválido (uuid)" };
    return results.some((r) => r.id === id) ? { uid: id } : { erro: "essa conta não é legada (owner, tem passkey ou não existe)" };
  }
  if (!results.length) return { erro: "nenhuma conta legada (role=user sem passkey)" };
  if (results.length > 1) return { erro: `${results.length} contas candidatas; escolha com --id`, candidatas: results.map((r) => r.id) };
  return { uid: results[0].id };
}

/** Exporta (sempre) e apaga (só com `apagar`). `env` = { DB, MEDIA? } no formato do Worker. Devolve o resumo. */
export async function limparLegado(env, { id, saida, apagar = false, gravar = writeFileSync } = {}) {
  const e = await escolherLegado(env.DB, id);
  if (e.erro) return { ok: false, ...e };
  const dados = await exportAccount(env, e.uid);
  gravar(saida, JSON.stringify(dados, null, 2), { mode: 0o600 });
  const contagem = Object.fromEntries(Object.entries(dados).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  if (!apagar) return { ok: true, uid: e.uid, saida, contagem, apagada: false };
  const apagada = await deleteAccount(env, e.uid);
  return { ok: apagada, uid: e.uid, saida, contagem, apagada };
}

// ---- adaptador: D1 e R2 pelo wrangler (sem dependência nova). Só valores validados entram no SQL. ----
const lit = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && UUID.test(v)) return `'${v}'`; // o único texto que o script passa é o id da conta
  throw new Error("valor fora do esperado para o SQL do script");
};
const render = (sql, args) => sql.replace(/\?(\d+)/g, (_m, n) => lit(args[Number(n) - 1]));

export function wranglerEnv({ remote = false, persistTo } = {}) {
  const alvo = remote ? ["--remote"] : ["--local", ...(persistTo ? ["--persist-to", persistTo] : [])];
  const run = (sql) => {
    // SQL num arquivo (--file): o lote inteiro vai de uma vez, sem depender de vários comandos num --command
    const dir = mkdtempSync(join(tmpdir(), "ciclo-legado-")), arq = join(dir, "lote.sql");
    try {
      writeFileSync(arq, sql + ";\n", { mode: 0o600 });
      const out = execFileSync("npx", ["wrangler", "d1", "execute", "ciclo-db", ...alvo, "--json", "--yes", "--file", arq], { cwd: join(ROOT, "apps/worker"), encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
      return JSON.parse(out.slice(out.indexOf("[")));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const stmt = (sql, args = []) => ({
    sql, args, bind: (...a) => stmt(sql, a), text: () => render(sql, args),
    all: async () => ({ results: run(render(sql, args))[0]?.results ?? [] }),
    first: async () => run(render(sql, args))[0]?.results?.[0] ?? null,
    run: async () => { const r = run(render(sql, args))[0]; return { meta: { changes: r?.meta?.changes ?? 0 } }; },
  });
  const DB = {
    prepare: (sql) => stmt(sql),
    // um comando só = uma transação no D1 (o deleteAccount depende disso)
    batch: async (sts) => run(sts.map((s) => s.text()).join(";\n")).map((r) => ({ results: r?.results ?? [] })),
  };
  // R2: as chaves vêm da tabela media (o wrangler não lista objetos); cada uma é apagada pelo wrangler.
  const MEDIA = {
    list: async () => ({ objects: [], truncated: false }),
    delete: async (keys) => {
      for (const k of [keys].flat()) execFileSync("npx", ["wrangler", "r2", "object", "delete", `ciclo-media/${k}`, ...(remote ? ["--remote"] : ["--local", ...(persistTo ? ["--persist-to", persistTo] : [])])], { cwd: join(ROOT, "apps/worker"), stdio: ["ignore", "ignore", "inherit"] });
    },
  };
  return { DB, MEDIA };
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--remote" || a === "--apagar") o[a.slice(2)] = true;
    else if (["--id", "--saida", "--persist-to"].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new Error(`opção desconhecida: ${a}`);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const saida = resolve(o.saida ?? join(homedir(), `ciclo-legado-${new Date().toISOString().slice(0, 10)}.json`));
  if (saida.startsWith(resolve(ROOT))) { console.error("✖ a exportação tem dados pessoais: grave FORA do repositório (--saida)"); process.exit(2); }
  if (existsSync(saida)) { console.error(`✖ ${saida} já existe; escolha outro --saida`); process.exit(2); }
  if (o.remote && !o.id) {
    // produção: nada de escolher sozinho; liste as candidatas e peça o --id
    const e = await escolherLegado(wranglerEnv({ remote: true }).DB);
    console.error(`✖ em --remote, informe --id. Candidatas: ${e.uid ?? (e.candidatas ?? []).join(", ") ?? "nenhuma"}${e.erro && !e.candidatas ? ` (${e.erro})` : ""}`);
    process.exit(2);
  }
  const env = wranglerEnv({ remote: !!o.remote, persistTo: o["persist-to"] });
  // 1º sempre exporta e mostra id e contagens; só depois (e só com --apagar) pergunta e apaga
  const r = await limparLegado(env, { id: o.id, saida, apagar: false });
  if (!r.ok) { console.error(`✖ ${r.erro}${r.candidatas ? `: ${r.candidatas.join(", ")}` : ""}`); process.exit(1); }
  console.log(`✔ exportada: ${r.saida}\n  conta ${r.uid} · ${Object.entries(r.contagem).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "sem linhas"}`);
  if (!o.apagar) { console.log("  (só exportou; confira o arquivo e rode de novo com --apagar)"); return; }
  if (o.remote) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const resp = await rl.question(`PRODUÇÃO: APAGAR a conta ${r.uid} (contagens acima)? Digite 'apagar legado' para confirmar: `);
    rl.close();
    if (resp.trim() !== "apagar legado") { console.error("cancelado"); process.exit(1); }
  }
  const apagada = await deleteAccount(env, r.uid);
  console.log(apagada ? "✔ conta legada apagada (deleteAccount). Agora faça o primeiro acesso com o código e o OWNER_EMAIL." : "✖ não apagou (a conta mudou?). Rodar de novo com o mesmo --id é seguro.");
  if (!apagada) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
