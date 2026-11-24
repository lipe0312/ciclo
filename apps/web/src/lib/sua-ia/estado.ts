// #133 Estado da IA da pessoa para as telas: lê GET /api/account/ia (conexão MCP + provedores com chave ativa; nada de
// segredo) e calcula o estadoIA do core com o perfil.ia. Uma busca por sessão (e de novo quando alguém chama recarregar).
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { SERVER, api } from "../api/index.ts";
import { S } from "../store/index.ts";
import { lsGet, lsSet } from "../util.ts";

/** #138 `consumo`: chaves ativas a partir de 80% do teto do dia ou do mês (texto pronto do servidor, sem segredo). */
export interface ContaIa { conector: C.EstadoConector; chaves: C.ChaveResumo[]; consumo?: { id: string; texto: string; pct: number }[] }
const VAZIO: ContaIa = { conector: "nenhum", chaves: [], consumo: [] };
let cache: ContaIa | null = SERVER ? null : VAZIO;
let pedindo: Promise<void> | null = null;
const subs = new Set<() => void>();
const avisar = () => subs.forEach((f) => f());

export function recarregarContaIa(): Promise<void> {
  if (!SERVER) return Promise.resolve();
  pedindo ??= api<ContaIa>("GET", "/api/account/ia").then((r) => { cache = r; avisar(); }).catch(() => { /* offline: segue com o que tinha */ }).finally(() => { pedindo = null; });
  return pedindo;
}

/** Conta (conexão e chaves) + estadoIA do perfil atual. null enquanto carrega. */
export function useEstadoIa(): { conta: ContaIa; estado: C.EstadoIa } | null {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); if (!cache) void recarregarContaIa(); return () => { subs.delete(f); }; }, []);
  if (!cache) return null;
  return { conta: cache, estado: C.estadoIA(S.profile.ia, cache.conector, cache.chaves) };
}

// ---------- dispensa do aviso (7 dias; conveniência deste aparelho) ----------
const KEY = "ciclo:aviso-ia";
type Dispensa = { id: string; chave: string; em: number };
export const dispensaAviso = (): Dispensa | null => lsGet<Dispensa | null>(KEY, null);
export function dispensarAviso(a: C.AvisoIa) { lsSet(KEY, { id: a.id, chave: a.chave, em: Date.now() }); avisar(); }
