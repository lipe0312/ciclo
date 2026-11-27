// #147 Evolução (#evolucao/<aba>?p=<período>[&de=AAAA-MM&ate=AAAA-MM]): Treino · Comida · Saúde · Corpo, o mesmo filtro de
// período em todas (Semana · Mês · 3 meses · 6 meses · 1 ano · Tudo · Personalizado de 2 a 12 meses). Cada número vem escrito,
// com a diferença em palavras contra o período anterior e contra o começo, e com quantos dias foram registrados (a queda foi
// real ou foi esquecimento?). Os gráficos são os mesmos do detalhe do treino (#159). Baixa sob demanda.
import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { CUSTOM_MESES, PERIODOS_EVO, PERIODO_NM, difTextoEvo, mesDe, somaMeses } from "@ciclo/core/evolucao";
import type { Aba, Balde, Cob, EvolucaoView, Grupo, JanelaEvo, PeriodoEvo, SerieEvo } from "@ciclo/core/evolucao";
import { C, S, calc, today } from "../../lib/store/index.ts";
import { mName } from "../../lib/store/regras.ts";
import { Card, Chip, Icon, Seg } from "../../lib/ui/index.tsx";
import { Esqueleto, Estado } from "../../lib/estado/index.tsx";
import { href, replace } from "../../lib/roteador/index.ts";
import type { Route } from "../../lib/roteador/index.ts";
import { fmt } from "../../lib/util.ts";
import { ColunasValor, LinhaValor } from "../treino-resumo/graficos.tsx";
import { carregarEvolucao, marcarVistas, nomeExercicio } from "./estado.ts";
import type { Resultado } from "./estado.ts";
import "../treino-resumo/treino-resumo.css";
import "./evolucao.css";

const ABAS: [Aba, string][] = [["treino", "Treino"], ["comida", "Comida"], ["saude", "Saúde"], ["corpo", "Corpo"]];
const ABA_NM = Object.fromEntries(ABAS) as Record<Aba, string>;
const PADRAO: PeriodoEvo = "3m";
const GRUPO_NM: Record<Grupo, string> = { dia: "por dia", semana: "por semana", mes: "por mês" };
const ANDAMENTO: Record<Grupo, string> = { dia: "hoje", semana: "semana em andamento", mes: "mês em andamento" };
const VAZIO: Record<Aba, [string, string, string]> = {
  treino: ["Os gráficos aparecem depois dos primeiros treinos.", "Ver o Treino de hoje", "#treino"],
  comida: ["A média aparece depois dos primeiros dias com comida registrada.", "Registrar comida", "#comida"],
  saude: ["Água, sono e álcool vêm do check-in e do checkout do Diário.", "Abrir o Diário", "#diario"],
  corpo: ["O peso vem do check-in; braço, cintura e ombro, das medidas.", "Medir agora", "#corpo"],
};

const ano = today.slice(0, 4);
const dm = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: iso.slice(0, 4) === ano ? undefined : "numeric", timeZone: "UTC" })
  .format(new Date(iso + "T12:00:00Z")).replace(/\./g, "");
const faixa = (a: string, b: string) => (a === b ? dm(a) : `${dm(a)} a ${dm(b)}`);
const pl = (n: number | null, s: string, p: string) => (n === 1 ? s : p);
const val = (v: number | null, casas = 0, unit = "") => (v == null ? "—" : `${fmt(v, casas)}${unit}`);
const rotLongo = (b: Balde, g: Grupo) => `${g === "semana" ? faixa(b.inicio, b.fim) : g === "dia" ? dm(b.inicio) : b.rotulo}${b.andamento ? " (em andamento)" : ""}`;

export default function Evolucao({ route }: { route: Route }) {
  const aba = (ABAS.some(([a]) => a === route.parts[0]) ? route.parts[0] : "treino") as Aba;
  const q = route.query, p = ((PERIODOS_EVO as readonly string[]).includes(q.p) ? q.p : PADRAO) as PeriodoEvo;
  const mesHoje = mesDe(today), de = q.de ?? somaMeses(mesHoje, -2), ate = q.ate ?? mesHoje;
  const key = p === "custom" ? `${p}|${de}|${ate}` : p;
  const [res, setRes] = useState<{ key: string; r: Resultado } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let vivo = true;
    void carregarEvolucao(p, p === "custom" ? { de, ate } : {}).then((r) => { if (vivo) setRes({ key, r }); });
    return () => { vivo = false; };
  }, [key, tick]);
  const r = res?.key === key ? res.r : null, v = r?.ok ? r.view : null;
  useEffect(() => { if (v?.conquistas.length) marcarVistas(v.conquistas.map((c) => c.id)); }, [v]);
  const rota = (o: { aba?: Aba; p?: PeriodoEvo; de?: string; ate?: string }) => {
    const pp = o.p ?? p;
    return href("evolucao", [o.aba ?? aba], { p: pp === PADRAO ? null : pp, de: pp === "custom" ? o.de ?? de : null, ate: pp === "custom" ? o.ate ?? ate : null });
  };
  const ir = (o: { aba?: Aba; p?: PeriodoEvo; de?: string; ate?: string }) => replace(rota(o));

  const cab = <div style="margin:4px 0 12px"><p class="kicker">Evolução</p><h1>Sua evolução</h1>
    <p class="small sub" style="margin-top:4px">Quanto mudou no período, contra o período anterior de mesmo tamanho e contra o começo.</p>
    <div class="evo-filtros">
      <Seg<Aba> label="Área" opts={ABAS} value={aba} onPick={(a) => ir({ aba: a })} cls="evo-abas" />
      <div class="chips" role="group" aria-label="Período">{PERIODOS_EVO.map((x) => <Chip key={x} on={x === p} onClick={() => ir({ p: x })}>{PERIODO_NM[x]}</Chip>)}</div>
      {p === "custom" && <Personalizado de={de} ate={ate} onPick={(d, a) => ir({ p: "custom", de: d, ate: a })} erro={r && !r.ok && !r.rede ? r.erro : null} />}
    </div></div>;
  if (!r) return <>{cab}<Esqueleto linhas={4} /></>;
  if (!r.ok) return <>{cab}{r.rede && <Estado tipo={navigator.onLine ? "erro" : "offline"} acao={{ label: "Tentar de novo", onClick: () => setTick((t) => t + 1) }}>{r.erro}</Estado>}</>;
  const j = v!.janela;
  const periodo = <p class="small sub num evo-per" role="status">{faixa(j.inicio, j.ate)} · {GRUPO_NM[j.grupo]}
    {j.anterior ? ` · comparado com ${faixa(j.anterior.inicio, j.anterior.fim)}` : j.periodo === "tudo" && j.comeco ? " · o mês atual comparado com o primeiro" : ""}</p>;
  const [txt, cta, h] = VAZIO[aba];
  const vazio = !v!.baldes.length || !v![aba].temDados;
  return <>{cab}{periodo}
    <Conquistas v={v!} aba={aba} rota={(a) => rota({ aba: a })} />
    {vazio ? <Estado tipo="vazio" titulo="Precisa de mais registros" acao={{ label: cta, href: h }}>{txt}</Estado>
      : <div class="stack evo-lista">{aba === "treino" ? <AbaTreino v={v!} /> : aba === "comida" ? <AbaComida v={v!} /> : aba === "saude" ? <AbaSaude v={v!} /> : <AbaCorpo v={v!} />}</div>}</>;
}

function Personalizado({ de, ate, onPick, erro }: { de: string; ate: string; onPick: (de: string, ate: string) => void; erro: string | null }) {
  const max = mesDe(today), min = somaMeses(max, -59);
  const muda = (campo: "de" | "ate") => (e: Event) => { const x = (e.currentTarget as HTMLInputElement).value; if (x) onPick(campo === "de" ? x : de, campo === "ate" ? x : ate); };
  return <div class="evo-custom">
    <div class="evo-meses"><div><label class="f" for="evoDe">De (mês)</label><input class="input num" id="evoDe" type="month" min={min} max={max} value={de} onChange={muda("de")} /></div>
      <div><label class="f" for="evoAte">Até (mês)</label><input class="input num" id="evoAte" type="month" min={min} max={max} value={ate} onChange={muda("ate")} /></div></div>
    <p class="tiny sub">De {CUSTOM_MESES.min} a {CUSTOM_MESES.max} meses, de um mês a outro, até o mês atual.</p>
    {erro && <p class="small" role="alert" style="color:var(--warn);margin-top:4px">Período personalizado: {erro}.</p>}
  </div>;
}

function Conquistas({ v, aba, rota }: { v: EvolucaoView; aba: Aba; rota: (a: Aba) => string }) {
  if (!v.conquistas.length) return null;
  return <Card cls="hl evo-conq" aria-label="Conquistas do período"><p class="kicker">Conquistas do período</p>
    <ul class="evo-conq-l">{v.conquistas.map((c) => <li key={c.id}><Icon id="check" style="color:var(--acc);flex:none;margin-top:2px" />
      <span class="small" style="flex:1">{c.texto}</span>
      {c.aba !== aba && <a class="link44 small evo-ir" href={rota(c.aba)} aria-label={`Ver ${ABA_NM[c.aba]}`}>{ABA_NM[c.aba]}<Icon id="arrow" /></a>}</li>)}</ul></Card>;
}

// ---------- um número com comparação, cobertura e (se couber) gráfico ----------
interface MetricaP {
  v: EvolucaoView; titulo: string; sub?: string; valor: string; s: SerieEvo; un: readonly [string, string]; casas?: number; unit: string;
  grafico?: "colunas" | "linha" | null; meta?: number; metaTxt?: string; max?: number;
  /** como ler a cobertura de cada barra */ cob: (c: Cob) => string; cobLeg?: string; resumo: string;
  extra?: ComponentChildren;
}
function Comparacao({ s, un, casas = 0, unit, j }: { s: SerieEvo; un: readonly [string, string]; casas?: number; unit: string; j: JanelaEvo }) {
  const tudo = j.periodo === "tudo";
  return <ul class="evo-cmp small">
    {!tudo && <li>{difTextoEvo(s.difAnterior, un, "anterior", casas)}{s.anterior != null && <span class="sub"> · antes {val(s.anterior, casas, unit)}</span>}</li>}
    {(s.comeco != null || j.comeco) && <li>{tudo && "Mês atual: "}{difTextoEvo(s.difComeco, un, "comeco", casas)}{s.comeco != null && <span class="sub"> · no começo {val(s.comeco, casas, unit)}</span>}</li>}
  </ul>;
}
function Metrica(m: MetricaP) {
  const { v, s, casas = 0 } = m, j = v.janela, n = v.baldes.length, rot = v.baldes.map((b) => b.rotulo);
  const larg = Math.max(1, ...s.baldes.map((x) => (x == null ? 1 : fmt(x, casas).length))) * 7 + 6;
  return <Card cls="evo-bloco">
    <div class="row between start wrapx" style="gap:8px"><h2>{m.titulo}</h2>{m.sub && <span class="small sub">{m.sub}</span>}</div>
    <p class="num evo-v">{m.valor}</p>
    <Comparacao s={s} un={m.un} casas={casas} unit={m.unit} j={j} />
    {m.extra}
    {m.grafico && n >= 2 && (m.grafico === "linha"
      ? <LinhaValor values={s.baldes} rotulos={rot} label={m.titulo} unit={m.unit} />
      : <ColunasValor values={s.baldes} rotulos={rot} label={m.titulo} unit={m.unit} casas={casas} meta={m.meta} metaTxt={m.metaTxt} max={m.max}
        atual={!!v.baldes[n - 1]?.andamento} atualTxt={ANDAMENTO[j.grupo]} compacto={n * larg > 300} cobertura={s.cobertura.map(m.cob)} cobTxt={m.cobLeg} />)}
    <p class="tiny sub evo-cob">{m.resumo}</p>
    {n > 0 && <details class="evo-num"><summary class="small">Ver os números {GRUPO_NM[j.grupo]}</summary>
      <table class="small num"><thead><tr><th scope="col">{j.grupo === "dia" ? "Dia" : j.grupo === "semana" ? "Semana" : "Mês"}</th><th scope="col">Valor</th><th scope="col">Registro</th></tr></thead>
        <tbody>{v.baldes.map((b, i) => <tr key={b.inicio}><th scope="row">{rotLongo(b, j.grupo)}</th>
          <td>{s.baldes[i] == null ? "sem registro" : val(s.baldes[i], casas, m.unit)}</td><td>{m.cob(s.cobertura[i])}</td></tr>)}</tbody></table></details>}
  </Card>;
}
const diasDe = (c: Cob) => `${c.registrados}/${c.dias}`;
const resumoDias = (s: SerieEvo, o: string) => `Registro em ${s.registrados} de ${s.dias} ${pl(s.dias, "dia", "dias")} ${o}.`;

// ---------- abas ----------
function AbaTreino({ v }: { v: EvolucaoView }) {
  const t = v.treino, j = v.janela, meta = C.ctxDoPerfil(S.profile).diasMeta, semanal = j.grupo === "semana", porDia = j.grupo === "dia";
  const alvo = C.weeklyTargets(calc().level, S.profile.priorities) as Partial<Record<string, number>>;
  const resumoT = resumoDias(t.dias, "(treino feito ou presença marcada, inclusive \"não fui\")");
  return <>
    <Metrica v={v} titulo="Dias treinados" valor={`${t.dias.valor ?? 0} ${pl(t.dias.valor, "dia", "dias")}`} s={t.dias} un={["dia", "dias"]} unit=" dias"
      grafico={porDia ? null : "colunas"} meta={semanal ? meta : undefined} metaTxt={`meta de ${meta} ${pl(meta, "dia", "dias")} por semana`}
      cob={diasDe} cobLeg="dias com registro / dias" resumo={resumoT}
      extra={t.semanasSeguidas >= 2 ? <p class="small" style="margin-top:6px"><b class="num">{t.semanasSeguidas}</b> semanas seguidas na meta de {meta} {pl(meta, "dia", "dias")}</p> : null} />
    {t.series.map(({ muscle, s }) => <Metrica key={muscle} v={v} titulo={`Séries de ${mName(muscle)}`} sub="músculo prioritário" valor={`${fmt(s.valor ?? 0)} séries`} s={s}
      un={["série", "séries"]} unit=" séries" grafico="colunas" meta={semanal ? alvo[muscle] : undefined} metaTxt={`meta de ${alvo[muscle] ?? 0} séries por semana`}
      cob={diasDe} cobLeg="dias com registro / dias" resumo={resumoT} />)}
    <Metrica v={v} titulo="Músculos com 2× na semana" sub="% dos músculos" valor={val(t.freq2.valor, 0, "%")} s={t.freq2} un={["ponto", "pontos"]} unit="%"
      grafico={porDia ? null : "colunas"} max={100} cob={(c) => `${c.registrados} sem.`} cobLeg="semanas que entraram na média"
      resumo={`Média de ${t.freq2.registrados} ${pl(t.freq2.registrados, "semana", "semanas")} (a semana em andamento só conta quando é a única).`} />
    {t.e1rm.length ? t.e1rm.map((e) => <Metrica key={e.exerciseId} v={v} titulo={`Força: ${nomeExercicio(e.exerciseId)}`} sub="e1RM, carga máxima estimada" valor={val(e.s.valor, 1, " kg")}
      s={e.s} un={["kg", "kg"]} casas={1} unit=" kg" grafico="linha" cob={(c) => `${c.registrados} ${pl(c.registrados, "treino", "treinos")}`}
      resumo={`Medido em ${e.s.registrados} ${pl(e.s.registrados, "treino", "treinos")} no período. e1RM = carga máxima estimada para 1 repetição (Epley).`}
      extra={e.recorde ? <p style="margin-top:6px"><span class="badge ok"><Icon id="check" />recorde de todos os tempos</span></p> : null} />)
      : <Card><h2>Força (e1RM)</h2><p class="small sub" role="status" style="margin-top:6px">Precisa de mais registros: um exercício feito em 2 {porDia ? "dias" : GRUPO_NM[j.grupo].replace("por ", "") + "s"} diferentes mostra a evolução.</p></Card>}
    <Metrica v={v} titulo="Cardio" sub="minutos" valor={`${fmt(t.cardio.valor ?? 0)} min`} s={t.cardio} un={["min", "min"]} unit=" min" grafico="colunas"
      cob={diasDe} cobLeg="dias com registro / dias" resumo={resumoDias(t.cardio, "(cardio, treino ou presença marcada)")} />
    <a class="btn full" href="#treino/resumo">Ver o detalhe semana a semana<Icon id="arrow" /></a>
  </>;
}

function AbaComida({ v }: { v: EvolucaoView }) {
  const c = v.comida, ctx = C.ctxDoPerfil(S.profile);
  const media = (c2: Cob) => `${c2.naMedia}/${c2.dias}`;
  const resumo = `Comida registrada em ${c.kcal.registrados} de ${c.kcal.dias} ${pl(c.kcal.dias, "dia", "dias")}; ${c.kcal.naMedia} ${pl(c.kcal.naMedia, "entrou", "entraram")} na média.`;
  return <>
    <Metrica v={v} titulo="Calorias" sub="média por dia" valor={val(c.kcal.valor, 0, " kcal")} s={c.kcal} un={["kcal", "kcal"]} unit=" kcal" grafico="colunas"
      meta={ctx.dieta.kcal || undefined} metaTxt={`meta de ${fmt(ctx.dieta.kcal)} kcal`} cob={media} cobLeg="dias na média / dias" resumo={resumo} />
    <Metrica v={v} titulo="Proteína" sub="média por dia" valor={val(c.prot.valor, 0, " g")} s={c.prot} un={["g", "g"]} unit=" g" grafico="colunas"
      meta={ctx.dieta.protein || undefined} metaTxt={`meta de ${fmt(ctx.dieta.protein)} g`} cob={media} cobLeg="dias na média / dias" resumo={resumo} />
    <Metrica v={v} titulo="Dias que bateu a proteína" sub={`≥ 95% de ${fmt(ctx.dieta.protein)} g`} valor={val(c.protDias.valor, 0, "%")} s={c.protDias} un={["ponto", "pontos"]} unit="%"
      grafico={v.janela.grupo === "dia" ? null : "colunas"} max={100} cob={media} cobLeg="dias na média / dias" resumo={resumo} />
    <Metrica v={v} titulo="Bebida" sub="kcal de bebida alcoólica" valor={val(c.bebida.valor, 0, " kcal")} s={c.bebida} un={["kcal", "kcal"]} unit=" kcal" grafico="colunas"
      cob={(x) => `${x.registrados} ${pl(x.registrados, "dia", "dias")}`} resumo={`Bebida registrada em ${c.bebida.registrados} ${pl(c.bebida.registrados, "dia", "dias")} (vem do checkout do Diário).`} />
    <Card><h2>Como a média é feita</h2><p class="small sub" style="margin-top:6px">Dia sem nenhum registro fica fora da média (ou conta 0, se você escolheu). Café, almoço e jantar que faltaram num dia com registro entram pela média de cada um; "não comi" conta 0.</p>
      <a class="btn sm ghost" style="margin-top:10px" href="#comida">Mudar na Comida<Icon id="arrow" /></a></Card>
  </>;
}

function AbaSaude({ v }: { v: EvolucaoView }) {
  const s = v.saude, diasR = (c: Cob) => `${c.registrados}/${c.dias}`;
  return <>
    <Metrica v={v} titulo="Água" sub="média dos dias registrados" valor={val(s.agua.valor, 1, " L")} s={s.agua} un={["L", "L"]} casas={1} unit=" L" grafico="colunas"
      cob={diasR} cobLeg="dias registrados / dias" resumo={resumoDias(s.agua, "(checkout do Diário)")} />
    <Metrica v={v} titulo="Sono" sub="média das noites registradas" valor={val(s.sono.valor, 1, " h")} s={s.sono} un={["h", "h"]} casas={1} unit=" h" grafico="colunas"
      cob={diasR} cobLeg="noites registradas / dias" resumo={resumoDias(s.sono, "(check-in do Diário)")} />
    <Metrica v={v} titulo="Noites com álcool" valor={s.alcoolNoites.valor == null ? "—" : `${s.alcoolNoites.valor} ${pl(s.alcoolNoites.valor, "noite", "noites")}`} s={s.alcoolNoites}
      un={["noite", "noites"]} unit="" grafico="colunas" cob={diasR} cobLeg="noites respondidas / dias" resumo={resumoDias(s.alcoolNoites, "(checkout do Diário)")} />
    <Metrica v={v} titulo="Doses de álcool" sub="soma do período" valor={s.alcoolDoses.valor == null ? "—" : `${s.alcoolDoses.valor} ${pl(s.alcoolDoses.valor, "dose", "doses")}`} s={s.alcoolDoses}
      un={["dose", "doses"]} unit="" grafico="colunas" cob={diasR} cobLeg="noites respondidas / dias" resumo={resumoDias(s.alcoolDoses, "(checkout do Diário)")} />
  </>;
}

function AbaCorpo({ v }: { v: EvolucaoView }) {
  const c = v.corpo, med = (x: Cob) => `${x.registrados} ${pl(x.registrados, "medida", "medidas")}`;
  const itens: [string, SerieEvo, string, string][] = [["Peso", c.peso, " kg", "pesagem"], ["Braço", c.braco, " cm", "medida"], ["Cintura", c.cintura, " cm", "medida"], ["Ombro", c.ombro, " cm", "medida"]];
  const com = itens.filter(([, s]) => s.cobertura.some((x) => x.registrados > 0));
  return <>
    {com.map(([nm, s, u, oque]) => <Metrica key={nm} v={v} titulo={nm} sub="último valor do período" valor={val(s.valor, 1, u)} s={s} un={[u.trim(), u.trim()]} casas={1} unit={u} grafico="linha"
      cob={med} resumo={`${s.registrados} ${pl(s.registrados, oque, oque + "s")} no período. O começo é a sua 1ª ${oque}.`} />)}
    {com.length < itens.length && <Card><p class="small sub">Sem registro no período: {itens.filter((x) => !com.includes(x)).map(([nm]) => nm.toLowerCase()).join(", ")}.</p>
      <a class="btn sm ghost" style="margin-top:10px" href="#corpo">Registrar medidas<Icon id="arrow" /></a></Card>}
  </>;
}
