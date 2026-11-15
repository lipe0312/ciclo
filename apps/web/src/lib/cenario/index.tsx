// #70 Botão discreto "↺ cenário": só em localhost e só quando o app foi aberto por `npm run dev:cenario`
// (o servidor responde em /api/dev/cenario; em qualquer outro caso o botão nem é desenhado).
import { useEffect, useState } from "preact/hooks";
import { SERVER } from "../api/index.ts";
import { chavesDoCiclo, ehLocalhost } from "./regras.ts";
import { toast } from "../ui/index.tsx";

async function resetar(setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    const r = await fetch("/api/dev/cenario/reset", { method: "POST", credentials: "same-origin" });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "o reset falhou");
    try { for (const k of chavesDoCiclo(Object.keys(localStorage))) localStorage.removeItem(k); } catch { /* sem storage */ }
    location.hash = ""; location.reload();
  } catch (e: any) { toast(e?.message ?? "o reset falhou"); setBusy(false); }
}

export function BotaoCenario() {
  const [nome, setNome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!SERVER || !ehLocalhost(location.hostname)) return;
    fetch("/api/dev/cenario", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((j: { nome?: string } | null) => setNome(j?.nome ?? null)).catch(() => {});
  }, []);
  if (!nome) return null;
  return <button type="button" class="cenario-btn" disabled={busy} onClick={() => resetar(setBusy)} title={`Volta o cenário ${nome} ao início`} aria-label={`Resetar o cenário ${nome}`}>{busy ? "…" : "↺ cenário"}</button>;
}
