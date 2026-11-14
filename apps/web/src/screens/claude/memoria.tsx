// #30 Status honesto da fila (online agora / na fila · ~N min), checklist "Chat ligado" e a memória do Chat
// (o dono vê, edita e apaga). No servidor: GET /api/claude; no demo, dados fictícios em memória.
import { useEffect, useState } from "preact/hooks";
import { C } from "../../lib/store/index.ts";
import { SERVER, api, send } from "../../lib/api/index.ts";
import { Card, Icon, toast } from "../../lib/ui/index.tsx";
import { abrirComoConectar } from "./conectar.tsx";

export interface Fato { id: string; fato: string; fonte: string; criadoEm: number; expiraEm: number | null }
export interface ClaudeInfo { status: { modo: C.ModoClaude; texto: string; checklist: { connector: boolean; rotina: boolean; vigia: boolean } }; pendentes: number; memoria: Fato[]; limite: number; openai?: boolean }

const DEMO: ClaudeInfo = {
  status: C.statusClaude({ agora: Date.now(), rotinaEm: Date.now() - 150 * 60e3, connectorEm: Date.now() - 3600e3, pendentes: 1 }),
  pendentes: 1, limite: C.MEMORIA.max,
  memoria: [
    { id: "f1", fato: "prefere halteres quando a academia lota", fonte: "claude", criadoEm: Date.now() - 864e5, expiraEm: null },
    { id: "f2", fato: "joelho direito incomoda em agachamento profundo", fonte: "claude", criadoEm: Date.now() - 5 * 864e5, expiraEm: null },
  ],
};
let cache: ClaudeInfo | null = SERVER ? null : structuredClone(DEMO);
const subs = new Set<() => void>();
const changed = () => subs.forEach((f) => f());

export async function loadClaude() {
  if (!SERVER) return;
  try { cache = await api<ClaudeInfo>("GET", "/api/claude"); changed(); } catch { /* offline: mantém o que tinha */ }
}
export function useClaude(): ClaudeInfo | null {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); if (!cache) loadClaude(); return () => { subs.delete(f); }; }, []);
  return cache;
}

export function StatusFila({ info }: { info: ClaudeInfo | null }) {
  if (!info) return <span class="badge">carregando…</span>;
  const cls = info.status.modo === "online" ? "ok" : info.status.modo === "fila" ? "warn" : "";
  return <span class={`badge ${cls}`} role="status"><Icon id={info.status.modo === "online" ? "check" : "clock"} style="width:12px;height:12px" />{info.status.texto}</span>;
}

export function ClaudeLigado({ info }: { info: ClaudeInfo | null }) {
  const c = info?.status.checklist;
  const linha = (on: boolean | undefined, nm: string, dica: string) => <li class="row start" style="gap:8px;padding:6px 0">
    <Icon id={on ? "check" : "warn"} style={`width:16px;height:16px;flex:none;color:var(${on ? "--ok" : "--warn"})`} />
    <div><b class="small">{nm}: {on ? "ok" : "não"}</b><div class="tiny sub">{dica}</div></div></li>;
  // #66: conexão pela URL + Face ID (folha "Como conectar"); a rotina na nuvem responde sem computador; o vigia é opcional.
  return <Card><h2>Chat ligado</h2>
    <ul style="list-style:none;padding:0;margin:8px 0 0">
      {linha(c?.connector, "Conexão responde", "URL do Ciclo + Face ID, em Como conectar (a chave manual em Conta é o plano B)")}
      {linha(c?.rotina, "Rotina rodou nas últimas 3 h", "rotina na nuvem: responde os pedidos com o celular e o computador desligados")}
      {linha(c?.vigia, "Vigia no computador (opcional)", "responde em segundos, só se você quiser deixar um computador ligado")}
    </ul>
    {info?.openai && <p class="small" role="note" style="margin-top:8px;color:var(--warn)"><Icon id="warn" style="width:14px;height:14px;vertical-align:-2px" /> IA de reserva (OpenAI) ligada pelo dono do app: pedidos para gerar ou ajustar treino enviam dados de treino e saúde à OpenAI.</p>}
    <button type="button" class="btn full" style="margin-top:8px" onClick={abrirComoConectar}><Icon id="key" />Como conectar</button></Card>;
}

function FatoItem({ f, onSave, onDel }: { f: Fato; onSave: (t: string) => void; onDel: () => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  if (edit != null) return <li style="padding:8px 0;border-top:1px solid var(--borda)">
    <input class="input" value={edit} maxLength={C.MEMORIA.fatoMax} aria-label="Editar fato" onInput={(e) => setEdit(e.currentTarget.value)} />
    <div class="row" style="gap:6px;margin-top:6px"><button type="button" class="btn pri sm" onClick={() => { onSave(edit); setEdit(null); }}><Icon id="check" />Salvar</button>
      <button type="button" class="btn sm" onClick={() => setEdit(null)}>Cancelar</button></div></li>;
  return <li class="row between" style="gap:8px;padding:4px 0;border-top:1px solid var(--borda)">
    <div style="min-width:0;overflow-wrap:anywhere"><span class="small">{f.fato}</span>
      <div class="tiny sub">{f.fonte === "claude" ? "anotado pelo Chat" : "anotado por você"}{f.expiraEm ? ` · vale até ${new Date(f.expiraEm).toLocaleDateString("pt-BR")}` : ""}</div></div>
    <div class="row" style="gap:0;flex:none">
      <button type="button" class="btn ghost sm" aria-label={`Editar: ${f.fato}`} onClick={() => setEdit(f.fato)}><Icon id="edit" /></button>
      <button type="button" class="btn ghost sm" aria-label={`Apagar: ${f.fato}`} onClick={onDel}><Icon id="x" /></button></div></li>;
}

export function MemoriaCard({ info }: { info: ClaudeInfo | null }) {
  const [novo, setNovo] = useState("");
  const fatos = info?.memoria ?? [];
  const valida = (t: string) => { const v = C.validarMemoria({ fato: t }, Date.now()); if (!v.ok) toast(v.erro); return v.ok ? v.value.fact : null; };
  const add = async () => {
    const fact = valida(novo); if (!fact || !info) return;
    if (fatos.length >= info.limite) return toast(`Memória cheia (${info.limite}). Apague algum fato.`);
    const r = SERVER ? await send<{ id: string }>("POST", "/api/claude/memoria", { fato: fact }).catch(() => null) : { id: String(Date.now()) };
    if (!r) return;
    info.memoria = [{ id: r.id, fato: fact, fonte: "app", criadoEm: Date.now(), expiraEm: null }, ...fatos]; setNovo(""); changed();
  };
  const save = async (f: Fato, t: string) => {
    const fact = valida(t); if (!fact) return;
    if (SERVER && !(await send("PUT", `/api/claude/memoria/${encodeURIComponent(f.id)}`, { fato: fact }).catch(() => null))) return;
    f.fato = fact; f.expiraEm = null; changed();
  };
  const del = async (f: Fato) => {
    if (SERVER && !(await send("DELETE", `/api/claude/memoria/${encodeURIComponent(f.id)}`).catch(() => null))) return;
    if (info) info.memoria = fatos.filter((x) => x.id !== f.id); changed(); toast("Fato apagado");
  };
  return <Card><div class="row between wrapx"><h2>Memória do Chat</h2><span class="badge">{fatos.length}/{info?.limite ?? C.MEMORIA.max}</span></div>
    <p class="small sub" style="margin:4px 0 8px">O que o Chat aprendeu sobre você e usa para decidir. Corrija ou apague o que não vale mais.</p>
    <ul style="list-style:none;padding:0;margin:0">{fatos.map((f) => <FatoItem key={f.id} f={f} onSave={(t) => save(f, t)} onDel={() => del(f)} />)}</ul>
    {!fatos.length && <p class="small sub">Nada anotado ainda.</p>}
    <div class="row" style="gap:8px;margin-top:10px"><input class="input" value={novo} maxLength={C.MEMORIA.fatoMax} placeholder="ex.: prefiro treinar de manhã" aria-label="Novo fato para o Chat"
      onInput={(e) => setNovo(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
      <button type="button" class="btn sm" style="flex:none" onClick={add} aria-label="Adicionar fato"><Icon id="plus" /></button></div></Card>;
}
