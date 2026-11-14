// API + fila offline (a academia nem sempre tem sinal). Erro HTTP (com status) não vai para a fila.
import { lsGet, lsSet } from "../util.ts";

export const SERVER = location.protocol.startsWith("http") && !/[?&]demo\b/.test(location.search);
const QK = "ciclo:v1:queue";
type Q = { method: string; path: string; body?: unknown };
export let queue: Q[] = lsGet<Q[]>(QK, []);
const listeners = new Set<() => void>();
export const onQueue = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };
const changed = () => { lsSet(QK, queue); listeners.forEach((f) => f()); };

export class HttpError extends Error {
  status: number; data: unknown;
  constructor(msg: string, status: number, data: unknown) { super(msg); this.status = status; this.data = data; }
}

export async function api<T = any>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const r = await fetch(path, {
    method, credentials: "same-origin",
    headers: raw ? { "Content-Type": raw.type } : body ? { "Content-Type": "application/json" } : {},
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = r.headers.get("Content-Type")?.includes("json") ? await r.json() : null;
  // #54: sessão ausente/vencida em /api → tela #entrar (volta para a rota de origem depois do login)
  if (r.status === 401 && data?.code === "entrar") paraEntrar();
  if (!r.ok) throw new HttpError(data?.error || `HTTP ${r.status}`, r.status, data);
  return data as T;
}

/** Vai para #entrar guardando a rota atual em ?volta= (não repete se já está lá). */
export function paraEntrar() {
  if (location.hash.startsWith("#entrar")) return;
  const volta = location.hash && location.hash !== "#" ? location.hash : "#hoje";
  location.hash = "#entrar?volta=" + encodeURIComponent(volta);
}

let onHttpError: (msg: string) => void = () => {};
export const setHttpErrorHandler = (f: (msg: string) => void) => { onHttpError = f; };

/** Grava no servidor; sem rede, entra na fila e sai quando voltar. No demo, não faz nada. */
export async function send<T = any>(method: string, path: string, body?: unknown): Promise<T | null> {
  if (!SERVER) return null;
  try { await flush(); return await api<T>(method, path, body); }
  catch (e) {
    if (e instanceof HttpError) { onHttpError(e.message); throw e; }
    queue.push({ method, path, body }); changed(); return null;
  }
}
export async function flush() {
  while (queue.length) {
    const q = queue[0];
    try { await api(q.method, q.path, q.body); } catch (e) { if (!(e instanceof HttpError)) throw e; }
    queue.shift(); changed();
  }
}
addEventListener("online", () => { flush().catch(() => {}); changed(); });
addEventListener("offline", changed);
