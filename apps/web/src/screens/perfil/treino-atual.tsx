// #74 "Meu treino atual" (Perfil de treino → Meu treino atual; atalho no Treino). Opcional: nunca trava gerar o treino.
// 1º nível só grupos grandes (Ombro, nunca "Ombro posterior"); dentro do grupo, os exercícios mais comuns com foto pequena e,
// discreto, o "Digite você mesmo" (busca em todo o catálogo; o que não existir vira exercício livre, sem id).
// Cada toque grava no perfil (PUT com debounce, igual ao resto do Perfil). Texto da pessoa só vai como texto (Preact escapa).
import { useEffect, useRef, useState } from "preact/hooks";
import { C, S, commit } from "../../lib/store/index.ts";
import { EXB, profileChanged } from "../../lib/store/regras.ts";
import { SERVER, send } from "../../lib/api/index.ts";
import { go } from "../../lib/roteador/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { img } from "../../lib/util.ts";
import { regenerar } from "../semana/estado.ts";
import "./treino-atual.css";

type G = C.GrupoTreino;
const TOPO = 8; // exercícios por grupo antes do "Ver todos"
const expandidos = new Set<string>();
const salvar = () => { profileChanged(); commit(); };
const treino = () => S.profile.treinoAtual as C.TreinoAtual | undefined;
const nomeEx = (it: C.ItemTreinoAtual) => (C.ehLivre(it) ? it.nome : EXB[it.id]?.nm ?? it.id);
const grupoDoItem = (it: C.ItemTreinoAtual): G | null => (C.ehLivre(it) ? it.grupo : EXB[it.id] ? C.grupoDoExercicio(EXB[it.id]) : null);

function addExercicio(d: C.DivisaoAtual, id: string) {
  if (d.exercicios.some((x) => !C.ehLivre(x) && x.id === id)) return;
  if (d.exercicios.length >= C.TREINO_ATUAL_LIM.exercicios) return toast(`Até ${C.TREINO_ATUAL_LIM.exercicios} exercícios por treino`);
  d.exercicios.push({ id });
  const g = C.grupoDoExercicio(EXB[id]);
  if (!d.grupos.includes(g)) d.grupos.push(g);
  salvar();
}
function addLivre(d: C.DivisaoAtual, texto: string, g: G): boolean {
  const nome = C.textoLivreValido(texto, C.TREINO_ATUAL_LIM.livre);
  if (!nome) { toast(`Use de 2 a ${C.TREINO_ATUAL_LIM.livre} letras, sem < >`); return false; }
  if (d.exercicios.some((x) => C.ehLivre(x) && C.norm(x.nome) === C.norm(nome))) return true;
  if (d.exercicios.length >= C.TREINO_ATUAL_LIM.exercicios) { toast(`Até ${C.TREINO_ATUAL_LIM.exercicios} exercícios por treino`); return false; }
  d.exercicios.push({ nome, grupo: g }); salvar(); return true;
}
const tirar = (d: C.DivisaoAtual, it: C.ItemTreinoAtual) => { d.exercicios = d.exercicios.filter((x) => x !== it); salvar(); };

/** Destaque do trecho buscado com <span> (nunca HTML). */
function Destaque({ nome, q }: { nome: string; q: string }) {
  const [a, b, c] = C.destacarBusca(nome, q);
  return <span>{a}{b && <span class="ta-hl">{b}</span>}{c}</span>;
}

/** "Digite você mesmo": combobox ARIA (setas, Enter, Esc). Sugestões sem imagem; o que não existir vira "personalizado". */
function DigiteVoce({ d, g, uid }: { d: C.DivisaoAtual; g: G; uid: string }) {
  const [aberto, setAberto] = useState(false), [q, setQ] = useState(""), [ativo, setAtivo] = useState(-1), [mostra, setMostra] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mostra) ref.current?.focus(); }, [mostra]);
  if (!mostra) return <button type="button" class="ta-digite" onClick={() => setMostra(true)}>Não achou? Digite você mesmo</button>;
  const sug = C.buscarExercicioAtual(q, 6);
  const livre = C.textoLivreValido(q, C.TREINO_ATUAL_LIM.livre);
  const exato = sug.some((e) => C.norm(e.nm) === C.norm(q));
  const opcoes: ({ tipo: "ex"; ex: C.Exercise } | { tipo: "livre"; nome: string })[] = [...sug.map((ex) => ({ tipo: "ex" as const, ex })), ...(livre && !exato ? [{ tipo: "livre" as const, nome: livre }] : [])];
  const lb = `${uid}-lb`, exp = aberto && q.trim().length > 0 && opcoes.length > 0;
  const escolher = (k: number) => {
    const o = opcoes[k]; if (!o) return;
    const ok = o.tipo === "ex" ? (addExercicio(d, o.ex.id), true) : addLivre(d, o.nome, g);
    if (ok) { setQ(""); setAtivo(-1); setAberto(false); }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(opcoes.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (opcoes.length) escolher(ativo >= 0 ? ativo : 0); }
    else if (e.key === "Escape") { if (exp) { e.preventDefault(); setAberto(false); setAtivo(-1); } else { setMostra(false); setQ(""); } }
  };
  return <div class="ta-busca">
    <label class="tiny sub" for={`${uid}-in`}>Digite o nome (busca em todos os exercícios)</label>
    <input id={`${uid}-in`} ref={ref} class="input" type="text" role="combobox" autoComplete="off" maxLength={C.TREINO_ATUAL_LIM.livre}
      aria-expanded={exp} aria-controls={lb} aria-autocomplete="list" aria-activedescendant={exp && ativo >= 0 ? `${lb}-${ativo}` : undefined}
      value={q} placeholder="ex.: crucifixo inverso" onInput={(e) => { setQ(e.currentTarget.value); setAberto(true); setAtivo(-1); }} onKeyDown={onKey}
      onBlur={() => setTimeout(() => setAberto(false), 150)} />
    {exp && <ul id={lb} role="listbox" class="ta-lb" aria-label="Sugestões">{opcoes.map((o, k) =>
      <li key={o.tipo === "ex" ? o.ex.id : "livre"} id={`${lb}-${k}`} role="option" aria-selected={k === ativo} class={k === ativo ? "on" : ""}
        onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(k)}>
        {o.tipo === "ex" ? <><Destaque nome={o.ex.nm} q={q} />{C.partePrincipal(o.ex) && <small>{C.parteCurta(C.partePrincipal(o.ex)!)}</small>}</>
          : <><span>Adicionar “{o.nome}”</span><small>personalizado · {C.GRUPO_TREINO_NM[g]}</small></>}
      </li>)}</ul>}
  </div>;
}

function Grupo({ d, g, idx }: { d: C.DivisaoAtual; g: G; idx: number }) {
  const lista = C.exerciciosDoGrupo(g), chave = `${idx}:${g}`, todos = expandidos.has(chave);
  const marcado = (id: string) => d.exercicios.some((x) => !C.ehLivre(x) && x.id === id);
  const vis = todos ? lista : lista.filter((e, k) => k < TOPO || marcado(e.id));
  const n = d.exercicios.filter((x) => grupoDoItem(x) === g).length;
  return <section class="ta-grupo" id={`ta-g-${g}`} aria-label={C.GRUPO_TREINO_NM[g]}>
    <h3>{C.GRUPO_TREINO_NM[g]} <span class="tiny sub num">{n ? `${n} escolhido${n > 1 ? "s" : ""}` : "toque nos que você faz"}</span></h3>
    <div class="ta-grid">{vis.map((e) => { const on = marcado(e.id), parte = C.partePrincipal(e);
      return <button type="button" key={e.id} class="ta-ex" aria-pressed={on} onClick={() => on ? tirar(d, d.exercicios.find((x) => !C.ehLivre(x) && x.id === e.id)!) : addExercicio(d, e.id)}>
        <img src={img(e.id)} alt="" loading="lazy" width={40} height={40} /><span><b>{e.nm}</b>{parte && <small>{C.parteCurta(parte)}</small>}</span></button>; })}</div>
    {!todos && lista.length > vis.length && <button type="button" class="ta-digite" onClick={() => { expandidos.add(chave); commit(); }}>Ver todos de {C.GRUPO_TREINO_NM[g]} ({lista.length})</button>}
    <DigiteVoce d={d} g={g} uid={`ta-${idx}-${g}`} />
  </section>;
}

/** "Como você faz" (opcional): séries × reps e carga aproximada. Valor fora do limite não grava. */
function ComoFaz({ it }: { it: C.ExercicioAtual }) {
  const campo = (k: "sets" | "reps" | "kg", rot: string, lo: number, hi: number, dec = false) =>
    <label class="ta-num"><span class="tiny sub">{rot}</span><input class="input num" type="text" inputMode={dec ? "decimal" : "numeric"} autoComplete="off" value={it[k] == null ? "" : String(it[k]).replace(".", ",")}
      aria-label={`${rot} de ${EXB[it.id]?.nm ?? it.id}`}
      onChange={(e) => { const t = e.currentTarget.value.trim().replace(",", "."), x = Number(t);
        if (!t) delete it[k]; else if (Number.isFinite(x) && x >= lo && x <= hi && (dec || Number.isInteger(x))) it[k] = dec ? Math.round(x * 10) / 10 : x; else { toast(`${rot}: de ${lo} a ${hi}`); commit(); return; }
        salvar(); }} /></label>;
  return <div class="ta-faz">{campo("sets", "séries", 1, 10)}{campo("reps", "reps", 1, 50)}{campo("kg", "kg", 0, 600, true)}</div>;
}

function Divisao({ d, idx, onRemover }: { d: C.DivisaoAtual; idx: number; onRemover: () => void }) {
  const [nome, setNome] = useState(d.nome);
  useEffect(() => setNome(d.nome), [d]);
  const toggle = (g: G) => { d.grupos = d.grupos.includes(g) ? d.grupos.filter((x) => x !== g) : C.GRUPOS_TREINO.filter((x) => x === g || d.grupos.includes(x)); salvar(); };
  return <div class="ta-div" role="tabpanel" id={`ta-p-${idx}`} aria-labelledby={`ta-t-${idx}`}>
    <label class="f" for={`ta-nome-${idx}`}>Nome do treino</label>
    <input id={`ta-nome-${idx}`} class="input" type="text" maxLength={C.TREINO_ATUAL_LIM.nome} value={nome} placeholder={C.nomeDivisaoPadrao(idx)}
      onInput={(e) => { const v = e.currentTarget.value; setNome(v); const ok = C.textoLivreValido(v, C.TREINO_ATUAL_LIM.nome, 1); if (ok) { d.nome = ok; salvar(); } }} />
    <span class="f" style="margin-top:14px">Grupos deste treino</span>
    <div class="chips ta-grupos" role="group" aria-label="Grupos deste treino">{C.GRUPOS_TREINO.map((g) => <button type="button" key={g} class="chip tall" aria-pressed={d.grupos.includes(g)} onClick={() => toggle(g)}>{C.GRUPO_TREINO_NM[g]}</button>)}</div>
    {!d.grupos.length && <p class="tiny sub" style="margin-top:6px">Ex.: Treino A = Peito + Tríceps. Escolha os grupos e depois os exercícios.</p>}
    {d.grupos.map((g) => <Grupo key={g} d={d} g={g} idx={idx} />)}
    {d.exercicios.length > 0 && <div class="ta-sel"><span class="f">Como você faz <span class="sub">(opcional: ajuda a acertar a 1ª carga)</span></span>
      {d.exercicios.map((it) => <div class="ta-item" key={C.ehLivre(it) ? "l:" + it.nome : it.id}>
        <div class="ta-item-nm"><b>{nomeEx(it)}</b>
          <span class="tiny sub">{C.ehLivre(it) ? <><span class="badge">personalizado</span> {C.GRUPO_TREINO_NM[it.grupo]}</> : (() => { const p = C.partePrincipal(EXB[it.id] ?? {}); return p ? C.parteCurta(p) : ""; })()}</span></div>
        {!C.ehLivre(it) && <ComoFaz it={it} />}
        <button type="button" class="btn ghost sm ta-x" aria-label={`Tirar ${nomeEx(it)}`} onClick={() => tirar(d, it)}><Icon id="x" /></button>
      </div>)}</div>}
    <button type="button" class="btn ghost sm" style="margin-top:14px" onClick={onRemover}>Remover este treino</button>
  </div>;
}

function Cobertura({ d, abrir }: { d: C.DivisaoAtual | null; abrir: (i: number) => void }) {
  const t = treino(), cob = C.coberturaTreinoAtual(t);
  const ir = (g: G) => {
    const i = (t?.divisoes ?? []).findIndex((x) => x.exercicios.some((it) => grupoDoItem(it) === g));
    if (i >= 0) abrir(i); else if (d && !d.grupos.includes(g)) { d.grupos.push(g); d.grupos = C.GRUPOS_TREINO.filter((x) => d.grupos.includes(x)); salvar(); }
    setTimeout(() => (document.getElementById(`ta-g-${g}`) as (HTMLElement & { scrollIntoView?: (o: object) => void }) | null)?.scrollIntoView?.({ block: "start" }), 50);
  };
  return <div class="ta-cob" role="group" aria-label="Grupos com exercício informado">
    {cob.map((c) => <button type="button" key={c.grupo} class={`ta-cob-c${c.informado ? " on" : ""}`} onClick={() => ir(c.grupo)}
      aria-label={`${C.GRUPO_TREINO_NM[c.grupo]}: ${c.informado ? `${c.n} exercício${c.n > 1 ? "s" : ""}` : "nenhum ainda"}`}>
      {C.GRUPO_TREINO_NM[c.grupo]}{c.informado && <Icon id="check" />}</button>)}
  </div>;
}

export default function TreinoAtual() {
  const [aba, setAba] = useState(0), [busy, setBusy] = useState(false);
  const t = treino(), divs = t?.divisoes ?? [];
  const resposta = !t ? null : divs.length ? "sim" : "nao";
  const i = Math.min(aba, Math.max(0, divs.length - 1)), d = divs[i] ?? null;
  const novaDivisao = () => {
    const tt = (S.profile.treinoAtual ??= { divisoes: [] });
    if (tt.divisoes.length >= C.TREINO_ATUAL_LIM.divisoes) return toast(`Até ${C.TREINO_ATUAL_LIM.divisoes} treinos`);
    tt.divisoes.push({ nome: C.nomeDivisaoPadrao(tt.divisoes.length), grupos: [], exercicios: [] });
    setAba(tt.divisoes.length - 1); salvar();
  };
  const sim = () => { if (!divs.length) novaDivisao(); };
  const nao = () => {
    if (divs.some((x) => x.exercicios.length) && !confirm("Apagar os treinos que você cadastrou?")) return;
    S.profile.treinoAtual = { divisoes: [] }; salvar();
  };
  const remover = () => {
    if (!t || !d) return;
    if (d.exercicios.length && !confirm(`Remover "${d.nome}"?`)) return;
    t.divisoes = t.divisoes.filter((x) => x !== d); setAba(Math.max(0, i - 1)); salvar();
  };
  const refazer = async () => {
    setBusy(true);
    try {
      if (SERVER) await send("PUT", "/api/profile", { data: S.profile });
      if (await regenerar(false)) go("#semana");
    } finally { setBusy(false); }
  };
  const total = divs.reduce((a, x) => a + x.exercicios.length, 0);
  return <div class="ta">
    <p class="small sub">Sem cadastro, a geração funciona igual; com ele, entram primeiro os exercícios que você já faz.</p>
    <span class="f" style="margin-top:14px">Você já treina?</span>
    <div class="opts two">
      <button type="button" class="opt big" aria-pressed={resposta === "nao"} onClick={nao}><b>Não, estou começando</b><span>o app escolhe os mais eficientes e comuns</span></button>
      <button type="button" class="opt big" aria-pressed={resposta === "sim"} onClick={sim}><b>Sim</b><span>conte os treinos que você já faz</span></button>
    </div>
    {resposta === "nao" && <div class="note" style="margin-top:12px"><Icon id="info" /><span>Sem problema: o gerador escolhe os exercícios que mais trabalham cada parte do músculo e, no empate, os mais comuns na academia.</span></div>}
    {resposta === "sim" && <>
      <Cobertura d={d} abrir={setAba} />
      <div class="ta-tabs" role="tablist" aria-label="Seus treinos">{divs.map((x, k) =>
        <button type="button" key={k} role="tab" id={`ta-t-${k}`} aria-selected={k === i} aria-controls={`ta-p-${k}`} class={`chip tall${k === i ? " on" : ""}`} onClick={() => setAba(k)}>{x.nome}</button>)}
        {divs.length < C.TREINO_ATUAL_LIM.divisoes && <button type="button" class="chip tall ta-add" onClick={novaDivisao}><Icon id="plus" />Adicionar treino</button>}</div>
      {d && <Divisao key={i} d={d} idx={i} onRemover={remover} />}
    </>}
    <div class="ta-cta">
      <p class="tiny sub" role="status">{resposta === "sim" ? `${divs.length} treino${divs.length > 1 ? "s" : ""} · ${total} exercício${total === 1 ? "" : "s"} · salva sozinho a cada toque` : "Salva sozinho a cada toque."}</p>
      {resposta && <button type="button" class="btn pri full" disabled={busy} onClick={refazer}><Icon id="cycle" />{busy ? "Refazendo…" : "Salvar e refazer a semana"}</button>}
    </div>
  </div>;
}
