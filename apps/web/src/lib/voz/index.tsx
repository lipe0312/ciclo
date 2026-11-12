// Microfone com estados claros e hierarquia de motores (#28):
//   1) Whisper no servidor (Workers AI) quando o Worker tem o binding `ai`;
//   2) reconhecimento de voz do navegador (Chrome/Edge/Safari, só em https ou localhost);
//   3) mensagem clara ("use o microfone do teclado").
// A escolha é uma função pura do core (`pickVoiceEngine`); aqui só detectamos o ambiente e falamos com o navegador.
import { useEffect, useRef, useState } from "preact/hooks";
import { pickVoiceEngine, voiceHelp } from "@ciclo/core";
import type { VoiceEngine, VoicePick } from "@ciclo/core";
import { Icon } from "../ui/index.tsx";
import { HttpError, SERVER, api } from "../api/index.ts";

let ai = false;
export const setVozAI = (on: boolean) => { ai = on; };
let whisperFalhou = false;

const MAX_MS = 120_000, MAX_BYTES = 4 * 1024 * 1024;
const SR = (): any => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

/** Motor em uso agora (para o app informar). */
export function motorAtual(): VoicePick {
  return pickVoiceEngine({
    secure: window.isSecureContext, recorder: !!navigator.mediaDevices?.getUserMedia && "MediaRecorder" in window,
    recognition: !!SR(), server: SERVER, serverAi: ai, whisperFalhou,
  });
}

export type VozEstado = "parado" | "pedindo" | "ouvindo" | "transcrevendo" | "pronto" | "erro";
const ROTULO: Record<VozEstado, string> = { parado: "Toque para falar", pedindo: "Pedindo permissão do microfone…", ouvindo: "Ouvindo… toque para parar", transcrevendo: "Transcrevendo…", pronto: "Pronto. Revise e registre.", erro: "" };

/** Tipos que o MediaRecorder do aparelho aceita: webm/opus no Chrome, mp4 no Safari. */
function mimeGravacao(): string | undefined {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return undefined;
}
/** Código estável do motivo do erro do microfone/servidor (vira mensagem em `voiceHelp`). */
function codigoDeErro(e: unknown): string {
  if (e instanceof HttpError) return (e.data as { code?: string } | null)?.code ?? (e.status === 413 ? "audio_grande" : e.status === 501 ? "sem_servidor" : "falha_modelo");
  const n = (e as { name?: string })?.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "permissao";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "sem_microfone";
  return "rede";
}

interface Sessao { stop: () => void }
interface Cb { onText: (t: string) => void; onState: (s: VozEstado, msg?: string) => void }

async function gravarWhisper({ onText, onState }: Cb): Promise<Sessao> {
  onState("pedindo");
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { const c = codigoDeErro(e); onState("erro", voiceHelp(c)); return { stop() {} }; }
  const chunks: Blob[] = [];
  const mr = new MediaRecorder(stream, { mimeType: mimeGravacao() });
  const timer = setTimeout(() => mr.state === "recording" && mr.stop(), MAX_MS);
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mr.onstop = async () => {
    clearTimeout(timer); stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: (mr.mimeType || "audio/webm").split(";")[0] });
    if (!blob.size) return onState("erro", voiceHelp("audio_vazio"));
    if (blob.size > MAX_BYTES) return onState("erro", voiceHelp("audio_grande"));
    onState("transcrevendo");
    try {
      const r = await api<{ text: string }>("POST", "/api/transcribe", null, blob);
      if (!r.text) return onState("erro", voiceHelp("fala_nao_entendida"));
      onText(r.text); onState("pronto");
    } catch (e) {
      const c = codigoDeErro(e);
      if (c === "sem_servidor" || c === "falha_modelo") whisperFalhou = true; // próxima vez usa o navegador
      onState("erro", voiceHelp(c) + (whisperFalhou ? " Na próxima vez uso o reconhecimento do navegador." : ""));
    }
  };
  mr.start();
  onState("ouvindo");
  return { stop: () => mr.state === "recording" && mr.stop() };
}

function ouvirNavegador({ onText, onState }: Cb): Sessao {
  const Rec = SR(), r = new Rec();
  r.lang = "pt-BR"; r.interimResults = true; r.continuous = true;
  let got = false, failed = false;
  onState("pedindo");
  r.onstart = () => onState("ouvindo");
  r.onresult = (e: any) => { got = true; onText([...e.results].map((x: any) => x[0].transcript).join(" ").trim()); };
  r.onerror = (e: any) => {
    failed = true;
    const m: Record<string, string> = { "not-allowed": "permissao", "service-not-allowed": "permissao", "audio-capture": "sem_microfone", "no-speech": "fala_nao_entendida", network: "rede" };
    onState("erro", voiceHelp(m[e?.error] ?? "outro"));
  };
  r.onend = () => { if (!failed) onState(got ? "pronto" : "erro", got ? undefined : voiceHelp("fala_nao_entendida")); };
  try { r.start(); } catch { onState("erro", voiceHelp("outro")); }
  return { stop: () => { try { r.stop(); } catch { /* já parou */ } } };
}

/** Botão de microfone: acrescenta o texto ditado ao valor atual via `onChange`.
 *  `grande`: botão de 72 px com estado e motor escritos (tela Comida). `onStatus` recebe a mensagem de estado. */
export function Mic({ value, onChange, label, onStatus, grande = false }: { value: string; onChange: (v: string) => void; label: string; onStatus?: (s: string) => void; grande?: boolean }) {
  const [estado, setEstado] = useState<VozEstado>("parado");
  const [msg, setMsg] = useState("");
  const [motor, setMotor] = useState<VoiceEngine>(() => motorAtual().engine);
  const sessao = useRef<Sessao | null>(null);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; sessao.current?.stop(); }, []);

  const ativo = estado === "pedindo" || estado === "ouvindo";
  const texto = estado === "erro" ? msg : ROTULO[estado];
  const set = (s: VozEstado, m = "") => {
    if (!vivo.current) return;
    setEstado(s); setMsg(m); onStatus?.(s === "erro" ? m : ROTULO[s]);
    if (s === "pronto" || s === "erro") sessao.current = null;
  };

  async function toggle() {
    if (sessao.current) { sessao.current.stop(); return; }
    if (estado === "transcrevendo") return;
    const pick = motorAtual();
    setMotor(pick.engine);
    if (pick.engine === "nenhum") return set("erro", pick.help);
    const base = value ? value + " " : "";
    const cb: Cb = { onText: (t) => onChange(base + t), onState: set };
    sessao.current = { stop() {} }; // trava duplo toque enquanto pede permissão
    sessao.current = pick.engine === "whisper" ? await gravarWhisper(cb) : ouvirNavegador(cb);
  }
  const rotuloMotor = motorAtual().label;
  return <span class={grande ? "micwrap lg" : "micwrap"}>
    <button type="button" class={`mic ${grande ? "lg" : ""} ${estado === "ouvindo" ? "rec" : ""} ${estado === "pedindo" || estado === "transcrevendo" ? "busy" : ""}`} onClick={toggle}
      aria-label={label} aria-pressed={ativo} aria-busy={estado === "transcrevendo"} disabled={estado === "transcrevendo"}><Icon id="mic" /></button>
    {(grande || (!onStatus && texto)) && <span class={`tiny ${estado === "erro" ? "voz-erro" : "sub"}`} role="status" aria-live="polite">{texto}</span>}
    {grande && <span class="tiny sub">Motor: {motor === "nenhum" ? "nenhum disponível" : rotuloMotor}</span>}
  </span>;
}
