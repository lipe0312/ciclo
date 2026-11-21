// #81 `npm run e2e:mcp`: cliente MCP de teste em Node (fetch, JSON-RPC; sem dependência nova) contra o Worker local de verdade
// (wrangler dev) num cenário próprio. Sobe `dev:cenario vazio` na CENARIO_PORTA (padrão 8801) e o derruba no fim; com CICLO_URL usa
// um cenário já no ar (CENARIO = nome dele, padrão vazio). Contas fictícias e-2-e. Falha no primeiro passo errado e diz qual. Só localhost.
// Cobre: lista e orçamento, comida simular → confirmar, idempotência, isolamento entre contas, token vencido/de outra conta,
// escopo ler bloqueando escrita, corrigir/desfazer com prévia, editar os vagos (#87) e o treino (semana, série, trocar).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MCP_ORCAMENTO_BYTES, MCP_ORCAMENTO_INSTRUCOES, MCP_ORCAMENTO_LISTA } from "@ciclo/core";
import { comandos } from "./cenarios/index.mjs";
import { ctxReal } from "./dev-cenario.mjs";

const PORTA = Number(process.env.CENARIO_PORTA) || 8801;
const BASE = (process.env.CICLO_URL ?? `http://localhost:${PORTA}`).replace(/\/$/, "");
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error("✖ só roda em localhost"); process.exit(2); }
const CTRL = Number(process.env.CENARIO_CTRL_PORTA) || Number(new URL(BASE).port || 80) + 4;
const CENARIO = process.env.CICLO_URL ? (process.env.CENARIO ?? "vazio") : "vazio";
const A = "e2e-mcp-a", B = "e2e-mcp-b";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let n = 0;
async function passo(titulo, fn) {
  n++;
  try { await fn(); } catch (e) { console.log(`✖ ${n}. ${titulo}\n    ${e.message}`); throw e; }
  console.log(`✔ ${n}. ${titulo}`);
}
const ok = (c, msg) => { if (!c) throw new Error(msg); };

async function api(slug, method, path, body) {
  const h = { "x-dev-user": slug };
  if (body !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const txt = await r.text();
  let data = null; try { data = JSON.parse(txt); } catch { /* vazio */ }
  return { status: r.status, data, txt };
}
let rid = 0;
async function rpc(token, method, params = {}) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) });
  const txt = await r.text();
  let data = null; try { data = JSON.parse(txt); } catch { /* vazio */ }
  return { status: r.status, data, txt, headers: r.headers };
}
/** tools/call: devolve o JSON (ou { erro }) e confere o orçamento de tamanho. */
async function tool(token, name, args = {}) {
  const r = await rpc(token, "tools/call", { name, arguments: args });
  ok(r.status === 200, `${name}: HTTP ${r.status} ${r.txt.slice(0, 200)}`);
  const txt = r.data.result.content[0].text;
  ok(Buffer.byteLength(txt) <= MCP_ORCAMENTO_BYTES, `${name}: ${Buffer.byteLength(txt)} bytes > orçamento ${MCP_ORCAMENTO_BYTES}`);
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(Date.now());
const comida = async (slug) => (await api(slug, "GET", `/api/food?from=${hoje()}&to=${hoje()}`)).data.entries;

async function subir() {
  if (process.env.CICLO_URL) return () => {};
  const filho = spawn(process.execPath, [fileURLToPath(new URL("./dev-cenario.mjs", import.meta.url)), CENARIO, "--sem-abrir", "--porta", String(PORTA)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CENARIO_CTRL_PORTA: String(CTRL) } });
  let log = ""; filho.stdout.on("data", (d) => { log += d; }); filho.stderr.on("data", (d) => { log += d; });
  const parar = async () => {
    filho.kill("SIGTERM");
    for (let i = 0; i < 50; i++) { if (!(await fetch(`${BASE}/api/health`).then(() => true, () => false))) return; await sleep(200); }
    filho.kill("SIGKILL");
  };
  const fim = Date.now() + 180_000;
  while (!log.includes("Resetar:") && Date.now() < fim && filho.exitCode === null) await sleep(300);
  if (!log.includes("Resetar:")) { await parar(); throw new Error(`o cenário não subiu:\n${log.split("\n").slice(-15).join("\n")}`); }
  return parar;
}

async function conta(slug, escopos) {
  await api(slug, "DELETE", "/api/account", { confirm: "APAGAR" }); // volta ao zero (dev local)
  const p = await api(slug, "PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } });
  ok(p.status === 200, `perfil: ${p.txt}`);
  ok((await api(slug, "PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: ["halteres", "banco", "polia", "barra"] })).status === 200, "academia");
  const t = {};
  for (const e of escopos) {
    const r = await api(slug, "POST", "/api/account/tokens", { label: `e2e ${e}`, escopo: e });
    ok(r.status === 201, `token: ${r.txt}`);
    t[e] = r.data.token;
  }
  return t;
}

async function main() {
  const parar = await subir();
  try {
    let ta, tb;
    await passo("contas fictícias A e B com perfil, academia e chaves (A: ler e ler+escrever)", async () => {
      ta = await conta(A, ["ler escrever", "ler"]); tb = await conta(B, ["ler escrever"]);
    });
    await passo("initialize: versão do contrato e instructions neutras dentro do orçamento", async () => {
      const r = await rpc(ta["ler escrever"], "initialize", { protocolVersion: "2025-06-18" });
      ok(/^\d+\.\d+\.\d+$/.test(r.data.result.serverInfo.version), "version");
      ok(Buffer.byteLength(r.data.result.instructions) <= MCP_ORCAMENTO_INSTRUCOES, "instructions acima do orçamento");
      ok(!/\bClaude\b/.test(r.data.result.instructions), "instructions citam um modelo");
    });
    await passo("tools/list: ferramentas novas, aliases fora da lista, lista dentro do orçamento", async () => {
      const r = await rpc(ta["ler escrever"], "tools/list");
      const nomes = r.data.result.tools.map((t) => t.name);
      for (const x of ["ciclo_comida_registrar", "ciclo_comida_corrigir", "ciclo_comida_editar", "ciclo_comida_vagos", "ciclo_comida_desfazer", "ciclo_semana_gerar", "ciclo_semana_ver", "ciclo_treino_registrar", "ciclo_treino_trocar", "ciclo_perfil_atualizar", "ciclo_treino_atual_salvar", "ciclo_preferencias", "ciclo_historico"]) ok(nomes.includes(x), `falta ${x}`);
      ok(!nomes.includes("ciclo_salvar_perfil"), "alias na lista");
      ok(Buffer.byteLength(r.txt) <= MCP_ORCAMENTO_LISTA, `tools/list ${Buffer.byteLength(r.txt)} bytes`);
    });
    await passo("entrada inválida → erro claro com o campo", async () => {
      const r = await tool(ta["ler escrever"], "ciclo_estado", { date: "16/11/2026" });
      ok(/date: formato inválido/.test(r.erro ?? ""), JSON.stringify(r));
    });
    let pa;
    await passo("comida: simular devolve prévia (itens, faixa, total, pergunta) e não grava", async () => {
      pa = await tool(ta["ler escrever"], "ciclo_comida_registrar", { texto: "tomei café: 2 ovos, pão francês e café com leite", simular: true });
      ok(pa.previa && /^prv_/.test(pa.token), JSON.stringify(pa).slice(0, 200));
      ok(pa.refeicoes[0].refeicao === "cafe" && pa.refeicoes[0].itens.some((i) => i.faixa), "itens com faixa");
      ok((await comida(A)).length === 0, "simular gravou");
    });
    await passo("comida: confirmar grava; confirmar de novo não duplica (idempotente)", async () => {
      const c1 = await tool(ta["ler escrever"], "ciclo_comida_registrar", { confirmar: pa.token });
      ok(c1.gravado && /^Subi café/.test(c1.mensagem), JSON.stringify(c1));
      const c2 = await tool(ta["ler escrever"], "ciclo_comida_registrar", { confirmar: pa.token });
      ok(c2.jaConfirmado === true, "segunda confirmação não é idempotente");
      const rows = await comida(A);
      ok(rows.length === 1 && rows[0].via === "mcp", `registros: ${rows.length}`);
    });
    let pb;
    await passo("isolamento: a A não confirma a prévia da B (sem filtro de user_id, gravaria)", async () => {
      pb = await tool(tb["ler escrever"], "ciclo_comida_registrar", { texto: "almocei 150 g de frango grelhado", simular: true });
      const r = await tool(ta["ler escrever"], "ciclo_comida_registrar", { confirmar: pb.token });
      ok(/prévia não encontrada/.test(r.erro ?? ""), JSON.stringify(r));
      ok((await comida(B)).length === 0 && (await comida(A)).length === 1, "gravou na conta errada");
      const corr = await tool(ta["ler escrever"], "ciclo_comida_desfazer", {});
      ok(!corr.erro, "desfazer da A");
    });
    await passo("token da prévia vencido (15 min) não grava", async () => {
      const ctx = ctxReal(comandos(CENARIO, { porta: Number(new URL(BASE).port), ctrl: CTRL }), BASE, B);
      await ctx.sql(`UPDATE mcp_previa SET expires_at = 1 WHERE used_at IS NULL AND user_id = (SELECT id FROM user WHERE email = '${B}@dev.localhost')`);
      const r = await tool(tb["ler escrever"], "ciclo_comida_registrar", { confirmar: pb.token });
      ok(/expirou/.test(r.erro ?? ""), JSON.stringify(r));
      ok((await comida(B)).length === 0, "gravou com token vencido");
    });
    await passo("escopo ler: lê, mas escrita → 403 insufficient_scope", async () => {
      ok(!(await tool(ta.ler, "ciclo_semana_ver")).erro, "leitura com ler");
      const r = await rpc(ta.ler, "tools/call", { name: "ciclo_comida_registrar", arguments: { texto: "2 ovos", simular: true } });
      ok(r.status === 403 && /insufficient_scope/.test(r.headers.get("www-authenticate") ?? ""), `HTTP ${r.status}`);
    });
    await passo("corrigir (metade) e desfazer o último envio, ambos com prévia", async () => {
      const c = await tool(ta["ler escrever"], "ciclo_comida_corrigir", { refeicao: "cafe", fator: 0.5 });
      ok(c.previa, JSON.stringify(c));
      ok((await tool(ta["ler escrever"], "ciclo_comida_corrigir", { confirmar: c.token })).corrigido === 1, "corrigir");
      const d = await tool(ta["ler escrever"], "ciclo_comida_desfazer");
      ok(d.previa && d.vaiSair.length === 1, JSON.stringify(d));
      ok((await tool(ta["ler escrever"], "ciclo_comida_desfazer", { confirmar: d.token })).desfeito === 1, "desfazer");
      ok((await comida(A)).length === 0, "sobrou registro");
    });
    await passo("#87 vagos → editar (Não lembro vira descrição real) com prévia → desfazer volta ao que era; a B não alcança", async () => {
      const w = ta["ler escrever"];
      const r = await api(A, "POST", "/api/food", { text: "Não lembro (estimativa)", date: hoje(), meal: "jantar" });
      ok(r.status === 201, r.txt);
      const v = await tool(w, "ciclo_comida_vagos");
      ok(v.vagos?.some((x) => x.id === r.data.id), JSON.stringify(v).slice(0, 200));
      const ed = { edicoes: [{ id: r.data.id, itens: [{ nome: "Pizza de calabresa", quantidade: "3 fatias", kcal: 840, proteina: 36, fonte: "estimativa" }] }] };
      ok(/não encontrado/.test((await tool(tb["ler escrever"], "ciclo_comida_editar", ed)).erro ?? ""), "B editou registro da A");
      const p = await tool(w, "ciclo_comida_editar", ed);
      ok(p.previa && p.mudancas[0].depois.kcal === 840, JSON.stringify(p).slice(0, 200));
      ok((await tool(w, "ciclo_comida_editar", { confirmar: p.token })).editado === 1, "editar");
      ok((await comida(A)).some((x) => x.text === "Pizza de calabresa (3 fatias)"), "descrição real");
      const d = await tool(w, "ciclo_comida_desfazer");
      ok(d.voltaAoQueEra?.length === 1, JSON.stringify(d).slice(0, 200));
      ok((await tool(w, "ciclo_comida_desfazer", { confirmar: d.token })).voltaram === 1, "desfazer edição");
      ok((await comida(A)).some((x) => x.text === "Não lembro (estimativa)"), "não voltou");
      ok((await api(A, "DELETE", `/api/food/${r.data.id}`)).status === 200, "limpar");
    });
    await passo("treino: semana, série registrada, trocar e semana treinada pede prévia", async () => {
      const s = await tool(ta["ler escrever"], "ciclo_semana_ver");
      const ex = s.dias.find((d) => d.itens?.length)?.itens[0].split(" ")[0];
      ok(ex, "semana sem itens");
      ok((await tool(ta["ler escrever"], "ciclo_treino_registrar", { exercicioId: ex, series: [{ kg: 10, reps: 10, rir: 2 }] })).registrado === 1, "série");
      const tr = await tool(ta["ler escrever"], "ciclo_treino_trocar", { exercicioId: ex });
      ok(Array.isArray(tr.alternativas) && tr.alternativas.length > 0, `trocar: ${JSON.stringify(tr)}`);
      const g = await tool(ta["ler escrever"], "ciclo_semana_gerar");
      ok(g.previa && g.semanaJaTreinada, "semana treinada sem prévia");
    });
    await passo("#95 leitura: treino atual (escopo ler) e academias no ciclo_estado; a B não vê; academia sem o aparelho recusa", async () => {
      ok((await tool(ta.ler, "ciclo_treino_atual")).treinoAtual === null, "sem cadastro devia ser null");
      const ex = { id: "Dumbbell_Bicep_Curl", sets: 3, reps: 10, kg: 12 };
      const s = await tool(ta["ler escrever"], "ciclo_treino_atual_salvar", { treinoAtual: { divisoes: [{ nome: "Treino A", grupos: ["biceps"], exercicios: [ex] }, { nome: "Treino B", grupos: ["costas"], exercicios: [{ nome: "Remada fictícia", grupo: "costas" }] }] } });
      ok(s.salvo, `salvar treino atual: ${JSON.stringify(s)}`);
      const t = await tool(ta.ler, "ciclo_treino_atual");
      ok(t.por === "Chat" && t.treinoAtual.divisoes.length === 2 && t.treinoAtual.divisoes[0].exercicios[0].id === ex.id, `ler treino atual: ${JSON.stringify(t)}`);
      const e = await tool(ta.ler, "ciclo_estado");
      ok(e.treinoAtual?.length === 2 && e.academias?.[0]?.id === "acad1" && e.academias[0].aparelhos.includes("halteres") && e.academiaDoDia === "acad1", `ciclo_estado: ${JSON.stringify({ t: e.treinoAtual, a: e.academias, d: e.academiaDoDia })}`);
      const eb = await tool(tb["ler escrever"], "ciclo_estado");
      ok(eb.treinoAtual === null && !JSON.stringify(eb).includes("Remada fictícia"), "a B viu o treino atual da A");
      const r = await tool(ta["ler escrever"], "ciclo_salvar_treino_do_dia", { gymId: "acad1", itens: [{ id: "Leg_Press", sets: 3 }], motivo: "e2e" });
      ok(/não tem o aparelho.*ciclo_treino_trocar/.test(r.erro ?? ""), `leg press na academia sem leg press: ${JSON.stringify(r)}`);
    });
    await passo("#98 salvar o dia pelo Chat → a semana já traz o dia novo, com o resumo dos itens salvos", async () => {
      const seg = new Date(Date.parse(hoje() + "T12:00:00Z") + (8 - (new Date(hoje() + "T12:00:00Z").getUTCDay() || 7)) * 864e5).toISOString().slice(0, 10); // próxima segunda (semana ainda sem treino feito)
      const antes = await tool(ta["ler escrever"], "ciclo_semana_ver", { date: seg });
      const dia = antes.dias.find((d) => d.tipo === "treino" && d.itens?.length >= 4);
      ok(dia, "próxima semana sem dia de treino");
      const ids = dia.itens.slice(0, 4).map((i) => i.split(" ")[0]);
      const r = await tool(ta["ler escrever"], "ciclo_salvar_treino_do_dia", { date: dia.date, nome: "Treino do Chat", motivo: "e2e", itens: ids.map((id) => ({ id, sets: 3 })) });
      ok(r.salvo === true && r.naSemana === true, JSON.stringify(r));
      const depois = (await tool(ta["ler escrever"], "ciclo_semana_ver", { date: seg })).dias.find((d) => d.date === dia.date);
      ok(depois.nome === "Treino do Chat" && depois.min === 36, `semana sem o dia novo: ${JSON.stringify(depois)}`);
      const w = (await api(A, "GET", `/api/week?date=${seg}`)).data.week.days.find((d) => d.date === dia.date).plan;
      const soma = Object.values(w.perMuscle).reduce((a, b) => a + b, 0);
      ok(w.setsTotal === 12 && soma === 12, `resumo fora dos itens: ${JSON.stringify(w.perMuscle)} / ${w.setsTotal}`);
    });
  } finally {
    await api(A, "DELETE", "/api/account", { confirm: "APAGAR" }).catch(() => null);
    await api(B, "DELETE", "/api/account", { confirm: "APAGAR" }).catch(() => null);
    await parar();
  }
  console.log(`\n✔ e2e:mcp: ${n} passos ok`);
}

main().catch(() => process.exit(1));
