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

/**
 * Teclado aberto: quanto o visualViewport encolheu embaixo. Só com o campo focado e acima de 80 px (barra de endereço e
 * zoom mexem uns pixels): o composer sobe para cima do teclado. Também publica a altura da barra inferior (--nav-h) e a do
 * composer (--ch-comp) no .ch, para a última mensagem nunca ficar embaixo dele.
 */
function useTeclado(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const raiz = el.parentElement;
    const vv = (globalThis as { visualViewport?: VisualViewport }).visualViewport;
    const f = () => {
      const focado = !!document.activeElement && !!el.contains?.(document.activeElement);
      const kb = vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;
      const aberto = focado && kb >= 80;
      if (aberto) el.setAttribute("data-teclado", ""); else el.removeAttribute("data-teclado");
      el.style.setProperty("--teclado", `${aberto ? kb : 0}px`);
      const nav = document.querySelector?.(".bottom")?.getBoundingClientRect().height;
      if (raiz && nav) raiz.style.setProperty("--nav-h", `${Math.round(nav)}px`);
    };
    const medir = () => { const h = el.getBoundingClientRect?.().height; if (raiz && h) raiz.style.setProperty("--ch-comp", `${Math.round(h)}px`); };
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    ro?.observe(el); medir();
    vv?.addEventListener("resize", f); vv?.addEventListener("scroll", f);
    el.addEventListener("focusin", f); el.addEventListener("focusout", f); f();
    return () => {
      ro?.disconnect();
      vv?.removeEventListener("resize", f); vv?.removeEventListener("scroll", f);
      el.removeEventListener("focusin", f); el.removeEventListener("focusout", f);
    };
  }, []);
}

export function Composer({ envio, foco }: { envio: Envio; foco: number }) {
  const form = useRef<HTMLFormElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const [voz, setVoz] = useState("");
  const draft = S.ui.inboxDraft ?? "";
  useTeclado(form);
  useEffect(() => { crescer(campo.current); }); // a cada desenho: digitar não re-renderiza, então o "antes" do envio não é confiável
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
