// #87 Comida pelo Chat no Worker real: item informado vira item; editar registro inteiro ("Não lembro" não fica); antes →
// depois por item; vagos em lote (uma prévia, uma aprovação, um lote, um desfazer); vários dias numa frase; isolamento
// entre contas; ataques (XSS/SQL no nome, kcal negativa/absurda, data fora do limite). Tudo fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_ORCAMENTO_BYTES } from "@ciclo/core";
import { call, makeEnv, mcp } from "./fakes.ts";

const SP = 3 * 3600e3;
const dia = (n: number) => new Date(Date.now() - SP + n * 864e5).toISOString().slice(0, 10);
/** Última data (até hoje) com esse dia da semana (0 = domingo). */
const ultimo = (dow: number) => { const hoje = new Date(Date.now() - SP).getUTCDay(); return dia(-((hoje - dow + 7) % 7)); };

async function tool(env: unknown, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await mcp(env, token, name, args);
  assert.equal(r.status, 200, r.text);
  const txt = r.data.result.content[0].text as string;
  assert.ok(Buffer.byteLength(txt) <= MCP_ORCAMENTO_BYTES, `${name}: ${Buffer.byteLength(txt)} bytes`);
  return r.data.result.isError ? { erro: txt } : JSON.parse(txt);
}
async function conta(env: any, user: string) {
  const c = (m: string, p: string, body?: unknown) => call(env, m, p, { user, body });
  const t = await c("POST", "/api/account/tokens", { label: "teste" });
  assert.equal(t.status, 201, t.text);
  /** registro feito no app (como o "Não lembro" do Diário) */
  const app = async (text: string, date = dia(0), meal = "jantar") => { const r = await c("POST", "/api/food", { text, date, meal }); assert.equal(r.status, 201, r.text); return r.data.id as string; };
  return { token: t.data.token as string, c, app };
}
const linha = (env: any, fid: string) => env.DB.raw.prepare("SELECT * FROM food_log WHERE id = ?1").get(fid) as Record<string, any>;

test("item não reconhecido enviado pelo Chat vira item próprio no registro; total = soma dos itens", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const p = await tool(env, a.token, "ciclo_comida_registrar", {
    texto: "café: 2 ovos e suco de uva marata", simular: true,
    itens: [{ nome: "Suco de uva Maratá", quantidade: "300 ml", g: 300, kcal: 210, proteina: 0, fonte: "rotulo" }],
  });
  const cafe = p.refeicoes[0];
  const suco = cafe.itens.find((i: any) => i.item.startsWith("Suco de uva Maratá"));
  assert.ok(suco, "o suco é item da prévia"); assert.equal(suco.kcal, 210); assert.equal(suco.fonte, "rotulo");
  assert.equal(cafe.kcal, cafe.itens.reduce((s: number, i: any) => s + i.kcal, 0));
  assert.ok(!p.duvidas.some((d: string) => /uva/.test(d)));
  const ok = await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p.token });
  assert.equal(ok.gravado, true);
  const row = env.DB.raw.prepare("SELECT items, kcal FROM food_log WHERE lote = ?1").get(ok.lote) as any;
  const itens = JSON.parse(row.items);
  assert.ok(itens.some((i: any) => i.nome === "Suco de uva Maratá" && i.kcal === 210 && i.fonte === "rotulo" && i.qtd === "300 ml"));
  assert.equal(row.kcal, itens.reduce((s: number, i: any) => s + i.kcal, 0), "total do registro = soma dos itens");
});

test("editar troca descrição + itens + kcal + proteína numa chamada; 'Não lembro (estimativa)' não fica; guarda o par original → itens", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const fid = await a.app("Não lembro (estimativa)", dia(-1));
  const v = await tool(env, a.token, "ciclo_comida_vagos", {});
  assert.deepEqual(v.vagos.map((x: any) => x.id), [fid]); assert.equal(v.vagos[0].texto, "Não lembro (estimativa)"); assert.equal(v.vagos[0].tipo, "dado_do_usuario");
  const p = await tool(env, a.token, "ciclo_comida_editar", { edicoes: [{ id: fid, itens: [
    { nome: "Pizza de calabresa", quantidade: "3 fatias", kcal: 840, proteina: 36, fonte: "estimativa" },
    { nome: "Refrigerante", quantidade: "350 ml", kcal: 150, proteina: 0, fonte: "rotulo" },
  ] }] });
  assert.equal(p.previa, true, "preferência padrão (sempre) → prévia");
  const m = p.mudancas[0];
  assert.equal(m.antes.texto, "Não lembro (estimativa)"); assert.equal(m.depois.texto, "Pizza de calabresa (3 fatias), Refrigerante (350 ml)");
  assert.equal(m.depois.kcal, 990); assert.equal(m.depois.proteina, 36);
  assert.equal(linha(env, fid).raw_text, "Não lembro (estimativa)", "prévia não grava");
  const ok = await tool(env, a.token, "ciclo_comida_editar", { confirmar: p.token });
  assert.equal(ok.editado, 1);
  const r = linha(env, fid);
  assert.notEqual(r.raw_text, "Não lembro (estimativa)"); assert.doesNotMatch(r.raw_text, /lembro/i);
  assert.equal(r.kcal, 990); assert.equal(r.protein, 36); assert.equal(r.via, "mcp"); assert.equal(r.source, "claude"); assert.equal(r.date, dia(-1)); assert.equal(r.meal, "jantar");
  assert.equal(r.raw_original, "Não lembro (estimativa)", "texto original guardado");
  assert.equal(JSON.parse(r.items).length, 2, "itens finais guardados");
  assert.equal((await tool(env, a.token, "ciclo_comida_vagos", {})).total, 0);
  // descrição vaga é recusada; registro editado à mão só com forcar
  assert.match((await tool(env, a.token, "ciclo_comida_editar", { edicoes: [{ id: fid, descricao: "não lembro", itens: [{ nome: "x", kcal: 1, proteina: 0, fonte: "estimativa" }] }] })).erro, /vaga/);
  await a.c("PUT", `/api/food/${fid}`, { kcal: 800 });
  const man = await tool(env, a.token, "ciclo_comida_editar", { edicoes: [{ id: fid, itens: [{ nome: "Pizza", kcal: 1, proteina: 0, fonte: "estimativa" }] }] });
  assert.match(man.mudancas[0].recusado, /editado à mão/);
  await tool(env, a.token, "ciclo_comida_editar", { confirmar: man.token });
  assert.equal(linha(env, fid).kcal, 800, "edição manual fica");
});

test("prévia da edição: renomear item e mudar a quantidade aparecem como antes → depois", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const p = await tool(env, a.token, "ciclo_comida_registrar", { texto: "café: néctar de uva", simular: true, itens: [{ nome: "Néctar de uva", quantidade: "200 ml", kcal: 120, proteina: 0, fonte: "estimativa" }] });
  const ok = await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p.token });
  const fid = (env.DB.raw.prepare("SELECT id FROM food_log WHERE lote = ?1").get(ok.lote) as any).id;
  const e = await tool(env, a.token, "ciclo_comida_editar", { edicoes: [{ id: fid, itens: [{ nome: "Suco de uva integral", quantidade: "300 ml", kcal: 210, proteina: 0, fonte: "rotulo" }] }], simular: true });
  const linhas = e.mudancas[0].itens;
  const troca = linhas.find((l: any) => /Néctar de uva \(200 ml\) → Suco de uva integral \(300 ml\)/.test(l.mudanca));
  assert.ok(troca, JSON.stringify(linhas)); assert.ok(troca.mudou.includes("nome") && troca.mudou.includes("quantidade"));
});

test("vagos em lote: uma prévia, uma aprovação, um lote; um desfazer volta todos ao que eram", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const ids = [await a.app("Não lembro (estimativa)", dia(-3), "almoco"), await a.app("Não lembro (estimativa)", dia(-2), "jantar"), await a.app("sei lá", dia(-1), "almoco")];
  const ok1 = await a.app("2 ovos e pão", dia(-1), "cafe"); // não é vago
  const v = await tool(env, a.token, "ciclo_comida_vagos", { de: dia(-6), ate: dia(0) });
  assert.deepEqual(v.vagos.map((x: any) => x.id).sort(), [...ids].sort());
  const nomes = ["Pizza", "Lasanha", "Strogonoff"];
  const p = await tool(env, a.token, "ciclo_comida_editar", { edicoes: ids.map((fid, k) => ({ id: fid, itens: [{ nome: nomes[k], quantidade: "1 prato", kcal: 700 + k, proteina: 30, fonte: "estimativa" }] })) });
  assert.equal(p.mudancas.length, 3); assert.equal(p.total.depois.kcal, 2103);
  const r = await tool(env, a.token, "ciclo_comida_editar", { confirmar: p.token });
  assert.equal(r.editado, 3);
  const lotes = new Set(ids.map((fid) => linha(env, fid).lote));
  assert.equal(lotes.size, 1, "um lote só"); assert.equal([...lotes][0], r.lote);
  assert.deepEqual(ids.map((fid) => linha(env, fid).raw_text), ["Pizza (1 prato)", "Lasanha (1 prato)", "Strogonoff (1 prato)"]);
  // desfazer: prévia mostra o que volta; confirmar volta os 3 de uma vez
  const d = await tool(env, a.token, "ciclo_comida_desfazer", {});
  assert.equal(d.voltaAoQueEra.length, 3); assert.equal(d.vaiSair.length, 0);
  assert.equal(d.voltaAoQueEra[0].volta.tipo, "dado_do_usuario");
  const dd = await tool(env, a.token, "ciclo_comida_desfazer", { confirmar: d.token });
  assert.equal(dd.voltaram, 3); assert.equal(dd.sairam, 0);
  for (const fid of ids) { const x = linha(env, fid); assert.match(x.raw_text, /Não lembro|sei lá/); assert.equal(x.raw_original, null); assert.equal(x.antes, null); assert.equal(x.lote, null); assert.equal(x.via, null); }
  assert.equal(linha(env, ok1).raw_text, "2 ovos e pão", "o resto do dia não muda");
});

test("vários dias: 'sábado comi A, domingo B' → prévia com 2 dias; aprovar grava cada um na data certa; limite de 30 dias", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const sab = ultimo(6), dom = ultimo(0);
  const p = await tool(env, a.token, "ciclo_comida_registrar", { texto: "sábado jantei pizza de calabresa, domingo almocei arroz e feijão", simular: true,
    itens: [{ nome: "Pizza de calabresa", quantidade: "3 fatias", kcal: 840, proteina: 36, fonte: "estimativa", refeicao: "jantar", data: sab }] });
  assert.equal(p.dias.length, 2, JSON.stringify(p).slice(0, 400));
  const porData = Object.fromEntries(p.dias.map((d: any) => [d.data, d]));
  assert.ok(porData[sab] && porData[dom]);
  assert.equal(porData[sab].refeicoes[0].refeicao, "jantar"); assert.equal(porData[dom].refeicoes[0].refeicao, "almoco");
  assert.match(p.proximoPasso, /POR DIA/);
  const ok = await tool(env, a.token, "ciclo_comida_registrar", { confirmar: p.token });
  assert.equal(ok.gravado, true);
  const rows = env.DB.raw.prepare("SELECT date, meal, lote, kcal FROM food_log WHERE lote = ?1 ORDER BY date").all(ok.lote) as any[];
  assert.deepEqual(rows.map((r) => [r.date, r.meal]).sort(), [[sab, "jantar"], [dom, "almoco"]].sort());
  assert.ok(rows.find((r) => r.date === sab).kcal >= 840);
  // um desfazer tira os dois dias
  const d = await tool(env, a.token, "ciclo_comida_desfazer", {});
  assert.equal(d.vaiSair.length, 2);
  // dias explícitos fora do limite (40 dias) e no futuro: recusados
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { dias: [{ data: dia(-40), texto: "pizza" }, { data: dia(-1), texto: "arroz" }], simular: true })).erro, /30 dias/);
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { dias: [{ data: dia(2), texto: "pizza" }], simular: true })).erro, /30 dias/);
  // vários dias: item sem data é recusado (não adivinha o dia)
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { texto: "ontem pizza, hoje arroz", simular: true, itens: [{ nome: "Pizza", kcal: 800, proteina: 30, fonte: "estimativa" }] })).erro, /diga a data/);
});

test("isolamento: editar e corrigir em lote só alcançam registros do próprio user_id; prévia de outra conta/ferramenta não serve", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana"), b = await conta(env, "bia");
  const fa = await a.app("Não lembro (estimativa)", dia(-1));
  const fb = await b.app("Não lembro (estimativa)", dia(-1));
  const item = [{ nome: "Pizza", kcal: 800, proteina: 30, fonte: "estimativa" }];
  // B tenta editar o registro da A (sozinho e no meio de um lote com o dela): não encontrado, nada muda
  assert.match((await tool(env, b.token, "ciclo_comida_editar", { edicoes: [{ id: fa, itens: item }] })).erro, /não encontrado/);
  const mix = await tool(env, b.token, "ciclo_comida_editar", { edicoes: [{ id: fb, itens: item }, { id: fa, itens: item }] });
  assert.match(mix.erro, /edicoes\[1\]/); assert.ok(!mix.erro.includes(fa), "não ecoa o id da outra conta");
  // B não vê os vagos da A
  assert.deepEqual((await tool(env, b.token, "ciclo_comida_vagos", {})).vagos.map((x: any) => x.id), [fb]);
  // A simula; B tenta confirmar a prévia da A: inexistente
  const pa = await tool(env, a.token, "ciclo_comida_editar", { edicoes: [{ id: fa, itens: item }] });
  assert.match((await tool(env, b.token, "ciclo_comida_editar", { confirmar: pa.token })).erro, /prévia não encontrada/);
  // prévia do editar não serve no corrigir (mesmo tipo no banco) e vice-versa
  assert.match((await tool(env, a.token, "ciclo_comida_corrigir", { confirmar: pa.token })).erro, /prévia não encontrada/);
  const pc = await tool(env, a.token, "ciclo_comida_corrigir", { id: fa, fator: 0.5 });
  assert.match((await tool(env, a.token, "ciclo_comida_editar", { confirmar: pc.token })).erro, /prévia não encontrada/);
  assert.equal(linha(env, fa).raw_text, "Não lembro (estimativa)"); assert.equal(linha(env, fb).raw_text, "Não lembro (estimativa)");
  // a A confirma a dela; o desfazer da B não alcança o lote da A
  await tool(env, a.token, "ciclo_comida_editar", { confirmar: pa.token });
  assert.equal(linha(env, fa).raw_text, "Pizza");
  assert.equal((await tool(env, b.token, "ciclo_comida_desfazer", {})).nadaParaDesfazer, true);
  assert.equal(linha(env, fb).raw_text, "Não lembro (estimativa)");
});

test("ataques: XSS/SQL no nome ficam como dado; kcal negativa/absurda e campos extras recusados", async () => {
  const env = makeEnv();
  const a = await conta(env, "ana");
  const fid = await a.app("Não lembro (estimativa)", dia(0));
  const mau = `<img src=x onerror=alert(1)>'); DELETE FROM food_log;--`;
  const p = await tool(env, a.token, "ciclo_comida_editar", { edicoes: [{ id: fid, itens: [{ nome: mau, kcal: 100, proteina: 1, fonte: "estimativa" }] }] });
  assert.equal(p.mudancas[0].depois.tipo, "dado_do_usuario");
  await tool(env, a.token, "ciclo_comida_editar", { confirmar: p.token });
  assert.equal(linha(env, fid).raw_text, mau, "gravado literal (bind), nada executado");
  assert.equal((env.DB.raw.prepare("SELECT COUNT(*) AS n FROM food_log").get() as any).n, 1);
  const it = (o: Record<string, unknown>) => ({ edicoes: [{ id: fid, itens: [{ nome: "x", kcal: 1, proteina: 0, fonte: "estimativa", ...o }] }] });
  assert.match((await tool(env, a.token, "ciclo_comida_editar", it({ kcal: -50 }))).erro, /kcal: fora de 0\.\.5000/);
  assert.match((await tool(env, a.token, "ciclo_comida_editar", it({ kcal: 999999 }))).erro, /kcal: fora de/);
  assert.match((await tool(env, a.token, "ciclo_comida_editar", it({ proteina: 5000 }))).erro, /proteina: fora de/);
  assert.match((await tool(env, a.token, "ciclo_comida_editar", it({ fonte: "inventada" }))).erro, /fonte: deve ser/);
  assert.match((await tool(env, a.token, "ciclo_comida_editar", it({ user_id: "outro" }))).erro, /campo desconhecido/);
  assert.match((await tool(env, a.token, "ciclo_comida_registrar", { texto: "pizza", itens: [{ nome: "Pizza", kcal: -1, proteina: 0, fonte: "estimativa" }] })).erro, /kcal: fora de/);
  assert.match((await tool(env, a.token, "ciclo_comida_vagos", { de: dia(-60), ate: dia(0) })).erro, /no máximo 31 dias/);
});
