// #89 Rotinas com a sua chave (Cron Trigger do Worker): revisão de domingo, responder os pedidos da caixa e checar a comida
// do dia. Por rotina: liga/desliga e horário (Brasília); usa a chave desta conversa e o teto dela. O resultado entra na faixa
// "pedidos na rotina" como proposta, nunca como escrita direta.
import { useEffect, useState } from "preact/hooks";
import { SERVER, api } from "../../lib/api/index.ts";
import { Card } from "../../lib/ui/index.tsx";
import { toast } from "../../lib/ui/index.tsx";

type Rotina = { rotina: "revisao" | "pedidos" | "comida"; nome: string; ligada: boolean; hora: number; provedor: string | null };
const DEMO: Rotina[] = [
  { rotina: "revisao", nome: "Revisão de domingo", ligada: false, hora: 9, provedor: null },
  { rotina: "pedidos", nome: "Responder os pedidos da caixa", ligada: false, hora: 9, provedor: null },
  { rotina: "comida", nome: "Checar a comida do dia", ligada: false, hora: 20, provedor: null },
];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

export function RotinasCard({ provedor, nome }: { provedor: string; nome: string }) {
  const [lista, setLista] = useState<Rotina[] | null>(SERVER ? null : DEMO);
  useEffect(() => {
    if (!SERVER) return;
    api<{ rotinas: Rotina[] }>("GET", "/api/chat/rotinas").then((r) => setLista(r.rotinas), () => setLista([]));
  }, []);
  async function salvar(r: Rotina, mudanca: Partial<Rotina>) {
    const nova = { ...r, ...mudanca, provedor };
    setLista((l) => (l ?? []).map((x) => (x.rotina === r.rotina ? nova : x)));
    if (!SERVER) return;
    try { await api("PUT", `/api/chat/rotinas/${r.rotina}`, { ligada: nova.ligada, hora: nova.hora, provedor }); }
    catch { setLista((l) => (l ?? []).map((x) => (x.rotina === r.rotina ? r : x))); toast("Não deu para salvar a rotina"); }
  }
  return <Card cls="ch-rotinas"><h2>Rotinas com a sua chave</h2>
    <p class="small sub">Rodam sozinhas com a chave do {nome} e o teto dela. O resultado chega em “pedidos na rotina”, para você aprovar.</p>
    {lista == null ? <p class="small sub">Carregando…</p> : !lista.length ? <p class="small sub">Não deu para carregar as rotinas.</p>
      : <ul class="ch-rot-lista">{lista.map((r) => <li key={r.rotina} class="row between">
        <label class="ch-rotina"><input type="checkbox" checked={r.ligada} onChange={(ev) => salvar(r, { ligada: (ev.target as HTMLInputElement).checked })} />{r.nome}</label>
        <select class="input ch-rot-hora" aria-label={`Horário: ${r.nome}`} value={r.hora} onChange={(ev) => salvar(r, { hora: Number((ev.target as HTMLSelectElement).value) })}>
          {HORAS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
        </select>
      </li>)}</ul>}
    <p class="tiny sub">A revisão roda só no domingo. Desligue quando quiser.</p>
  </Card>;
}
