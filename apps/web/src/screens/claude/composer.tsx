// #134 Composer fixo embaixo (como nos apps de IA): + (foto ou PDF), campo que cresce até ~5 linhas, microfone (o mesmo da
// Comida) e enviar. Enter envia, Shift+Enter quebra a linha. Toques de 44 px. O teclado do celular não cobre: com o
// visualViewport, o composer sobe para cima do teclado.
import { useEffect, useRef, useState } from "preact/hooks";
import * as CH from "@ciclo/core/chat";
import { S, commit } from "../../lib/store/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import { Mic } from "../../lib/voz/index.tsx";
import { chat, enviar, mudou } from "./conversa.ts";
import type { Envio } from "./conversa.ts";

const LINHAS = 5;

function crescer(el: HTMLTextAreaElement | null) {
  if (!el || typeof getComputedStyle !== "function") return;
  el.style.height = "auto";
  if (!el.value) { el.style.height = ""; return; } // vazio: a altura do CSS (44 px)
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
  el.style.height = `${Math.min(el.scrollHeight + 2, lh * LINHAS + 22)}px`;
}

/** Teclado aberto: quanto o visualViewport encolheu embaixo. O composer fica logo acima dele. */
function useTeclado(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const vv = (globalThis as { visualViewport?: VisualViewport }).visualViewport;
    if (!vv) return;
    const f = () => {
      const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      const el = ref.current; if (!el) return;
      el.classList.toggle("teclado", kb > 80);
      el.style.setProperty("--teclado", `${kb}px`);
    };
    vv.addEventListener("resize", f); vv.addEventListener("scroll", f); f();
    return () => { vv.removeEventListener("resize", f); vv.removeEventListener("scroll", f); };
  }, []);
}

export function Composer({ envio, foco }: { envio: Envio; foco: number }) {
  const form = useRef<HTMLFormElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const [voz, setVoz] = useState("");
  const draft = S.ui.inboxDraft ?? "";
  useTeclado(form);
  useEffect(() => { crescer(campo.current); }, [draft]);
  useEffect(() => { if (foco) campo.current?.focus(); }, [foco]);
  const set = (v: string) => { S.ui.inboxDraft = v; commit(); };
  const mandar = () => { if (!chat.pensando) void enviar(envio); };
  const anexar = (f: File | undefined) => {
    if (!f) return;
    const v = CH.validarAnexo({ tipo: f.type, bytes: f.size });
    if (arquivo.current) arquivo.current.value = "";
    if (!v.ok) { toast(v.erro); return; }
    chat.anexo = { nome: f.name.slice(0, 60), tipo: v.anexo }; mudou();
  };
  const c = envio.caminho;
  return <form ref={form} class="ch-composer" onSubmit={(e) => { e.preventDefault(); mandar(); }}>
    {chat.anexo && <div class="row ch-anexo"><span class="chip sug"><Icon id={chat.anexo.tipo === "pdf" ? "book" : "cam"} />{chat.anexo.nome}</span>
      <button type="button" class="btn ghost sm" aria-label="Tirar o anexo" onClick={() => { chat.anexo = null; mudou(); }}><Icon id="x" /></button></div>}
    {c.modo === "ambos" && c.conector && <label class="ch-rotina tiny">
      <input type="checkbox" checked={chat.paraRotina} onChange={(e) => { chat.paraRotina = e.currentTarget.checked; mudou(); }} />
      Mandar para a rotina do {c.conector.nome}</label>}
    {voz && <p class="tiny sub ch-voz" role="status" aria-live="polite">{voz}</p>}
    <div class="ch-linha">
      <button type="button" class="ch-btn" aria-label="Anexar foto ou PDF" onClick={() => arquivo.current?.click()}><Icon id="plus" /></button>
      <input ref={arquivo} type="file" accept={CH.ANEXO_ACCEPT} hidden onChange={(e) => anexar(e.currentTarget.files?.[0])} />
      <textarea ref={campo} class="ch-campo" rows={1} aria-label="Mensagem para a IA" placeholder="Mensagem" maxLength={CH.CHAT.textoMax} enterkeyhint="send"
        value={draft} onInput={(e) => { S.ui.inboxDraft = e.currentTarget.value; crescer(e.currentTarget); }} onBlur={() => commit()}
        onKeyDown={(e) => { if (CH.enterEnvia(e)) { e.preventDefault(); S.ui.inboxDraft = e.currentTarget.value; mandar(); } }} />
      <span class="ch-mic"><Mic value={draft} onChange={set} label="Falar a mensagem" onStatus={(s) => setVoz(s === "Toque para falar" ? "" : s)} /></span>
      <button type="submit" class="ch-btn ch-enviar" aria-label="Enviar" disabled={chat.pensando}><Icon id="send" /></button>
    </div>
  </form>;
}
