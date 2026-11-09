// Biblioteca de exercícios: busca + filtros (músculo, aparelho, tipo), estado na URL.
import { useRef } from "preact/hooks";
import * as C from "@ciclo/core";
import { href, replace } from "../../lib/roteador/index.ts";
import { Chip, Icon } from "../../lib/ui/index.tsx";
import { img } from "../../lib/util.ts";

const TYPES: [string, string][] = [["", "Todos"], ["forca", "Força"], ["cardio", "Cardio"], ["livre", "Peso livre"], ["maquina", "Máquina"], ["cabo", "Cabo"], ["corpo", "Peso corporal"]];
const KIND_NM: Record<string, string> = { livre: "peso livre", maquina: "máquina", cabo: "cabo", corpo: "peso corporal" };

/** Card com as 2 imagens (início/fim) alternando; sem a 2ª, fica a 1ª. */
export function ExImgs({ it, size = "card" }: { it: C.CatalogItem; size?: "card" | "big" }) {
  const src = C.imageSrc(it);
  if (!it.images.length) return <div class={`exim ${size} vazio`} aria-hidden="true"><Icon id={it.type === "cardio" ? "clock" : "dumb"} /></div>;
  const two = it.images.includes(1);
  return <div class={`exim ${size} ${two ? "duo" : ""}`}><img src={img(src, 0)} alt="" loading="lazy" width={360} height={240} />{two && <img src={img(src, 1)} alt="" loading="lazy" width={360} height={240} />}</div>;
}

export function Biblioteca({ query }: { query: Record<string, string> }) {
  const q = query.q ?? "", m = (query.m || null) as C.MuscleId | null, eq = query.eq || null, t = query.t || "";
  const set = (k: string, v: string | null) => replace(href("treino", ["exercicios"], { q, m, eq, t, [k]: v }));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const list = C.searchCatalog({ q, muscle: m, equipment: eq, type: (t || null) as any });
  const usedEq = C.EQUIPMENT.filter((e) => C.CATALOG.some((x) => x.eq.includes(e.id)));
  return <>
    <h1 style="margin:4px 0 12px">Exercícios</h1>
    <div class="searchbox"><Icon id="search" /><input class="input" type="search" aria-label="Buscar exercício" placeholder="rosca, puxada, elevação lateral, esteira…" value={q}
      onInput={(e) => { const v = e.currentTarget.value; clearTimeout(timer.current); timer.current = setTimeout(() => set("q", v), 120); }} /></div>
    <div class="filters">
      <div class="tabs" role="group" aria-label="Tipo">{TYPES.map(([v, l]) => <Chip key={v} on={t === v} onClick={() => set("t", v)}>{l}</Chip>)}</div>
      <div class="tabs" role="group" aria-label="Músculo"><Chip on={!m} onClick={() => set("m", null)}>Todos os músculos</Chip>{C.MUSCLE_IDS.map((x) => <Chip key={x} on={m === x} onClick={() => set("m", m === x ? null : x)}>{C.MUSCLES[x].nm}</Chip>)}</div>
      <label class="small row" style="gap:8px">Aparelho
        <select class="input" style="max-width:260px" value={eq ?? ""} onChange={(e) => set("eq", e.currentTarget.value || null)}>
          <option value="">qualquer</option>{usedEq.map((e) => <option key={e.id} value={e.id}>{e.nm}</option>)}</select></label>
    </div>
    <p class="small sub num" style="margin:10px 0" role="status">{list.length} exercício(s)</p>
    <div class="libgrid">{list.map((it) => <a key={it.id} class="libcard" href={href("treino", ["exercicio", it.id])}>
      <ExImgs it={it} />
      <span class="lc-body"><b>{it.nm}</b><span class="tiny sub">{it.type === "forca" ? `${C.MUSCLES[it.m].nm} · ${KIND_NM[it.kind]}` : `cardio · ${it.units.join(" / ")}`}</span></span>
    </a>)}</div>
    {!list.length && <p class="sub">Nada encontrado. Tente outra palavra ou limpe os filtros.</p>}
  </>;
}
