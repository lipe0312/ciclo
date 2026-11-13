// Mini-assistente da 1ª vez em Academias (#41): 3 passos (tipo → nome → dias) e o lugar já nasce com os aparelhos certos.
// "Fazer manual" abre a lista e o passo a passo completo de sempre (mapa, aparelhos um a um, horários que lota).
import { useState } from "preact/hooks";
import { C, DEFAULT_GYMS, S } from "../../lib/store/index.ts";
import { go, href } from "../../lib/roteador/index.ts";
import { MiniAssistente } from "../../lib/mini-assistente/index.tsx";
import type { PassoMini } from "../../lib/mini-assistente/index.tsx";
import { toast } from "../../lib/ui/index.tsx";
import { DOW, DOW_NM } from "../../lib/util.ts";
import { salvarLugar } from "../../lib/lugares/index.ts";

type Tipo = "completa" | "basica" | "casa";
const TIPOS: [Tipo, string, string, number][] = [["completa", "Academia completa", "barras, polias e máquinas", 0], ["basica", "Academia básica", "halteres, banco e poucas máquinas", 1], ["casa", "Em casa", "halteres, elástico e barra fixa", 2]];
const nomeDe = (t: Tipo) => (t === "casa" ? "Casa" : `Academia ${S.gyms.filter((g) => (g.kind ?? "academia") === "academia").length + 1}`);

export function AssistenteAcademias({ onManual }: { onManual: () => void }) {
  // a resposta leve do quiz ("academia, casa ou os dois") já sugere o tipo
  const sugerido: Tipo = S.profile.places?.length === 1 && S.profile.places[0] === "casa" ? "casa" : "completa";
  const [tipo, setTipo] = useState<Tipo>(sugerido), [nome, setNome] = useState(() => nomeDe(sugerido)), [auto, setAuto] = useState(true);
  const [dias, setDias] = useState<C.Dow[]>([]);
  const nomeOk = nome.trim().length > 0 && nome.trim().length <= C.PLACE_NAME_MAX;
  const passos: PassoMini[] = [
    { id: "tipo", title: "Que tipo de lugar é?", sub: "Já marco os aparelhos mais comuns; dá para ajustar depois.", Tela: () =>
      <div class="opts">{TIPOS.map(([k, nm, d]) => <button type="button" key={k} class="opt big" aria-pressed={tipo === k} onClick={() => { setTipo(k); if (auto) setNome(nomeDe(k)); }}><b>{nm}</b><span>{d}</span></button>)}</div> },
    { id: "nome", title: "Como se chama?", sub: "Só para você reconhecer na lista.", ok: nomeOk, Tela: () => <>
      <label class="f" for="ass-nome">Nome</label>
      <input id="ass-nome" class="input" value={nome} maxLength={C.PLACE_NAME_MAX} autocomplete="off" onInput={(e) => { setAuto(false); setNome(e.currentTarget.value); }} />
      <p class="tiny sub" style="margin-top:4px">{nome.length} de {C.PLACE_NAME_MAX} letras</p></> },
    { id: "dias", title: "Em quais dias você vai lá?", sub: "É o lugar padrão desses dias. Se não souber, pule: dá para trocar em cada dia.", Tela: () => <>
      <div class="chips">{DOW.map((x, k) => <button type="button" key={x} class="chip tall" aria-pressed={dias.includes(x as C.Dow)}
        onClick={() => setDias((d) => C.DOWS.filter((w) => (w === x ? !d.includes(w) : d.includes(w))))}>{DOW_NM[k]}</button>)}</div>
      <p class="small sub" style="margin-top:10px">{dias.length ? `${dias.length} dia(s) por semana.` : "Nenhum dia marcado."}</p></> },
  ];
  return <MiniAssistente tela="academias" passos={passos} concluir="Salvar lugar" onManual={onManual} onFim={async () => {
    const base = DEFAULT_GYMS[TIPOS.find((t) => t[0] === tipo)![3]];
    const g = await salvarLugar(null, { name: nome, kind: tipo === "casa" ? "casa" : "academia", address: null, lat: null, lng: null, equipment: [...base.equipment], busyHours: [], weekdays: dias });
    toast("Lugar criado"); go(href("academias", [g.id]));
  }} />;
}
