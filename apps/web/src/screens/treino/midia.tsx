// Mídia do SEU aparelho (foto/vídeo da regulagem): gravar, enviar ao R2 e mostrar. Usada na timeline, no detalhe e na folha "Ver como fazer".
import { S, commit } from "../../lib/store/index.ts";
import { EXB } from "../../lib/store/regras.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";

async function onMedia(e: Event, exId: string) {
  const t = e.currentTarget as HTMLInputElement, f = t.files?.[0]; if (!f) return; t.value = "";
  if (f.size > 20 * 1024 * 1024) return toast("Até 20 MB — grave 10–15 s em 720p");
  const kind = f.type.startsWith("video") ? "video" : "foto";
  S.media[exId] = { kind, note: "regulagem a anotar", url: URL.createObjectURL(f) }; commit();
  if (SERVER) {
    const ex = EXB[exId];
    try { const r = await api<{ id: string }>("POST", `/api/media?exerciseId=${encodeURIComponent(exId)}&equipmentId=${encodeURIComponent(ex?.eq[0] ?? "")}&gymId=${encodeURIComponent(S.ui.gymId ?? "")}`, null, f); S.media[exId].url = `/api/media/${r.id}`; toast("Mídia salva no seu R2"); }
    catch (err: any) { toast(err?.message || "Falhou o envio; tente no Wi-Fi"); }
  } else toast("Demo: mídia só neste navegador");
}
export function MediaBox({ exId }: { exId: string }) {
  const md = S.media[exId];
  if (md) return <div class="media has">{md.url ? (md.kind === "video" ? <video src={md.url} muted playsInline preload="metadata" controls /> : <img class="prev" src={md.url} alt="" />) : <span class="mbox"><Icon id={md.kind === "video" ? "play" : "cam"} /></span>}<span><b>Sua academia</b> · {md.note || "sem anotação"}</span></div>;
  return <div class="media"><span class="mbox"><Icon id="cam" /></span><span style="flex:1">Sem foto/vídeo do seu aparelho</span><label class="btn sm">Gravar<input type="file" accept="video/*,image/*" capture="environment" class="sr" onChange={(e) => onMedia(e, exId)} /></label></div>;
}
