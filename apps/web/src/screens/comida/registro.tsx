// Registrar o que comeu (voz ou texto), registro rápido (igual ao típico, refeições salvas) e o histórico do dia com editar/apagar.
import { useEffect, useState } from "preact/hooks";
import { MEALS, MEAL_NM, guessMeal } from "@ciclo/core";
import { faltaHojeVariada } from "@ciclo/core/alimentos-variedade";
import type { Meal } from "@ciclo/core";
import { TETO, type ItemPorcao, type PorcaoPessoal } from "@ciclo/core/porcoes";
import { S, calc, commit, today } from "../../lib/store/index.ts";
import { DIET, FOODBASE, addFood, deleteFood, deleteTemplate, editFood, estimarTexto, foodRows, foodTotals, hourNow, saveTemplate } from "../../lib/store/regras.ts";
import { SERVER, api, send } from "../../lib/api/index.ts";
import type { FoodRow } from "../../lib/store/regras.ts";
import { Card, Chip, Icon, toast } from "../../lib/ui/index.tsx";
import { BarraSimples } from "../../lib/grafico/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { Seg } from "../../lib/ui/index.tsx";
import { fmt, longDate } from "../../lib/util.ts";

const CONF: Record<string, string> = { alta: "alta", media: "média", baixa: "baixa" };
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
// #81 entrada vinda da IA conectada: "via Chat, 12:40 · ≈ estimativa" (editar no app vence sempre)
const origem = (f: FoodRow) => (f.via === "mcp" ? `via Chat${f.createdAt ? `, ${hhmm(f.createdAt)}` : ""} · ≈ estimativa` : f.source === "claude" ? `Chat conferiu${f.confidence ? ` (confiança ${CONF[f.confidence] ?? f.confidence})` : ""}` : "estimativa do aparelho");
const MEAL_OPTS: [Meal | null, string][] = [[null, "Automático"], ...MEALS.map((m): [Meal, string] => [m, MEAL_NM[m]])];
const num = (s: string) => { const n = Number(s.replace(",", ".")); return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null; };

function MealChips({ value, onPick, label }: { value: Meal | null; onPick: (m: Meal | null) => void; label: string }) {
  return <div class="chips" role="group" aria-label={label}>{MEAL_OPTS.map(([m, l]) => <Chip key={String(m)} on={value === m} onClick={() => onPick(m)}>{l}</Chip>)}</div>;
}

/** Folha de edição de um registro: texto, refeição, kcal e proteína; apagar. */
function abrirEdicao(f: FoodRow) {
  const d = { text: f.text, meal: f.meal, kcal: f.kcal == null ? "" : String(f.kcal), prot: f.prot == null ? "" : String(f.prot) };
  const orig = { kcal: d.kcal, prot: d.prot };
  const salvar = () => {
    const text = d.text.trim();
    if (!text) return toast("Escreva o que foi");
    const kcal = num(d.kcal), prot = num(d.prot);
    if ((d.kcal.trim() && kcal == null) || (d.prot.trim() && prot == null)) return toast("Calorias e proteína: só números");
    // só o que o dono mexeu vale como ajuste manual; mudar apenas o texto refaz a estimativa
    editFood(f.id, { text, meal: d.meal, kcal: d.kcal !== orig.kcal ? kcal ?? undefined : undefined, prot: d.prot !== orig.prot ? prot ?? undefined : undefined });
    commit(); closeSheet(); toast("Registro atualizado");
  };
  const view = () => <>
    <SheetHead kicker={longDate(f.date)} title="Editar registro" />
    <p class="small sub" style="margin:8px 0">Valores atuais: {origem(f)}. Mudar o texto refaz a estimativa; mudar os números vale como ajuste seu.</p>
    <label class="f" for="ed-text">O que foi</label>
    <textarea id="ed-text" class="input" rows={3} value={d.text} onInput={(e) => { d.text = e.currentTarget.value; }} />
    <span class="f" style="margin-top:10px;display:block">Refeição</span>
    <MealChips value={d.meal} onPick={(m) => { d.meal = m; openSheet(view); }} label="Refeição" />
    <div class="grid g2" style="margin-top:10px;gap:10px">
      <div><label class="f" for="ed-kcal">Calorias (kcal)</label><input id="ed-kcal" class="input num" inputMode="decimal" value={d.kcal} onInput={(e) => { d.kcal = e.currentTarget.value; }} /></div>
      <div><label class="f" for="ed-prot">Proteína (g)</label><input id="ed-prot" class="input num" inputMode="decimal" value={d.prot} onInput={(e) => { d.prot = e.currentTarget.value; }} /></div>
    </div>
    <div class="row wrapx" style="margin-top:14px;gap:8px">
      <button type="button" class="btn pri" onClick={salvar}><Icon id="check" />Salvar</button>
      <button type="button" class="btn" onClick={closeSheet}>Cancelar</button>
      <button type="button" class="btn danger" onClick={() => { deleteFood(f.id); commit(); closeSheet(); toast("Registro apagado"); }}>Apagar</button>
    </div>
  </>;
  openSheet(view);
}

/** Folha para dar nome a uma refeição salva (marmita, café padrão). */
function abrirSalvar(text: string, meal: Meal | null) {
  const d = { name: "" };
  const view = () => <>
    <SheetHead kicker="Registro rápido" title="Salvar como refeição" />
    <p class="small sub" style="margin:8px 0">“{text}”</p>
    <label class="f" for="tpl-name">Nome (ex.: Marmita, Café padrão)</label>
    <input id="tpl-name" class="input" maxLength={40} value={d.name} onInput={(e) => { d.name = e.currentTarget.value; }} />
    <div class="row wrapx" style="margin-top:14px;gap:8px">
      <button type="button" class="btn pri" onClick={() => {
        const name = d.name.trim(); if (!name) return toast("Dê um nome");
        if (DIET.templates.length >= 20) return toast("Até 20 refeições salvas");
        saveTemplate(name, text, meal); commit(); closeSheet(); toast("Refeição salva");
      }}><Icon id="check" />Salvar</button>
      <button type="button" class="btn" onClick={closeSheet}>Cancelar</button>
    </div>
  </>;
  openSheet(view);
}

// ---------- #80 porções faladas: "≈ estimativa média", faixa, suposições e Ajustar ----------
// O dicionário de porções carrega só quando a tela de Comida abre (fora do bundle inicial).
type Porc = typeof import("@ciclo/core/porcoes");
let PORC: Porc | null = null, carregando: Promise<void> | null = null;
const PESSOAIS: PorcaoPessoal[] = [];
function carregarPorcoes(onPronto: () => void) {
  if (PORC) return;
  carregando ??= Promise.all([
    import("@ciclo/core/porcoes").then((m) => { PORC = m; }),
    SERVER ? api<{ porcoes: PorcaoPessoal[] }>("GET", "/api/porcao-pessoal").then((r) => { PESSOAIS.splice(0, PESSOAIS.length, ...(r?.porcoes ?? [])); }).catch(() => {}) : Promise.resolve(),
  ]).then(() => {});
  carregando.then(onPronto).catch(() => {});
}
/** Ajuste da pessoa num item: fator de porção (½ · 1 · 1½ · 2) ou gramas. */
type Ajuste = { fator?: number; g?: number };
const chaveItem = (i: ItemPorcao, k: number) => `${k}:${i.key ?? i.nome}`;
function aplicar(i: ItemPorcao, a?: Ajuste): ItemPorcao {
  if (!a || !i.g) return i;
  const g = a.g ?? Math.round(i.g * (a.fator ?? 1)), f = g / i.g;
  const kcal = Math.round(i.kcal * f), prot = Math.round(i.prot * f * 10) / 10;
  // o ajuste da pessoa vale, mas quantidade fora do plausível continua pedindo conferência (mesmo teto da prévia)
  return { ...i, g, kcal, prot, conf: Math.max(i.conf, 0.9), origem: "pessoal", conferir: prot > TETO.protItem || kcal > TETO.kcalItem };
}
const FRACOES: [number, string][] = [[0.5, "½"], [1, "1"], [1.5, "1½"], [2, "2"]];
const fmtFaixa = (f: [number, number] | null) => (f ? `${fmt(f[0])}–${fmt(f[1])} g` : "");

/** Folha "Ajustar": porção (½ · 1 · 1½ · 2) ou gramas. Vira a porção pessoal: a próxima estimativa já vem assim. */
function abrirAjuste(i: ItemPorcao, atual: Ajuste | undefined, salvar: (a: Ajuste | undefined) => void) {
  const d = { fator: atual?.fator ?? (atual?.g ? null : 1) as number | null, g: atual?.g ? String(atual.g) : "" };
  const curto = i.texto.replace(/^[\d,]+\s+/, "");
  const aplicarAjuste = () => {
    const g = d.g.trim() ? Number(d.g.replace(",", ".")) : null;
    if (g != null && !(g >= 1 && g <= 2000)) return toast("Gramas: de 1 a 2.000");
    const a: Ajuste | undefined = g != null ? { g: Math.round(g) } : d.fator && d.fator !== 1 ? { fator: d.fator } : undefined;
    salvar(a);
    // ensina: a porção por unidade/medida vira a porção pessoal (o texto não sai daqui, só o alimento e a medida)
    const final = aplicar(i, a).g;
    let msg = a ? "Ajustado · a próxima vem assim" : "Mantido";
    if (a && i.key && i.medida !== "g" && final && i.qtd > 0) {
      const p: PorcaoPessoal = { alimento: i.key, medida: i.medida, gramas: Math.round(final / i.qtd) };
      const k = PESSOAIS.findIndex((x) => x.alimento === p.alimento && x.medida === p.medida);
      if (k >= 0) PESSOAIS[k] = p; else PESSOAIS.unshift(p);
      send("PUT", "/api/porcao-pessoal", p).catch(() => {});
      msg = `Ajustado · na próxima, 1 ${i.medida} de ${curto} ≈ ${fmt(p.gramas)} g`;
    }
    closeSheet(); toast(msg);
  };
  const view = () => <>
    <SheetHead kicker="≈ estimativa média" title={`Ajustar: ${curto}`} />
    <p class="small sub num" style="margin:8px 0">Estimei ≈ {fmt(i.g ?? 0)} g{i.faixa ? `, provavelmente entre ${fmt(i.faixa[0])} e ${fmt(i.faixa[1])} g` : ""}. Ajustar deixa as próximas mais certas.</p>
    <span class="f" style="display:block">Porção</span>
    <Seg opts={FRACOES} value={d.fator} onPick={(v) => { d.fator = v; d.g = ""; openSheet(view); }} label="Quantas porções" />
    <label class="f" for="aj-g" style="margin-top:12px;display:block">Ou em gramas</label>
    <input id="aj-g" class="input num" inputMode="numeric" placeholder={String(i.g ?? "")} value={d.g} onInput={(e) => { d.g = e.currentTarget.value; if (d.g.trim()) d.fator = null; }} />
    <div class="row wrapx" style="margin-top:14px;gap:8px">
      <button type="button" class="btn pri" onClick={aplicarAjuste}><Icon id="check" />Aplicar</button>
      <button type="button" class="btn" onClick={closeSheet}>Cancelar</button>
    </div>
  </>;
  openSheet(view);
}

/** Itens estimados enquanto a pessoa fala: selo "≈ estimativa média", faixa, ⓘ suposições e Ajustar (destaque na baixa confiança). */
function Porcoes({ itens, nao, aj, setAj }: { itens: ItemPorcao[]; nao: string[]; aj: Record<string, Ajuste>; setAj: (k: string, a: Ajuste | undefined) => void }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const finais = itens.map((i, k) => aplicar(i, aj[chaveItem(i, k)]));
  const kcal = finais.reduce((s, i) => s + i.kcal, 0), prot = Math.round(finais.reduce((s, i) => s + i.prot, 0));
  return <div style="margin-top:8px" aria-live="polite">
    <p class="small num" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">~{fmt(kcal)} kcal · {fmt(prot)} g de proteína <span class="badge">≈ estimativa média</span></p>
    <ul style="list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px">{itens.map((i0, k) => {
      const ck = chaveItem(i0, k), i = finais[k], baixa = i.conf < 0.6 || i.conferir, sup = [...i0.suposicoes, ...(aj[ck] ? ["ajustado por você"] : [])];
      return <li key={ck} style={`border:1px solid ${baixa ? "var(--warn)" : "var(--borda)"};border-radius:var(--r-btn);padding:6px 8px 6px 12px`}>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="flex:1 1 140px;min-width:0;overflow-wrap:anywhere"><b class="small">{i0.texto}</b><br />
            <span class="tiny sub num">≈ {fmt(i.g ?? 0)} g{i.faixa && !aj[ck] ? ` (${fmtFaixa(i.faixa)})` : ""} · ~{fmt(i.kcal)} kcal · {fmt(i.prot)} g prot</span>
            {i.conferir && <><br /><span class="badge warn">⚠ conferir a quantidade</span></>}</span>
          {sup.length > 0 && <button type="button" class="iconbtn" aria-label={`Suposições sobre ${i0.texto}`} aria-expanded={aberto === ck} onClick={() => setAberto(aberto === ck ? null : ck)}><Icon id="info" /></button>}
          <button type="button" class={`btn sm${baixa ? "" : " ghost"}`} onClick={() => abrirAjuste(i0, aj[ck], (a) => setAj(ck, a))}>Ajustar</button>
        </div>
        {aberto === ck && <ul class="tiny sub" style="margin:4px 0 2px;padding-left:16px">{sup.map((x) => <li key={x}>{x}</li>)}</ul>}
      </li>;
    })}</ul>
    {nao.length > 0 && <p class="tiny sub" style="margin-top:6px">Não reconheci: {nao.join(", ")}. O Chat estima na conferência.</p>}
    <p class="tiny sub" style="margin-top:6px">É uma estimativa média, não uma medida. Ajustar deixa as próximas mais certas.</p>
  </div>;
}

export function Registro({ dia }: { dia: string }) {
  const [status, setStatus] = useState("");
  const [meal, setMeal] = useState<Meal | null>(null);
  const [gerenciar, setGerenciar] = useState(false);
  const [, pronto] = useState(0);
  const [aj, setAjs] = useState<Record<string, Ajuste>>({});
  useEffect(() => carregarPorcoes(() => pronto((x) => x + 1)), []);
  const draft = S.ui.foodDraft ?? "";
  const est = estimarTexto(draft), parts = est.partes;
  const kcal = est.kcal, prot = Math.round(est.prot);
  const parteTxt = (p: (typeof parts)[number]) => p.texto + (p.fonte === "pessoal" ? " (sua base)" : "");
  const porc = PORC && draft.trim() ? PORC.estimarItens(draft, FOODBASE.itens, PESSOAIS) : null;
  const setAj = (k: string, a: Ajuste | undefined) => setAjs((o) => { const n = { ...o }; if (a) n[k] = a; else delete n[k]; return n; });
  const registrar = () => {
    const v = draft.trim(); if (!v) return toast("Fale ou escreva o que comeu");
    // com o dicionário carregado, sobe o que a tela mostrou (já com os ajustes); sem ele, a estimativa antiga
    const fin = porc?.itens.length ? porc.itens.map((i, k) => aplicar(i, aj[chaveItem(i, k)])) : null;
    const over = fin ? { kcal: Math.round(fin.reduce((s, i) => s + i.kcal, 0)), prot: Math.round(fin.reduce((s, i) => s + i.prot, 0) * 10) / 10 } : undefined;
    addFood(v, meal ?? guessMeal(v, hourNow()), over, dia); S.ui.foodDraft = ""; setMeal(null); setStatus(""); setAjs({}); commit(); toast("Registrado · o Chat confere");
  };
  const typical = (S.profile.diet.typical || "").trim();
  const igualAoTipico = () => {
    if (!typical) return toast("Conte seu dia típico no Perfil para usar este atalho");
    addFood(typical, null, undefined, dia); commit(); toast("Dia normal registrado");
  };
  return <Card>
    {dia !== today && <p class="kicker" style="margin-bottom:4px">Registrando em {longDate(dia)}</p>}
    <h2>O que você comeu?</h2>
    <p class="small sub" style="margin:4px 0 12px">Fale como falaria: “três ovos, dois pães e um whey”.</p>
    <div class="row start" style="gap:12px">
      <Mic grande value={draft} onChange={(v) => { S.ui.foodDraft = v; commit(); }} label="Gravar o que comeu" onStatus={setStatus} />
      <textarea class="input" style="flex:1;min-width:0" rows={4} aria-label="O que você comeu" placeholder="café: 3 ovos e 2 pães · almoço: arroz, feijão e frango" value={draft}
        onInput={(e) => { S.ui.foodDraft = e.currentTarget.value; pronto((x) => x + 1); }} onBlur={() => commit()} />
    </div>
    {porc && porc.itens.length ? <Porcoes itens={porc.itens} nao={porc.naoReconhecidos} aj={aj} setAj={setAj} />
      : <p class="small est-line num" style="margin-top:8px" aria-live="polite">{draft.trim() ? (kcal ? <>~{fmt(kcal)} kcal · {fmt(prot)} g de proteína <span class="sub">({parts.map(parteTxt).join(" · ")})</span></> : <span class="sub">Não reconheci os alimentos; o Chat estima na conferência.</span>) : <span class="sub">A estimativa aparece aqui enquanto você fala.</span>}</p>}
    <span class="f" style="margin-top:10px;display:block">Refeição</span>
    <MealChips value={meal} onPick={setMeal} label="Refeição do registro" />
    <div class="row wrapx" style="margin-top:12px;gap:8px">
      <button type="button" class="btn pri" onClick={registrar}><Icon id="send" />Registrar</button>
      <button type="button" class="btn" onClick={igualAoTipico}>Igual ao típico</button>
      {draft.trim() && <button type="button" class="btn" onClick={() => abrirSalvar(draft.trim(), meal)}>Salvar como refeição</button>}
    </div>
    <hr />
    <div class="row between"><h3 class="small">Refeições salvas</h3>
      {DIET.templates.length > 0 && <button type="button" class="btn ghost sm" aria-pressed={gerenciar} onClick={() => setGerenciar(!gerenciar)}>{gerenciar ? "Concluir" : "Gerenciar"}</button>}</div>
    {DIET.templates.length === 0 ? <p class="small sub" style="margin-top:6px">Escreva uma refeição que você repete e toque em “Salvar como refeição”: depois é um toque só.</p>
      : <div class="chips" style="margin-top:8px">{DIET.templates.map((t) => gerenciar
        ? <button type="button" key={t.id} class="chip tpl-chip manage" aria-label={`Apagar a refeição salva ${t.name}`} onClick={() => { deleteTemplate(t.id); commit(); toast("Refeição apagada"); }}><Icon id="x" />{t.name}</button>
        : <button type="button" key={t.id} class="chip" aria-label={`Registrar ${t.name}: ${t.text}`} onClick={() => { addFood(t.text, t.meal ?? guessMeal(t.text, hourNow()), { kcal: t.kcal, prot: t.prot }, dia); commit(); toast(`${t.name} registrada`); }}>{t.name}{t.kcal ? <span class="sub num"> {fmt(t.kcal)}</span> : null}</button>)}</div>}
  </Card>;
}

/** "Faltam X g de proteína e ~Y kcal" e até 2 sugestões dos alimentos que a pessoa já come (core: faltaHoje). */
function Falta({ dia }: { dia: string }) {
  const d = calc().diet, t = foodTotals(dia);
  // #80 variedade: a fila de fontes gira pelo dia e o que já foi comido hoje vai para o fim
  const comidos = [...new Set(foodRows().filter((x) => x.date === dia).flatMap((x) => estimarTexto(x.text).partes.flatMap((p) => (p.key ? [p.key] : []))))];
  const f = faltaHojeVariada({ kcal: d.kcal, protein: d.protein }, t, FOODBASE.itens, { dia, comidos });
  if (!f.sugestoes.length) return <p class="small" style="margin-top:10px"><b>Proteína batida{f.kcal ? `; faltam ~${fmt(f.kcal)} kcal para a meta` : ""}.</b> O resto é livre.</p>;
  return <div style="margin-top:10px">
    <p class="small num"><b>Faltam {fmt(f.prot)} g de proteína{f.kcal ? <> e ~{fmt(f.kcal)} kcal</> : ""}.</b> <span class="sub">({fmt(t.prot)} de {fmt(d.protein)} g · {fmt(t.kcal)} de {fmt(d.kcal)} kcal)</span></p>
    <ul class="small" style="margin:6px 0 0;padding-left:18px">{f.sugestoes.map((s) => <li key={s.texto} class="num">{s.texto} <span class="sub">(~{fmt(s.kcal)} kcal)</span></li>)}</ul>
  </div>;
}

/** O dia escolhido (hoje por padrão): totais contra a meta, registros com editar e apagar, e navegação pelos últimos dias. */
export function DiaCard({ dia, setDia }: { dia: string; setDia: (d: string) => void }) {
  const d = calc().diet, t = foodTotals(dia), rows = foodRows().filter((f) => f.date === dia);
  const [apagar, setApagar] = useState<string | null>(null);
  // #87 o seletor de dia (seta + calendário, até 30 dias) fica no topo da coluna (dia.tsx); aqui só o título
  return <Card>
    <h2>{dia === today ? "Hoje" : longDate(dia)}</h2>
    <div class="vol num" style="margin-top:12px"><span>Calorias</span><BarraSimples pct={(t.kcal / d.kcal) * 100} /><span>{fmt(t.kcal)}</span></div>
    <div class="vol num"><span>Proteína</span><BarraSimples pct={(t.prot / d.protein) * 100} color="var(--acc)" /><span>{fmt(t.prot)} g</span></div>
    <Falta dia={dia} />
    <hr />
    {rows.length === 0 ? <p class="small sub">Nada registrado {dia === today ? "hoje" : "neste dia"}.</p> : rows.map((f) => <div key={f.id} class="food-row">
      <span class="tx">{f.text}</span>
      <span class="tiny sub num">{f.meal ? `${MEAL_NM[f.meal]} · ` : ""}~{fmt(f.kcal ?? 0)} kcal · {fmt(f.prot ?? 0)} g · {origem(f)}</span>
      <span class="acts">
        <button type="button" class="iconbtn" aria-label={`Editar: ${f.text}`} onClick={() => abrirEdicao(f)}><Icon id="edit" /></button>
        {apagar === f.id
          ? <button type="button" class="btn danger sm" onClick={() => { deleteFood(f.id); setApagar(null); commit(); toast("Registro apagado"); }}>Confirmar</button>
          : <button type="button" class="iconbtn" aria-label={`Apagar: ${f.text}`} onClick={() => { setApagar(f.id); setTimeout(() => setApagar((x) => (x === f.id ? null : x)), 3000); }}><Icon id="x" /></button>}
      </span>
    </div>)}
    <p class="tiny sub" style="margin-top:8px">Estimativa rápida no aparelho; o Chat (Haiku) confere com a TACO quando processa.</p>
  </Card>;
}
