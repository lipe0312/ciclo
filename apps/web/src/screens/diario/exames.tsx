// Diário → Saúde → Exames: colar o texto ou escolher um PDF de até 5 MB (lido NO APARELHO com pdf.js sob demanda).
// Só o texto vai para a análise do Chat e é apagado depois dela (máx. 7 dias). Fica só o resumo estruturado.
import { useState } from "preact/hooks";
import { C } from "../../lib/store/index.ts";
import { Card, Icon, toast } from "../../lib/ui/index.tsx";
import { fmt } from "../../lib/util.ts";
import { D, addExam, removeExam } from "../../lib/diario/estado.ts";
import type { Exame } from "../../lib/diario/estado.ts";

const dia = (ms: number) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(new Date(ms)).replace(".", "");
const ST: Record<string, string> = { dentro: "dentro da referência", fora: "fora da referência", sem_referencia: "sem referência no laudo" };

function ExameCard({ e }: { e: Exame }) {
  const left = Math.max(0, Math.ceil((e.expiresAt - Date.now()) / 864e5));
  const [sure, setSure] = useState(false); // apagar em 2 toques, sem diálogo
  const del = () => { if (!sure) { setSure(true); return; } removeExam(e.id).catch(() => {}); };
  return <Card>
    <div class="row between start"><div style="min-width:0"><p class="kicker">Enviado em {dia(e.createdAt)}{e.summary?.data ? ` · laudo de ${e.summary.data.split("-").reverse().join("/")}` : ""}</p><h3 style="margin-top:2px">{e.label}</h3></div>
      {sure ? <button type="button" class="btn sm danger" onClick={del}>Apagar?</button>
        : <button type="button" class="iconbtn" onClick={del} aria-label={`Apagar ${e.label}`}><Icon id="x" /></button>}</div>
    {e.status === "pendente" && <p class="small" style="margin-top:8px"><span class="badge warn">aguardando o Chat</span> <span class="sub">o texto é apagado na análise ou em {left} dia(s)</span></p>}
    {e.status === "expirado" && <p class="small sub" style="margin-top:8px"><span class="badge">texto apagado</span> 7 dias sem análise. Envie de novo se quiser.</p>}
    {e.summary && <>
      <ul class="ex-marc">{e.summary.marcadores.map((m, i) => <li key={i} class={`st-${m.status}`}>
        <span class="ex-nome">{m.nome}</span>
        <span class="num ex-val">{typeof m.valor === "number" ? fmt(m.valor, m.valor % 1 ? 1 : 0) : m.valor}{m.unidade ? ` ${m.unidade}` : ""}</span>
        <span class="tiny sub ex-ref">{m.referencia ? `ref. ${m.referencia} · ` : ""}<b class={`ex-st ${m.status}`}>{ST[m.status]}</b></span></li>)}</ul>
      {e.summary.mudancas.length > 0 && <><h3 style="margin-top:12px">O que muda no plano</h3><ul class="small" style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">{e.summary.mudancas.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      <p class="tiny sub dia-aviso"><Icon id="info" />{e.summary.aviso}</p></>}
  </Card>;
}

export function Exames() {
  const [label, setLabel] = useState(""), [text, setText] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  async function pickPdf(f: File | undefined) {
    if (!f) return;
    const err = C.checkExamFile({ size: f.size, type: f.type });
    if (err) { setMsg(err); return; }
    setBusy(true); setMsg("Lendo o PDF aqui no aparelho…");
    try {
      const { pdfText } = await import("./pdf.ts"); // pdf.js só carrega aqui (ADR-0009)
      const r = await pdfText(f, C.EXAM_MAX_TEXT);
      if (!r.text) { setMsg("Não achei texto no PDF (é foto/escaneado?). Cole o texto do laudo."); return; }
      setText(r.text); if (!label) setLabel(f.name.replace(/\.pdf$/i, "").slice(0, 80));
      setMsg(`${r.pages} página(s) lidas${r.truncated ? " (cortado no limite)" : ""}. Confira o texto e envie.`);
    } catch { setMsg("Não consegui ler este PDF. Cole o texto do laudo."); }
    finally { setBusy(false); }
  }
  async function enviar() {
    if (!text.trim()) return toast("Cole o texto ou escolha um PDF");
    setBusy(true);
    try { await addExam(label.trim(), text.trim()); setText(""); setLabel(""); setMsg(""); toast("Enviado · o Chat analisa e o texto é apagado depois"); }
    catch { /* erro já avisado */ } finally { setBusy(false); }
  }
  return <>
    <p class="kicker">Diário · Saúde</p><h1 style="margin-bottom:14px">Exames</h1>
    <div class="grid dash"><div class="stack">
      <Card><h2>Novo exame</h2>
        <p class="small sub" style="margin-top:4px">O PDF é lido aqui no aparelho e não é guardado. Só o texto vai para o Chat e é apagado depois da análise (no máximo 7 dias). Fica o resumo.</p>
        <label class="f" for="exLabel" style="margin-top:12px">Nome</label>
        <input class="input" id="exLabel" maxLength={80} placeholder="ex.: Exame de sangue de outubro" value={label} onInput={(e) => setLabel(e.currentTarget.value)} />
        <label class="btn full ex-file" style="margin-top:12px"><Icon id="plus" />Escolher PDF (até 5 MB)
          <input type="file" accept="application/pdf" class="ex-file-in" disabled={busy} onChange={(e) => { pickPdf(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} /></label>
        {msg && <p class="small" role="status" style="margin-top:8px">{msg}</p>}
        <label class="f" for="exText" style="margin-top:12px">Texto do laudo</label>
        <textarea class="input" id="exText" rows={6} maxLength={C.EXAM_MAX_TEXT} placeholder="ou cole aqui o texto do laudo" value={text} onInput={(e) => setText(e.currentTarget.value)} />
        <p class="tiny sub num" style="margin-top:4px">{fmt(text.length)} / {fmt(C.EXAM_MAX_TEXT)} caracteres</p>
        <button type="button" class="btn pri full" style="margin-top:12px" disabled={busy || !text.trim()} onClick={enviar} aria-describedby="exHint"><Icon id="send" />Enviar para análise</button>
        {(busy || !text.trim()) && <p class="tiny sub" id="exHint" style="margin-top:6px">{busy ? "Aguarde: lendo ou enviando…" : "Falta o texto: escolha um PDF ou cole o laudo acima."}</p>}</Card></div>
      <div class="stack">{D.exams.length ? D.exams.map((e) => <ExameCard key={e.id} e={e} />)
        : <Card><p class="small sub">Nenhum exame ainda. O resumo mostra vitamina D, ferritina, glicemia, perfil lipídico, testosterona, TSH etc., com “dentro/fora da referência” do próprio laudo.</p></Card>}</div></div>
  </>;
}
