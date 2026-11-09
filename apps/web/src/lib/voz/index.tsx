// Microfone (interface). O motor é trocável: `setMotorVoz` — a issue de Comida conserta/substitui o motor.
// Motor padrão: Whisper no servidor (se ligado) ou reconhecimento de voz do navegador.
import { useState } from "preact/hooks";
import { Icon } from "../ui/index.tsx";
import { SERVER, api } from "../api/index.ts";

export interface MotorVoz {
  /** Começa a ouvir. `onText` recebe o texto acumulado; `onStatus`, mensagens curtas. Devolve `stop`. */
  start(o: { onText: (t: string, final: boolean) => void; onStatus: (s: string) => void; onEnd: () => void }): Promise<() => void>;
}
let ai = false;
export const setVozAI = (on: boolean) => { ai = on; };

const motorPadrao: MotorVoz = {
  async start({ onText, onStatus, onEnd }) {
    if (SERVER && ai && navigator.mediaDevices?.getUserMedia && "MediaRecorder" in window) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream), chunks: Blob[] = [];
        onStatus("Gravando… toque de novo para parar (máx. 2 min)");
        const stopT = setTimeout(() => mr.state === "recording" && mr.stop(), 120000);
        mr.ondataavailable = (e) => chunks.push(e.data);
        mr.onstop = async () => {
          clearTimeout(stopT); stream.getTracks().forEach((t) => t.stop()); onStatus("Transcrevendo…");
          try { const r = await api<{ text: string }>("POST", "/api/transcribe", null, new Blob(chunks, { type: mr.mimeType || "audio/webm" })); onText(r.text, true); onStatus("Pronto. Revise e envie."); }
          catch { onStatus("Falhou a transcrição. Tente de novo ou digite."); }
          onEnd();
        };
        mr.start();
        return () => mr.state === "recording" && mr.stop();
      } catch { onStatus("Sem permissão de microfone."); onEnd(); return () => {}; }
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { onStatus("Este navegador não tem reconhecimento de voz. Use o teclado (o microfone do teclado também funciona)."); onEnd(); return () => {}; }
    const r = new SR(); r.lang = "pt-BR"; r.interimResults = true; r.continuous = true;
    r.onresult = (e: any) => onText([...e.results].map((x: any) => x[0].transcript).join(" "), false);
    r.onend = () => { onStatus("Pronto. Revise e envie."); onEnd(); };
    r.onerror = () => onStatus("Não consegui ouvir. Tente de novo.");
    onStatus("Ouvindo… toque de novo para parar."); r.start();
    return () => r.stop();
  },
};
let motor: MotorVoz = motorPadrao;
export const setMotorVoz = (m: MotorVoz) => { motor = m; };

/** Botão de microfone: acrescenta o texto ditado ao valor atual via `onChange`. */
export function Mic({ value, onChange, label, onStatus }: { value: string; onChange: (v: string) => void; label: string; onStatus?: (s: string) => void }) {
  const [stop, setStop] = useState<null | (() => void)>(null);
  const [status, setStatus] = useState("");
  const say = (s: string) => { setStatus(s); onStatus?.(s); };
  async function toggle() {
    if (stop) { stop(); setStop(null); return; }
    const base = value ? value + " " : "";
    const st = await motor.start({ onText: (t) => onChange(base + t), onStatus: say, onEnd: () => setStop(null) });
    setStop(() => st);
  }
  return <span class="micwrap"><button type="button" class={`mic ${stop ? "rec" : ""}`} onClick={toggle} aria-label={label} aria-pressed={!!stop}><Icon id="mic" /></button>
    {!onStatus && status && <span class="tiny sub sr-live" role="status">{status}</span>}</span>;
}
