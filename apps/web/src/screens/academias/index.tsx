// Academias: aparelhos de cada academia (grade com imagens), horários de lotação e academia padrão por dia.
import { C, S, commit, today } from "../../lib/store/index.ts";
import { gymById, gymChanged, profileChanged } from "../../lib/store/regras.ts";
import { Chip, Icon } from "../../lib/ui/index.tsx";
import { EQ_CATS, GradeAparelhos } from "../../lib/grade-aparelhos/index.tsx";
import { DOW, DOW_NM, dowIdx } from "../../lib/util.ts";

export function GymEditor() {
  const g = gymById(S.ui.gymTab), p = S.profile;
  if (!g) return null;
  const ch = () => { gymChanged(g); commit(); };
  return <>
    <div class="tabs">{S.gyms.map((x) => <Chip key={x.id} on={x.id === g.id} onClick={() => { S.ui.gymTab = x.id; commit(); }}>{x.name}</Chip>)}
      <Chip onClick={() => { const id = "acad" + (S.gyms.length + 1) + "_" + Math.random().toString(36).slice(2, 5); S.gyms.push({ id, name: `Academia ${S.gyms.length + 1}`, equipment: ["halteres", "banco"], busyHours: [] }); S.ui.gymTab = id; gymChanged(gymById(id)); commit(); }}><Icon id="plus" />Nova</Chip></div>
    <div class="row wrapx" style="margin-top:12px;gap:10px"><input class="input" value={g.name} maxLength={40} style="max-width:220px" aria-label="Nome da academia" onChange={(e) => { g.name = e.currentTarget.value.trim().slice(0, 40) || g.name; ch(); }} />
      <span class="badge num">{g.equipment.length} de {C.EQUIPMENT.length}</span>
      <button type="button" class="btn sm" onClick={() => { g.equipment = C.EQUIPMENT.map((e) => e.id); ch(); }}>Completa</button><button type="button" class="btn sm" onClick={() => { g.equipment = []; ch(); }}>Limpar</button></div>
    <div class="chips" style="margin:12px 0">{EQ_CATS.filter(([k]) => k === "todos" || C.EQUIPMENT.some((e) => e.cat === k)).map(([k, n]) => <Chip key={k} on={S.ui.cat === k} onClick={() => { S.ui.cat = k; commit(); }}>{n}</Chip>)}</div>
    <GradeAparelhos selected={g.equipment} cat={S.ui.cat} onToggle={(id) => { const i = g.equipment.indexOf(id); i >= 0 ? g.equipment.splice(i, 1) : g.equipment.push(id); ch(); }} />
    <div style="margin-top:16px"><span class="f">Horários em que lota</span><div class="chips">{["6-8", "12-14", "17-18", "18-20", "20-22"].map((h) => <Chip key={h} on={g.busyHours.includes(h)} onClick={() => { const i = g.busyHours.indexOf(h); i >= 0 ? g.busyHours.splice(i, 1) : g.busyHours.push(h); ch(); }}>{h.replace("-", "–")}h</Chip>)}</div></div>
    <div style="margin-top:16px"><span class="f">Academia padrão por dia (dá para trocar no dia)</span><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
      {DOW.map((d, i) => <label key={d} class="small">{DOW_NM[i]}<select class="input" value={p.dayGym[d]} onChange={(e) => { p.dayGym[d] = e.currentTarget.value; profileChanged(); if (d === DOW[dowIdx(today)]) S.ui.gymId = e.currentTarget.value; commit(); }}>
        {S.gyms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>)}</div></div>
    <div class="note" style="margin-top:16px"><Icon id="cam" /><span>Fotos e vídeos do <b>seu</b> aparelho entram na montagem do treino (botão “Gravar” em cada exercício), não aqui.</span></div>
  </>;
}
export default function Academias() {
  return <><p class="kicker">Onde você treina</p><h1 style="margin-bottom:14px">Academias</h1><div class="card"><GymEditor /></div></>;
}
