// Detalhe do exercício: 2 imagens, passo a passo, músculos no mapa, aparelho, faixa de reps, dicas, erros,
// alternativas e a mídia do SEU aparelho (quando houver).
import * as C from "@ciclo/core";
import { S } from "../../lib/store/index.ts";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { Carrossel } from "../../lib/carrossel/index.tsx";
import { DEFAULT_SUB, MapaMusculos } from "../../lib/mapa-musculos/index.tsx";
import { href } from "../../lib/roteador/index.ts";
import { img } from "../../lib/util.ts";
import { ExImgs } from "./biblioteca.tsx";
import { MediaBox } from "./midia.tsx";
import { Estado } from "../../lib/estado/index.tsx";

const List = ({ title, items, empty }: { title: string; items?: string[]; empty: string }) =>
  <Card><h2>{title}</h2>{items?.length ? <ol class="steps">{items.map((t, i) => <li key={i}>{t}</li>)}</ol> : <p class="small sub" style="margin-top:6px">{empty}</p>}</Card>;

export function Detalhe({ id }: { id: string }) {
  const it = C.CATALOG_BY_ID[id];
  if (!it) return <Estado tipo="vazio" titulo="Exercício não encontrado" acao={{ label: "Ver exercícios", href: "#treino/exercicios" }} />;
  const src = C.imageSrc(it);
  const primary = it.subMuscles?.length ? it.subMuscles : it.type === "forca" ? DEFAULT_SUB[it.m] : [];
  const alts = it.type === "forca" ? C.EXERCISES.filter((e) => e.m === it.m && e.id !== it.id).slice(0, 4) : C.CARDIO.filter((c) => c.id !== it.id).slice(0, 4);
  return <>
    <p class="kicker">{it.type === "forca" ? `${C.MUSCLES[it.m].nm} · ${it.kind}` : "Cardio"}</p><h1 style="margin:2px 0 14px">{it.nm}</h1>
    <div class="grid dash"><div class="stack">
      <Card>{it.images.length ? <Carrossel label="Imagens do exercício" items={it.images.map((n) => <img src={img(src, n)} alt={`${it.nm} · ${n ? "fim" : "início"} do movimento`} width={360} height={240} />)} /> : <ExImgs it={it} size="big" />}
        <div class="facts num">
          {it.type === "forca" ? <><span><b>{it.r[0]}–{it.r[1]}</b> reps</span><span>descanso <b>{it.rest}s</b></span>{it.stretch && <span class="badge">alongado</span>}</>
            : <><span>registro em <b>{it.units.join(" / ")}</b></span><span class="tiny sub">kcal é estimada (MET × peso × tempo)</span></>}
          <span>{it.eq.length ? it.eq.map((e) => C.EQUIPMENT_BY_ID[e]?.nm ?? e).join(" + ") : "sem aparelho"}</span></div></Card>
      <List title="Como fazer" items={it.howTo} empty="Passo a passo em revisão. Enquanto isso: movimento controlado, amplitude completa e sobrar 1–2 repetições." />
      <div class="grid g2"><List title="Dicas" items={it.tips} empty="Em breve." /><List title="Erros comuns" items={it.mistakes} empty="Em breve." /></div>
      {it.type === "cardio" && <Card><h2>Intensidade</h2>{(Object.keys(C.INTENSITIES) as C.Intensity[]).map((k) => <div key={k} class="row between small" style="padding:6px 0"><span><b>{C.INTENSITIES[k].nm}</b> · {C.INTENSITIES[k].desc}</span><span class="num sub">~{C.cardioKcal(it, k, S.profile.weightKg, 30)} kcal/30 min</span></div>)}</Card>}
    </div><div class="stack">
      {primary.length > 0 && <Card><h2>Músculos</h2><MapaMusculos primary={primary} secondary={it.secondary} size="sm" /></Card>}
      {it.type === "forca" && <Card><h2>Seu aparelho</h2><MediaBox exId={it.id} grande /></Card>}
      {alts.length > 0 && <Card><h2>Alternativas</h2>{alts.map((a) => <a key={a.id} class="alt altlink" href={href("treino", ["exercicio", a.id])}>
        {a.images.length ? <img src={img(C.imageSrc(a))} alt="" loading="lazy" width={56} height={56} /> : <span class="mbox"><Icon id="dumb" /></span>}<div><h3>{a.nm}</h3>{a.type === "forca" && <p class="tiny sub">{a.r.join("–")} reps · {a.kind}</p>}</div><Icon id="arrow" /></a>)}</Card>}
    </div></div></>;
}
