// #81 MCP formal no Worker real: schema como validação (erro claro), comida por conversa (simular → confirmar, uso único,
// 15 min, idempotente, preso à conta), os 3 jeitos, edição manual intocável, preferência de aprovação, escopo ler,
// semana com prévia, aliases e orçamento de tamanho. Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_ORCAMENTO_BYTES, MCP_ORCAMENTO_INSTRUCOES, MCP_ORCAMENTO_LISTA } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const dia = (n: number) => new Date(Date.now() - 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const rpc = (env: unknown, token: string, method: string, params: Record<string, unknown> = {}) =>
  call(env, "POST", "/mcp", { bearer: token, body: { jsonrpc: "2.0", id: 1, method, params } });
/** Chama a ferramenta e devolve o JSON da resposta (ou o texto do erro em `erro`). */
async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  assert.ok(Buffer.byteLength(txt) <= MCP_ORCAMENTO_BYTES, `${name}: ${Buffer.byteLength(txt)} bytes acima do orçamento`);
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}

async function conta(env: any, user: string, o: { escopo?: string; perfil?: boolean } = {}) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  if (o.perfil !== false) {
    assert.equal((await c("PUT", "/api/profile", { data: { level: 1, priorities: ["ombro"], minutes: 60, daysTarget: 4, prefs: {}, pinned: {}, avoid: [], goal: { statement: "objetivo fictício" } } })).status, 200);
    assert.equal((await c("PUT", "/api/gyms/acad1", { name: "Academia Exemplo", equipment: ["halteres", "banco", "polia", "barra"] })).status, 200);
  }
  const t = await c("POST", "/api/account/tokens", { label: "teste", ...(o.escopo ? { escopo: o.escopo } : {}) });
  assert.equal(t.status, 201, t.text);
  const comida = async () => (await c("GET", `/api/food?from=${dia(-30)}&to=${dia(1)}`)).data.entries as { id: string; meal: string; text: string; kcal: number; manual: boolean; via: string | null }[];
  return { token: t.data.token as string, c, comida };
}

test("schema é a validação: entrada fora dele volta com o campo e o porquê (sem chegar ao handler)", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana", { perfil: false });
  assert.match((await tool(env, a.token, "ciclo_estado", { date: "16/11/2026" })).erro, /entrada inválida para ciclo_estado: date: formato inválido \(YYYY-MM-DD/);
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { texto: "2 ovos", refeicao: "brunch" })).erro, /refeicao: deve ser cafe\|almoco\|lanche\|jantar\|ceia/);
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { texto: "2 ovos", confirmar: "abc" })).erro, /confirmar: formato inválido/);
  assert.match((await tool(env, a.token, "ciclo_historico", {})).erro, /tipo: obrigatório/);
  assert.match((await tool(env, a.token, "ciclo_treino_registrar", { exercicioId: "x", series: [] })).erro, /series: no mínimo 1/);
  assert.match((await tool(env, a.token, "ciclo_catalogo", { muscle: "ombro", limite: 999 })).erro, /limite: fora de 1\.\.60/);
});

test("comida: simular → prévia + token; confirmar grava uma vez (repetir não duplica); selo via mcp", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const p = await tool(env, a.token, "ciclo_comida_registrar", { texto: "tomei café: 2 ovos, pão francês e café com leite", simular: true });
  assert.equal(p.previa, true); assert.match(p.token, /^prv_[0-9a-f]{32}$/); assert.equal(p.expiraEmMin, 15);
  assert.equal(p.refeicoes[0].refeicao, "cafe"); assert.equal(p.refeicoes[0].acao, "novo");
  assert.ok(p.refeicoes[0].itens.find((i: any) => i.item === "2 ovos").faixa.length === 2);
  assert.match(p.proximoPasso, /Posso subir para o Ciclo\?/);
  assert.equal((await a.comida()).length, 0, "simular não grava");
  const ok = await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p.token });
  assert.equal(ok.gravado, true); assert.match(ok.mensagem, /^Subi café: \d+ kcal, [\d,]+ g de proteína\. No dia: .* Ajuste no app em Comida → hoje\.$/);
  const de1 = await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p.token });
  assert.equal(de1.jaConfirmado, true); assert.equal(de1.lote, ok.lote);
  const rows = await a.comida();
  assert.equal(rows.length, 1, "idempotente"); assert.equal(rows[0].via, "mcp"); assert.equal(rows[0].meal, "cafe");
});

test("comida: token vencido (15 min) e token de outra conta não gravam nada", async (t) => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const pa = await tool(env, a.token, "ciclo_comida_registrar", { texto: "almocei arroz e feijão", simular: true });
  const pb = await tool(env, b.token, "ciclo_comida_registrar", { texto: "almocei 150 g de frango grelhado", simular: true });
  // a A tenta confirmar a prévia da B (sem filtro de user_id, gravaria): inexistente para ela
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { confirmar: pb.token })).erro, /prévia não encontrada/);
  assert.equal((await a.comida()).length + (await b.comida()).length, 0);
  // prévia de outra ferramenta também não serve
  assert.match((await tool(env, a.token, "ciclo_comida_desfazer", { confirmar: pa.token })).erro, /prévia não encontrada/);
  const real = Date.now();
  t.mock.method(Date, "now", () => real + 16 * 60_000);
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { confirmar: pa.token })).erro, /expirou/);
  assert.equal((await a.comida()).length, 0);
  // a B ainda pode confirmar a dela? não: também passou dos 15 min
  assert.match((await tool(env, b.token, "ciclo_comida_registrar", { confirmar: pb.token })).erro, /expirou/);
});

test("3 jeitos: refeição; etapas no dia (existente pergunta, texto igual não duplica); dia inteiro separa por refeição", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const confirmar = async (args: Record<string, unknown>, extra: Record<string, unknown> = {}) => tool(env, a.token, "ciclo_comida_registrar", { confirmar: (await tool(env, a.token, "ciclo_comida_registrar", { ...args, simular: true })).token, ...extra });
  await confirmar({ texto: "café: 2 ovos" });
  // 2ª mensagem no mesmo café: a prévia pede complementar ou substituir; confirmar sem dizer não gasta o token
  const p2 = await tool(env, a.token, "ciclo_comida_registrar", { texto: "café: 1 banana", simular: true });
  assert.equal(p2.refeicoes[0].acao, "escolher"); assert.deepEqual(p2.escolha.opcoes, ["complementar", "substituir"]);
  assert.equal(p2.refeicoes[0].jaRegistradoNoDia[0].tipo, "dado_do_usuario");
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p2.token })).erro, /complementar ou substituir/);
  assert.equal((await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p2.token, modo: "complementar" })).gravado, true);
  assert.equal((await a.comida()).length, 2);
  // a mesma frase de novo: duplicado, não grava
  const dup = await confirmar({ texto: "café: 1 banana", modo: "complementar" });
  assert.equal(dup.gravado, false); assert.equal((await a.comida()).length, 2);
  // dia inteiro de uma vez
  const dia = await tool(env, a.token, "ciclo_comida_registrar", { texto: "almocei arroz, feijão e frango grelhado, lanchei uma banana e jantei 150 g de carne com salada", simular: true });
  assert.deepEqual(dia.refeicoes.map((r: any) => r.refeicao), ["almoco", "lanche", "jantar"]);
  assert.equal((await tool(env, a.token, "ciclo_comida_registrar", { confirmar: dia.token })).refeicoes.length, 3);
  assert.equal((await a.comida()).length, 5);
  // data relativa vira explícita
  const ontem = await tool(env, a.token, "ciclo_comida_registrar", { texto: "ontem à noite comi 2 ovos", simular: true });
  assert.equal(ontem.dataRelativa, "ontem"); assert.match(ontem.data, /^\d{4}-\d{2}-\d{2}$/); assert.equal(ontem.refeicoes[0].refeicao, "jantar");
});

test("edição manual no app nunca é sobrescrita: substituir, corrigir e desfazer a mantêm", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const p = await tool(env, a.token, "ciclo_comida_registrar", { texto: "almocei arroz e feijão", simular: true });
  await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p.token });
  const [reg] = await a.comida();
  assert.equal((await a.c("PUT", `/api/food/${reg.id}`, { kcal: 999 })).status, 200); // a pessoa ajusta à mão
  // corrigir: recusa (sem forcar)
  const cp = await tool(env, a.token, "ciclo_comida_corrigir", { refeicao: "almoco", fator: 0.5, simular: true });
  assert.match(cp.mudancas[0].recusado, /editado à mão/);
  const cc = await tool(env, a.token, "ciclo_comida_corrigir", { confirmar: cp.token });
  assert.equal(cc.corrigido, 0);
  // substituir o almoço: o registro manual fica
  const s = await tool(env, a.token, "ciclo_comida_registrar", { texto: "almocei macarrão", modo: "substituir", simular: true });
  assert.equal(s.refeicoes[0].editadosAMaoMantidos, 1);
  await tool(env, a.token, "ciclo_comida_registrar", { confirmar: s.token });
  assert.equal((await a.comida()).find((r) => r.id === reg.id)!.kcal, 999);
  // desfazer o último envio (o macarrão) não toca no manual
  const d = await tool(env, a.token, "ciclo_comida_desfazer");
  assert.equal(d.vaiSair.length, 1);
  assert.equal((await tool(env, a.token, "ciclo_comida_desfazer", { confirmar: d.token })).desfeito, 1);
  const rows = await a.comida();
  assert.deepEqual(rows.map((r) => r.kcal), [999]);
  // legado v1 também respeita: 409
  assert.match((await tool(env, a.token, "ciclo_comida_corrigir", { id: reg.id, kcal: 1, proteina: 1, confianca: "alta" })).erro, /editado à mão/);
});

test("corrigir com prévia: metade daquilo e troca por texto; desfazer sem lote não faz nada", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  assert.equal((await tool(env, a.token, "ciclo_comida_desfazer")).nadaParaDesfazer, true);
  const p = await tool(env, a.token, "ciclo_comida_registrar", { texto: "almocei 200 g de frango grelhado", simular: true });
  await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p.token });
  const [reg] = await a.comida();
  const c = await tool(env, a.token, "ciclo_comida_corrigir", { id: reg.id, fator: 0.5 });
  assert.equal(c.previa, true, "padrão sempre: corrigir também pede o sim");
  assert.equal(c.mudancas[0].depois.kcal, Math.round(c.mudancas[0].antes.kcal * 0.5));
  assert.equal((await tool(env, a.token, "ciclo_comida_corrigir", { confirmar: c.token })).corrigido, 1);
  assert.equal((await a.comida())[0].kcal, c.mudancas[0].depois.kcal);
  const t = await tool(env, a.token, "ciclo_comida_corrigir", { id: reg.id, texto: "2 ovos" });
  await tool(env, a.token, "ciclo_comida_corrigir", { confirmar: t.token });
  assert.equal((await a.comida())[0].text, "2 ovos");
});

test("preferência comida_aprovacao: só nas dúvidas sobe direto o que é alta confiança; nunca sobe direto; app lê e grava", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  assert.equal((await tool(env, a.token, "ciclo_preferencias")).comida_aprovacao, "sempre");
  assert.equal((await tool(env, a.token, "ciclo_comida_registrar", { texto: "café: 2 ovos" })).previa, true, "padrão sempre");
  await tool(env, a.token, "ciclo_preferencias", { comida_aprovacao: "so_duvidas" });
  const direto = await tool(env, a.token, "ciclo_comida_registrar", { texto: "lanche: 2 ovos" });
  assert.equal(direto.gravado, true); assert.match(direto.semPrevia, /so_duvidas/);
  assert.equal((await tool(env, a.token, "ciclo_comida_registrar", { texto: "jantei frango e coxinha" })).previa, true, "dúvida pergunta");
  // pelo app (Comida → Ajustes)
  assert.equal((await a.c("PATCH", "/api/home/preferencias", { comidaAprovacao: "nunca" })).data.comidaAprovacao, "nunca");
  assert.equal((await a.c("GET", "/api/diet?date=2026-11-16")).data.aprovacao, "nunca");
  assert.equal((await tool(env, a.token, "ciclo_comida_registrar", { texto: "ceia: 1 iogurte" })).gravado, true);
  assert.equal((await a.c("PATCH", "/api/home/preferencias", { comidaAprovacao: "talvez" })).status, 400);
});

test("escopo ler: lê, mas escrita → 403 insufficient_scope; em lote volta isError; a chave manual padrão escreve", async () => {
  const env = makeEnv();
  const ler = await conta(env, "ana", { escopo: "ler" });
  assert.ok(!(await tool(env, ler.token, "ciclo_semana_ver")).erro);
  const w = await mcp(env, ler.token, "ciclo_comida_registrar", { texto: "2 ovos", simular: true });
  assert.equal(w.status, 403); assert.match(w.headers.get("www-authenticate")!, /error="insufficient_scope"/); assert.match(w.text, /escopo ler/);
  const lote = await call(env, "POST", "/mcp", { bearer: ler.token, body: [{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ciclo_marcar_presenca", arguments: { date: "2026-11-10", status: "folga" } } }] });
  assert.equal(lote.status, 200); assert.equal(lote.data[0].result.isError, true);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM attendance").get().n, 0);
  assert.equal((await call(env, "POST", "/api/account/tokens", { user: "ana", body: { escopo: "admin" } })).status, 400);
  const todos = await conta(env, "bia");
  assert.equal((await mcp(env, todos.token, "ciclo_marcar_presenca", { date: "2026-11-10", status: "folga" })).data.result.isError, undefined);
});

test("treino: semana ver/gerar (prévia quando já treinou), registrar série, trocar e treino atual", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const sem = await tool(env, a.token, "ciclo_semana_ver");
  assert.equal(sem.dias.length, 7); assert.ok(sem.dias.some((d: any) => d.itens?.length));
  const livre = await tool(env, a.token, "ciclo_semana_gerar");
  assert.equal(livre.refeita, true, "semana sem treino feito refaz direto");
  const ex = sem.dias.find((d: any) => d.itens?.length).itens[0].split(" ")[0];
  const reg = await tool(env, a.token, "ciclo_treino_registrar", { exercicioId: ex, series: [{ kg: 20, reps: 10, rir: 2 }, { kg: 20, reps: 9 }] });
  assert.equal(reg.registrado, 2); assert.deepEqual(reg.series.map((s: string) => s.split(":")[0]), ["1", "2"]);
  assert.equal((await tool(env, a.token, "ciclo_treino_registrar", { exercicioId: ex, series: [{ kg: 22, reps: 8 }] })).series[0].split(":")[0], "3", "continua a numeração");
  assert.match((await tool(env, a.token, "ciclo_treino_registrar", { exercicioId: "Inventado_X", series: [{ reps: 8 }] })).erro, /ciclo_catalogo/);
  const ref = await tool(env, a.token, "ciclo_semana_gerar");
  assert.equal(ref.previa, true); assert.equal(ref.semanaJaTreinada, true);
  assert.equal((await tool(env, a.token, "ciclo_semana_gerar", { confirmar: ref.token })).refeita, true);
  assert.equal((await tool(env, a.token, "ciclo_semana_gerar", { confirmar: ref.token })).jaConfirmado, true);
  const tr = await tool(env, a.token, "ciclo_treino_trocar", { exercicioId: ex });
  assert.ok(Array.isArray(tr.mesmaParte) && Array.isArray(tr.outraParte)); assert.ok(tr.mesmaParte.length + tr.outraParte.length > 0);
  const ta = await tool(env, a.token, "ciclo_treino_atual_salvar", { treinoAtual: { divisoes: [{ nome: "Treino A", grupos: ["ombro"], exercicios: [{ id: ex, sets: 3 }, { nome: "Elevação na máquina", grupo: "ombro" }] }] } });
  assert.equal(ta.salvo, true);
  assert.match((await tool(env, a.token, "ciclo_treino_atual_salvar", { treinoAtual: { divisoes: "x" } })).erro, /treinoAtual inválido/);
  const h = await tool(env, a.token, "ciclo_historico", { tipo: "series", limite: 2 });
  assert.equal(h.itens.length, 2); assert.equal(h.total, 3); assert.equal(h.proximo, "2");
  assert.equal((await tool(env, a.token, "ciclo_historico", { tipo: "series", limite: 2, cursor: h.proximo })).itens.length, 1);
  const pr = await tool(env, a.token, "ciclo_preferencias", { evitar: [ex] });
  assert.deepEqual(pr.evitar, [ex]);
  assert.match((await tool(env, a.token, "ciclo_preferencias", { fixar: { ombro: "Inventado_X" } })).erro, /catálogo/);
});

test("aliases e legado: ciclo_salvar_perfil e ciclo_registrar_comida seguem valendo, fora do tools/list; orçamento da lista e das instructions", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const list = await rpc(env, a.token, "tools/list");
  const nomes = list.data.result.tools.map((t: { name: string }) => t.name) as string[];
  assert.ok(nomes.includes("ciclo_perfil_atualizar") && !nomes.includes("ciclo_salvar_perfil") && !nomes.includes("ciclo_registrar_comida"));
  for (const n of ["ciclo_comida_registrar", "ciclo_comida_corrigir", "ciclo_comida_desfazer", "ciclo_comida_pendentes", "ciclo_semana_gerar", "ciclo_semana_ver", "ciclo_treino_registrar", "ciclo_treino_trocar", "ciclo_treino_atual_salvar", "ciclo_preferencias", "ciclo_historico"]) assert.ok(nomes.includes(n), n);
  assert.ok(Buffer.byteLength(list.text) <= MCP_ORCAMENTO_LISTA, `tools/list: ${Buffer.byteLength(list.text)} bytes`);
  const init = await rpc(env, a.token, "initialize", { protocolVersion: "2025-06-18" });
  assert.ok(Buffer.byteLength(init.data.result.instructions) <= MCP_ORCAMENTO_INSTRUCOES, `instructions: ${Buffer.byteLength(init.data.result.instructions)} bytes`);
  assert.match(init.data.result.serverInfo.version, /^\d+\.\d+\.\d+$/);
  assert.doesNotMatch(init.data.result.instructions, /\bClaude\b/, "neutras de modelo");
  assert.equal((await tool(env, a.token, "ciclo_salvar_perfil", { perfil: { minutes: 50 } })).salvo, true);
  assert.equal((await tool(env, a.token, "ciclo_registrar_comida", { texto: "pão", kcal: 140, proteina: 4 })).ok, true);
  const cat = await tool(env, a.token, "ciclo_catalogo", { muscle: "ombro", limite: 5 });
  assert.equal(cat.itens.length, 5); assert.ok(cat.total > 5); assert.equal(cat.proximo, "5");
});

test("caixa: ciclo_chat_pendentes marca 'lido' e a hora da rotina aparece no app", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  await a.c("POST", "/api/inbox", { text: "pedido fictício" });
  const antes = (await a.c("GET", "/api/state?date=2026-11-16")).data.week.inbox[0];
  assert.equal(antes.read_at, null);
  await tool(env, a.token, "ciclo_chat_pendentes", { origem: "rotina" });
  const depois = (await a.c("GET", "/api/state?date=2026-11-16")).data.week.inbox[0];
  assert.ok(depois.read_at > 0, "o app mostra 'o Chat leu'");
  assert.ok((await a.c("GET", "/api/claude")).data.rotinaEm > 0);
});
