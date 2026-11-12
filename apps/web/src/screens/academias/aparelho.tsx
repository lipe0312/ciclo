// Página do aparelho (dentro de um lugar): imagem de referência, exercícios que usam, e a SUA mídia (vídeo de 10–15 s / fotos da
// regulagem: pino, banco, pegada) com nota. É aqui que a mídia mora; no treino ela aparece como "Sua academia · regulagem".
import { useState } from "preact/hooks";
import { C } from "../../lib/store/index.ts";
import type { Gym, GymMedia } from "../../lib/store/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { href } from "../../lib/roteador/index.ts";
import { img } from "../../lib/util.ts";
import { enviarMidia, midiaDoAparelho } from "../../lib/lugares/index.ts";
import "./academias.css";

function Item({ m }: { m: GymMedia }) {
  return <li class="lug-midia">
    {m.url ? (m.kind === "video" ? <video src={m.url} controls playsInline preload="metadata" aria-label={`Vídeo da regulagem${m.note ? ": " + m.note : ""}`} />
      : <img src={m.url} alt={`Foto da regulagem${m.note ? ": " + m.note : ""}`} loading="lazy" />)
      : <span class="mbox"><Icon id={m.kind === "video" ? "play" : "cam"} /></span>}
    <p class="small">{m.note || <span class="sub">sem anotação</span>}</p></li>;
}

export function PaginaAparelho({ gym, eqId }: { gym: Gym; eqId: string }) {
  const eq = C.EQUIPMENT_BY_ID[eqId];
  const [nota, setNota] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const back = <a class="btn sm" href={href("academias", [gym.id])}><Icon id="back" />{gym.name}</a>;
  if (!eq) return <>{back}<p class="sub" style="margin-top:12px">Aparelho não encontrado.</p></>;
  const midia = midiaDoAparelho(gym.id, eqId);
  const usa = C.EXERCISES.filter((e) => e.eq.includes(eqId));
  const tem = gym.equipment.includes(eqId);

  const pegar = async (e: Event) => {
    const t = e.currentTarget as HTMLInputElement, f = t.files?.[0]; t.value = "";
    if (!f) return;
    setBusy(true); setStatus("");
    try {
      const r = await enviarMidia(f, gym.id, eqId, nota, setStatus);
      setNota(""); setStatus(r.aviso ? `Salvo. ${r.aviso}` : "Salvo."); toast("Mídia salva");
    } catch (err: any) { setStatus(""); toast(err?.message || "Não consegui enviar; tente no Wi-Fi"); setStatus(err?.message || "Falhou o envio."); }
    finally { setBusy(false); }
  };

  return <>
    <div class="row between" style="margin-bottom:10px">{back}</div>
    <p class="kicker">{gym.name} · aparelho</p><h1 style="margin:2px 0 14px">{eq.nm}</h1>
    <div class="grid dash"><div class="stack">
      <div class="card"><div class="exim big"><img src={img(eq.img)} alt={`${eq.nm}: imagem de referência`} width={480} height={320} /></div>
        {!tem && <div class="note warn" style="margin-top:12px"><Icon id="warn" /><span>Este aparelho não está marcado em {gym.name}. Dá para guardar a mídia mesmo assim.</span></div>}</div>
      <div class="card"><h2>Sua mídia</h2>
        <p class="small sub" style="margin:4px 0 12px">Vídeo de 10 a 15 s ou fotos da regulagem (pino, banco, pegada). No treino aparece como “Sua academia · regulagem”.</p>
        {midia.length ? <ul class="lug-midias">{midia.map((m) => <Item key={m.id} m={m} />)}</ul> : <p class="small sub">Ainda não tem mídia deste aparelho aqui.</p>}
        <div style="margin-top:14px"><label class="f" for="lug-nota">Nota da regulagem (opcional)</label>
          <input id="lug-nota" class="input" value={nota} maxLength={120} placeholder="Ex.: banco no furo 3, pino 4" onInput={(e) => setNota(e.currentTarget.value)} /></div>
        <div class="row wrapx" style="gap:8px;margin-top:10px">
          <label class={`btn pri ${busy ? "off" : ""}`}><Icon id="cam" />Gravar<input type="file" accept="video/*,image/*" capture="environment" class="sr" disabled={busy} onChange={pegar} /></label>
          <label class={`btn ${busy ? "off" : ""}`}>Da galeria<input type="file" accept="video/*,image/*" class="sr" disabled={busy} onChange={pegar} /></label></div>
        <p class="small" role="status" aria-live="polite" style="margin-top:10px">{status}</p></div>
    </div><div class="stack">
      <div class="card"><h2>Exercícios que usam</h2>
        {usa.length ? <ul class="lug-usa">{usa.slice(0, 14).map((e) => <li key={e.id}><a class="alt altlink" href={href("treino", ["exercicio", e.id])}>
          <img src={img(C.imageSrc(e))} alt="" loading="lazy" width={56} height={56} /><div><h3>{e.nm}</h3><p class="tiny sub">{C.MUSCLES[e.m].nm}</p></div><Icon id="arrow" /></a></li>)}</ul>
          : <p class="small sub" style="margin-top:6px">Nenhum exercício do catálogo usa este aparelho.</p>}
        {usa.length > 14 && <a class="btn full" style="margin-top:10px" href={href("treino", ["exercicios"], { eq: eqId })}>Ver os {usa.length} exercícios</a>}</div>
    </div></div></>;
}
