// Mídia do SEU aparelho (foto/vídeo da regulagem) no treino, no detalhe e na folha "Ver como fazer": aqui só aparece.
// Gravar e guardar mora na página do aparelho (Academias › lugar › aparelho), de onde vem o botão "Gravar".
import { C, S } from "../../lib/store/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { href } from "../../lib/roteador/index.ts";
import { lugarAtual, midiaDoExercicio } from "../../lib/lugares/index.ts";
import "../academias/academias.css";

export function MediaBox({ exId, grande = false }: { exId: string; grande?: boolean }) {
  const ex = C.EXERCISE_BY_ID[exId], gym = lugarAtual();
  const list = gym ? midiaDoExercicio(exId, gym.id) : [], eq = ex?.eq[0];
  const aparelho = gym && list[0] ? href("academias", [gym.id, "aparelho", list[0].equipmentId]) : gym && eq ? href("academias", [gym.id, "aparelho", eq]) : null;
  if (list.length) {
    const rotulo = <span><b>Sua academia</b> · regulagem{gym ? <span class="sub"> · {gym.name}</span> : null}</span>;
    if (grande) return <div class="stack"><p class="small">{rotulo}</p>
      <ul class="lug-midias">{list.slice(0, 3).map((m) => <li key={m.id} class="lug-midia">
        {m.url ? (m.kind === "video" ? <video src={m.url} controls playsInline preload="metadata" aria-label={`Vídeo da regulagem${m.note ? ": " + m.note : ""}`} /> : <img src={m.url} alt={`Foto da regulagem${m.note ? ": " + m.note : ""}`} loading="lazy" />)
          : <span class="mbox"><Icon id={m.kind === "video" ? "play" : "cam"} /></span>}
        <p class="small">{m.note || <span class="sub">sem anotação</span>}</p></li>)}</ul>
      {aparelho && <a class="btn sm" href={aparelho}>Gravar ou ver no aparelho</a>}</div>;
    const m = list[0];
    return <a class="media has" href={aparelho ?? "#academias"} style="text-decoration:none;color:inherit">
      {m.url ? (m.kind === "video" ? <video src={m.url} muted playsInline preload="metadata" aria-hidden="true" /> : <img class="prev" src={m.url} alt="" />) : <span class="mbox"><Icon id={m.kind === "video" ? "play" : "cam"} /></span>}
      <span>{rotulo}<br /><span class="tiny sub">{m.note || "sem anotação"}{list.length > 1 ? ` · +${list.length - 1}` : ""}</span></span></a>;
  }
  const legado = S.media[exId]; // mídia antiga, ligada só ao exercício
  if (legado) return <div class="media has">{legado.url ? (legado.kind === "video" ? <video src={legado.url} muted playsInline preload="metadata" controls /> : <img class="prev" src={legado.url} alt="" />) : <span class="mbox"><Icon id={legado.kind === "video" ? "play" : "cam"} /></span>}<span><b>Sua academia</b> · {legado.note || "sem anotação"}</span></div>;
  return <div class="media"><span class="mbox"><Icon id="cam" /></span><span style="flex:1">Sem foto/vídeo do seu aparelho</span>
    {aparelho ? <a class="btn sm" href={aparelho}>Gravar</a> : null}</div>;
}
