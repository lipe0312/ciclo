// Base de alimentos (#43): os seus (mais usados primeiro) e os 30 comuns, com unidade caseira. Ajustar vale para os próximos registros.
import { useState } from "preact/hooks";
import { ALIMENTOS_COMUNS, dePorUnidade, porUnidade } from "@ciclo/core";
import type { Alimento } from "@ciclo/core";
import { commit } from "../../lib/store/index.ts";
import { FOODBASE, salvarAlimento, voltarAlimento } from "../../lib/store/regras.ts";
import { Card, Icon, toast } from "../../lib/ui/index.tsx";
import { SheetHead, closeSheet, openSheet } from "../../lib/folha/index.tsx";
import { fmt } from "../../lib/util.ts";

const num = (s: string) => { const n = Number(s.replace(",", ".")); return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null; };
const f1 = (n: number) => fmt(n, Number.isInteger(n) ? 0 : 1);
const unTxt = (a: Alimento) => a.unidades.map((u) => `1 ${u.nome} = ${f1(u.g)} g`).join(" · ");

/** Folha de ajuste: valores de 1 unidade caseira (como no rótulo), gravados por 100 g. */
function abrirAjuste(a: Alimento, pessoal: boolean) {
  const u0 = a.unidades[0], v = porUnidade(a, u0);
  const d = { nome: a.nome, g: String(u0.g), kcal: String(v.kcal), prot: String(v.prot), carb: String(v.carb), gord: String(v.gord), outras: a.unidades.slice(1).map((u) => String(u.g)) };
  const salvar = () => {
    const g = num(d.g), m = { kcal: num(d.kcal), prot: num(d.prot), carb: num(d.carb), gord: num(d.gord) };
    if (!g || g > 1000) return toast("Gramas da unidade: de 1 a 1000");
    if (Object.values(m).some((x) => x == null)) return toast("Calorias e macros: só números");
    const per100 = dePorUnidade(g, m as { kcal: number; prot: number; carb: number; gord: number });
    if (per100.kcal > 900 || per100.prot > 100 || per100.carb > 100 || per100.gord > 100) return toast("Valores altos demais para essa porção");
    const outras = d.outras.map(num);
    if (outras.some((x) => !x || x > 1000)) return toast("Gramas das unidades: de 1 a 1000");
    const unidades = [{ ...u0, g }, ...a.unidades.slice(1).map((u, i) => ({ ...u, g: outras[i]! }))];
    salvarAlimento(a.key, d.nome.trim().slice(0, 60), per100, unidades); commit(); closeSheet(); toast("Alimento ajustado · vale para os próximos registros");
  };
  const campo = (id: string, label: string, k: "kcal" | "prot" | "carb" | "gord") =>
    <div><label class="f" for={id}>{label}</label><input id={id} class="input num" inputMode="decimal" value={d[k]} onInput={(e) => { d[k] = e.currentTarget.value; }} /></div>;
  const view = () => <>
    <SheetHead kicker="Base de alimentos" title={`Ajustar: ${a.curto}`} />
    <p class="small sub" style="margin:8px 0">Vale para os próximos registros; os antigos ficam como estão. {a.fonte === "rotulo" ? "Valor inicial: média de rótulos." : "Valor inicial: TACO."}</p>
    <label class="f" for="al-nome">Nome</label>
    <input id="al-nome" class="input" maxLength={60} value={d.nome} onInput={(e) => { d.nome = e.currentTarget.value; }} />
    <label class="f" for="al-g" style="margin-top:10px;display:block">1 {u0.nome} tem quantos gramas?</label>
    <input id="al-g" class="input num" inputMode="decimal" value={d.g} onInput={(e) => { d.g = e.currentTarget.value; }} />
    <p class="small" style="margin-top:12px"><b>Em 1 {u0.nome}</b></p>
    <div class="grid g2" style="margin-top:6px;gap:10px">
      {campo("al-kcal", "Calorias (kcal)", "kcal")}{campo("al-prot", "Proteína (g)", "prot")}
      {campo("al-carb", "Carboidrato (g)", "carb")}{campo("al-gord", "Gordura (g)", "gord")}
    </div>
    {a.unidades.slice(1).map((u, i) => <div key={u.nome} style="margin-top:10px">
      <label class="f" for={`al-u${i}`}>1 {u.nome} tem quantos gramas?</label>
      <input id={`al-u${i}`} class="input num" inputMode="decimal" value={d.outras[i]} onInput={(e) => { d.outras[i] = e.currentTarget.value; }} />
    </div>)}
    <div class="row wrapx" style="margin-top:14px;gap:8px">
      <button type="button" class="btn pri" onClick={salvar}><Icon id="check" />Salvar</button>
      <button type="button" class="btn" onClick={closeSheet}>Cancelar</button>
      {pessoal && a.fonte === "usuario" && <button type="button" class="btn" onClick={() => { voltarAlimento(a.key); commit(); closeSheet(); toast("Voltou para a TACO"); }}>Voltar para a TACO</button>}
    </div>
  </>;
  openSheet(view);
}

function Linha({ a, pessoal }: { a: Alimento & { usos?: number }; pessoal: boolean }) {
  const v = porUnidade(a, a.unidades[0]);
  return <div class="food-row">
    <span class="tx"><b>{a.nome}</b>{a.fonte === "usuario" && <span class="sub"> · ajustado por você</span>}</span>
    <span class="tiny sub num">1 {a.unidades[0].nome}: {fmt(v.kcal)} kcal · {f1(v.prot)} g prot · {f1(v.carb)} g carbo · {f1(v.gord)} g gord{pessoal && a.usos ? ` · ${a.usos}×` : ""}<br />{unTxt(a)}</span>
    <span class="acts"><button type="button" class="iconbtn" aria-label={`Ajustar ${a.nome}`} onClick={() => abrirAjuste(a, pessoal)}><Icon id="edit" /></button></span>
  </div>;
}

export function BaseAlimentos() {
  const [comuns, setComuns] = useState(false);
  const meus = FOODBASE.itens, tem = new Set(meus.map((a) => a.key));
  const resto = ALIMENTOS_COMUNS.filter((a) => !tem.has(a.key));
  return <Card>
    <p class="kicker">Base de alimentos</p>
    <h2 style="margin-top:4px">Seus alimentos</h2>
    <p class="small sub" style="margin:4px 0 8px">O que você registra entra aqui e é reconhecido primeiro (“3 ovos e 2 pães”). Ajuste a porção ou os valores: vale para os próximos registros.</p>
    {meus.length === 0 ? <p class="small sub">Nada ainda. Registre uma refeição e os alimentos aparecem aqui.</p>
      : meus.map((a) => <Linha key={a.key} a={a} pessoal />)}
    <hr />
    <button type="button" class="btn ghost sm" aria-expanded={comuns} onClick={() => setComuns(!comuns)}>{comuns ? "Esconder os comuns" : `Ver os ${resto.length} alimentos comuns`}</button>
    {comuns && <div style="margin-top:6px">{resto.map((a) => <Linha key={a.key} a={a} pessoal={false} />)}</div>}
    <p class="tiny sub" style="margin-top:8px">Valores por unidade caseira, da TACO (NEPA/UNICAMP); whey pela média de rótulos.</p>
  </Card>;
}
