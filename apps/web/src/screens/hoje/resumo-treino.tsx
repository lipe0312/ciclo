// #159 Resumo de treino da Home, Semana | Mês: só números escritos (sem gráfico), cada um com a diferença contra o período
// anterior em palavras. Os gráficos estão em #treino/resumo. A conta toda vem do core (resumoTreino).
import { useState } from "preact/hooks";
import { C } from "../../lib/store/index.ts";
import { Card, Icon, Seg } from "../../lib/ui/index.tsx";
import { fmt, lsGet, lsSet } from "../../lib/util.ts";

const KEY = "ciclo:v1:home:resumo-periodo";
const dm = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z")).replace(".", "");
const mesNome = (iso: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
const faixa = (a: string, b: string) => (a === b ? dm(a) : `${dm(a)} a ${dm(b)}`);

export function ResumoTreino({ view }: { view: C.HomeView }) {
  const [per, setPer] = useState<C.PeriodoResumo>(() => (lsGet<string>(KEY, "semana") === "mes" ? "mes" : "semana"));
  const t = view.treino; // cache antigo da Home (antes da #159) não tem o resumo: o cartão espera a próxima leitura
  if (!t) return null;
  const r = t[per], a = r.atual;
  const troca = (p: C.PeriodoResumo) => { setPer(p); lsSet(KEY, p); };
  const stats: { k: string; v: string; sub?: string; dif: string }[] = [
    { k: "Presença", v: `${a.dias} de ${r.meta} dias`, dif: C.difTexto(r.dif.dias, ["dia", "dias"], per) },
    { k: "Séries", v: `${fmt(a.series)} séries`, dif: C.difTexto(r.dif.series, ["série", "séries"], per) },
    { k: "Cardio", v: `${fmt(a.cardioMin)} min`, sub: a.cardioMediaSemana != null ? `média ${fmt(a.cardioMediaSemana)} min por semana` : undefined, dif: C.difTexto(r.dif.cardioMin, ["min", "min"], per) },
    { k: "Tempo por treino", v: a.duracaoMin != null ? `${fmt(a.duracaoMin)} min` : "—", sub: a.duracaoMin == null ? "sem treino encerrado com horário" : undefined, dif: a.duracaoMin == null ? "" : C.difTexto(r.dif.duracaoMin, ["min", "min"], per) },
  ];
  return <Card cls="hm-painel rt" aria-label="Resumo do treino">
    <div class="row between wrapx" style="gap:8px"><h2>Treino</h2>
      <Seg<C.PeriodoResumo> label="Período do resumo" value={per} onPick={troca} opts={[["semana", "Semana"], ["mes", "Mês"]]} /></div>
    <p class="small sub" style="margin-top:6px">{per === "semana" ? "Semana" : mesNome(r.inicio).replace(/^./, (c) => c.toUpperCase())} em andamento · {faixa(r.inicio, r.fim)}</p>
    {r.temDados ? <>
      <div class="rt-stats">{stats.map((s) => <div key={s.k} class="rt-stat"><p class="tiny sub">{s.k}</p>
        <p class="num rt-v">{s.v}</p>{s.sub && <p class="tiny sub">{s.sub}</p>}{s.dif && <p class="tiny">{s.dif}</p>}</div>)}</div>
      <p class="tiny sub" style="margin-top:10px">Comparado com {faixa(r.antInicio, r.antFim)} ({per === "semana" ? "semana passada" : "mês passado"}, os mesmos {r.decorridos} {r.decorridos === 1 ? "dia" : "dias"}).</p></>
      : <p class="small sub" role="status" style="margin-top:10px">Precisa de mais registros: os números aparecem depois dos primeiros treinos.</p>}
    <a class="btn pri full" style="margin-top:12px" href="#treino/resumo">Ver detalhes do treino<Icon id="arrow" /></a>
    <a class="btn full ghost" style="margin-top:8px" href="#evolucao/treino"><Icon id="spark" />Ver evolução</a>
  </Card>;
}
