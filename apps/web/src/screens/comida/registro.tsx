// Registrar o que comeu (voz ou texto), registro rápido (igual ao típico, refeições salvas) e o histórico do dia com editar/apagar.
import { useState } from "preact/hooks";
import { MEALS, MEAL_NM, guessMeal } from "@ciclo/core";
import type { Meal } from "@ciclo/core";
import { S, commit, today } from "../../lib/store/index.ts";
import { DIET, addFood, deleteFood, deleteTemplate, editFood, estimarTexto, faltaDoDia, foodRows, foodTotals, hourNow, saveTemplate } from "../../lib/store/regras.ts";
import type { FoodRow } from "../../lib/store/regras.ts";
import { Card, Chip, Icon, toast } from "../../lib/ui/index.tsx";
import { BarraSimples } from "../../lib/grafico/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { addDays, fmt, longDate } from "../../lib/util.ts";

const CONF: Record<string, string> = { alta: "alta", media: "média", baixa: "baixa" };
const origem = (f: FoodRow) => (f.source === "claude" ? `Chat conferiu${f.confidence ? ` (confiança ${CONF[f.confidence] ?? f.confidence})` : ""}` : "estimativa do aparelho");
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

export function Registro({ dia }: { dia: string }) {
  const [status, setStatus] = useState("");
  const [meal, setMeal] = useState<Meal | null>(null);
  const [gerenciar, setGerenciar] = useState(false);
  const draft = S.ui.foodDraft ?? "";
  const est = estimarTexto(draft), parts = est.partes;
  const kcal = est.kcal, prot = Math.round(est.prot);
  const parteTxt = (p: (typeof parts)[number]) => p.texto + (p.fonte === "pessoal" ? " (sua base)" : "");
  const registrar = () => {
    const v = draft.trim(); if (!v) return toast("Fale ou escreva o que comeu");
    addFood(v, meal ?? guessMeal(v, hourNow()), undefined, dia); S.ui.foodDraft = ""; setMeal(null); setStatus(""); commit(); toast("Registrado · o Chat confere");
  };
  const typical = (S.profile.diet.typical || "").trim();
  const igualAoTipico = () => {
    if (!typical) return toast("Conte seu dia típico no Perfil para usar este atalho");
    addFood(typical, null, undefined, dia); commit(); toast("Dia normal registrado");
  };
  return <Card>
    <h2>O que você comeu?</h2>
    <p class="small sub" style="margin:4px 0 12px">Fale como falaria: “três ovos, dois pães e um whey”.</p>
    <div class="row start" style="gap:12px">
      <Mic grande value={draft} onChange={(v) => { S.ui.foodDraft = v; commit(); }} label="Gravar o que comeu" onStatus={setStatus} />
      <textarea class="input" style="flex:1;min-width:0" rows={4} aria-label="O que você comeu" placeholder="café: 3 ovos e 2 pães · almoço: arroz, feijão e frango" value={draft}
        onInput={(e) => { S.ui.foodDraft = e.currentTarget.value; }} onBlur={() => commit()} />
    </div>
    <p class="small est-line num" style="margin-top:8px" aria-live="polite">{draft.trim() ? (kcal ? <>~{fmt(kcal)} kcal · {fmt(prot)} g de proteína <span class="sub">({parts.map(parteTxt).join(" · ")})</span></> : <span class="sub">Não reconheci os alimentos; o Chat estima na conferência.</span>) : <span class="sub">A estimativa aparece aqui enquanto você fala.</span>}</p>
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
  const f = faltaDoDia(dia), d = S.profile.diet, t = foodTotals(dia);
  if (!f.sugestoes.length) return <p class="small" style="margin-top:10px"><b>Proteína batida{f.kcal ? `; faltam ~${fmt(f.kcal)} kcal para a meta` : ""}.</b> O resto é livre.</p>;
  return <div style="margin-top:10px">
    <p class="small num"><b>Faltam {fmt(f.prot)} g de proteína{f.kcal ? <> e ~{fmt(f.kcal)} kcal</> : ""}.</b> <span class="sub">({fmt(t.prot)} de {fmt(d.protein)} g · {fmt(t.kcal)} de {fmt(d.kcal)} kcal)</span></p>
    <ul class="small" style="margin:6px 0 0;padding-left:18px">{f.sugestoes.map((s) => <li key={s.texto} class="num">{s.texto} <span class="sub">(~{fmt(s.kcal)} kcal)</span></li>)}</ul>
  </div>;
}

/** O dia escolhido (hoje por padrão): totais contra a meta, registros com editar e apagar, e navegação pelos últimos dias. */
export function DiaCard({ dia, setDia }: { dia: string; setDia: (d: string) => void }) {
  const d = S.profile.diet, t = foodTotals(dia), rows = foodRows().filter((f) => f.date === dia);
  const [apagar, setApagar] = useState<string | null>(null);
  const min = addDays(today, -13);
  return <Card>
    <div class="row between">
      <button type="button" class="iconbtn" aria-label="Dia anterior" disabled={dia <= min} onClick={() => setDia(addDays(dia, -1))}><Icon id="back" /></button>
      <div style="text-align:center"><h2>{dia === today ? "Hoje" : longDate(dia)}</h2>{dia !== today && <button type="button" class="btn ghost sm" onClick={() => setDia(today)}>Voltar para hoje</button>}</div>
      <button type="button" class="iconbtn" aria-label="Próximo dia" disabled={dia >= today} onClick={() => setDia(addDays(dia, 1))}><Icon id="arrow" /></button>
    </div>
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
