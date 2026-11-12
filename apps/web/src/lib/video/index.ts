// Compressão de vídeo no aparelho antes do upload: WebCodecs (H.264) → MP4. Sem dependência: o vídeo toca num <video> escondido,
// cada quadro vai para um canvas já em 720p e daí para o VideoEncoder; o contêiner vem do core (muxMp4).
// O plano (tamanho e taxa que cabem em 6 MB) vem do core (planVideo). Quem chama cuida do fallback (enviar como está).
import { muxMp4 } from "@ciclo/core";

type EncPlan = { width: number; height: number; videoBps: number; fps: number };
const w = window as unknown as Record<string, any>;

export const podeComprimir = () => typeof w.VideoEncoder === "function" && typeof w.VideoFrame === "function" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

function criarVideo(url: string): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.className = "sr"; v.setAttribute("aria-hidden", "true"); v.src = url;
  document.body.appendChild(v); // escondido (1 px): alguns navegadores só decodificam vídeo que está na página
  return v;
}
const quando = (v: HTMLVideoElement, ok: string) => new Promise<void>((res, rej) => {
  v.addEventListener(ok, () => res(), { once: true });
  v.addEventListener("error", () => rej(new Error("não consegui ler o vídeo")), { once: true });
});

/** Largura, altura e duração (já com a rotação do celular aplicada). null = o navegador não leu o arquivo. */
export async function lerVideo(file: Blob): Promise<{ width: number; height: number; durationS: number } | null> {
  const url = URL.createObjectURL(file), v = criarVideo(url);
  try {
    await Promise.race([quando(v, "loadedmetadata"), new Promise((_, rej) => setTimeout(() => rej(new Error("tempo")), 8000))]);
    return { width: v.videoWidth, height: v.videoHeight, durationS: v.duration };
  } catch { return null; }
  finally { v.remove(); URL.revokeObjectURL(url); }
}

const CODECS = ["avc1.64001f", "avc1.4d001f", "avc1.42001f"]; // High, Main, Baseline em nível 3.1 (até 1280×720 a 30 fps)

export async function comprimirVideo(file: Blob, plan: EncPlan, onProgress: (pct: number) => void): Promise<Blob> {
  const VideoEncoder = w.VideoEncoder, VideoFrame = w.VideoFrame;
  let config: Record<string, unknown> | null = null;
  for (const codec of CODECS) {
    const c = { codec, width: plan.width, height: plan.height, bitrate: plan.videoBps, framerate: plan.fps, avc: { format: "avc" }, latencyMode: "quality", bitrateMode: "variable" };
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch { /* tenta o próximo */ }
  }
  if (!config) throw new Error("sem codificador H.264");

  const url = URL.createObjectURL(file), v = criarVideo(url);
  const canvas = document.createElement("canvas"); canvas.width = plan.width; canvas.height = plan.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("sem canvas");
  const amostras: { data: Uint8Array; ts: number; key: boolean }[] = [];
  let avcC = null as Uint8Array | null, falha = null as Error | null; // (as: o TS não enxerga a mudança feita dentro dos callbacks)
  const enc = new VideoEncoder({
    output: (chunk: any, meta: any) => {
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
      const d = meta?.decoderConfig?.description;
      if (d && !avcC) avcC = new Uint8Array(d instanceof ArrayBuffer ? d.slice(0) : (d as ArrayBufferView).buffer.slice((d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteOffset + (d as ArrayBufferView).byteLength));
      amostras.push({ data, ts: chunk.timestamp, key: chunk.type === "key" });
    },
    error: (e: Error) => { falha = e; },
  });
  try {
    enc.configure(config);
    await Promise.race([quando(v, "loadeddata"), new Promise((_, rej) => setTimeout(() => rej(new Error("tempo")), 8000))]);
    const total = v.duration || 1;
    // limite de tempo: o vídeo roda a 2× (≤ 30 s → ~15 s) + folga
    const limite = setTimeout(() => { falha = new Error("demorou demais"); v.pause(); v.dispatchEvent(new Event("ended")); }, (total / 2 + 25) * 1000);
    try {
      await new Promise<void>((resolve, reject) => {
        let n = 0, ultimo = -1;
        const fila = () => (enc.encodeQueueSize > 8
          ? new Promise<void>((r) => { const f = () => { if (enc.encodeQueueSize <= 2) { enc.removeEventListener("dequeue", f); r(); } }; enc.addEventListener("dequeue", f); })
          : null);
        const quadro = async (_agora: number, meta: { mediaTime: number }) => {
          if (falha) return resolve();
          try {
            if (meta.mediaTime > ultimo + 1e-4) {
              ctx.drawImage(v, 0, 0, plan.width, plan.height);
              const f = new VideoFrame(canvas, { timestamp: Math.round(meta.mediaTime * 1e6) });
              enc.encode(f, { keyFrame: n % (plan.fps * 2) === 0 }); f.close();
              n++; ultimo = meta.mediaTime;
              onProgress(Math.min(99, Math.round((meta.mediaTime / total) * 100)));
            }
            const espera = fila();
            if (espera) { v.pause(); await espera; await v.play(); }
          } catch (e) { return reject(e); }
          if (!v.ended) (v as any).requestVideoFrameCallback(quadro);
        };
        v.addEventListener("ended", () => resolve(), { once: true });
        v.addEventListener("error", () => reject(new Error("erro ao decodificar")), { once: true });
        (v as any).requestVideoFrameCallback(quadro);
        v.playbackRate = 2;
        v.play().catch(reject);
      });
    } finally { clearTimeout(limite); }
    if (falha) throw falha;
    await enc.flush();
    if (falha) throw falha;
    if (!amostras.length || !avcC) throw new Error("o codificador não gerou quadros");
    const passo = Math.round(1e6 / plan.fps);
    const samples = amostras.map((a, i) => ({ data: a.data, key: a.key, duration: i + 1 < amostras.length ? Math.max(1, amostras[i + 1].ts - a.ts) : passo }));
    const bytes = muxMp4({ width: plan.width, height: plan.height, avcC, samples });
    onProgress(100);
    return new Blob([bytes as BlobPart], { type: "video/mp4" });
  } finally {
    try { enc.close(); } catch { /* já fechado */ }
    v.remove(); URL.revokeObjectURL(url);
  }
}
