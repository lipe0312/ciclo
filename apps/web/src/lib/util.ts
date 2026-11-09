// Utilidades de data, número e IDs (sem estado).
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
export const fmt = (n: number, d = 0) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const TZ = "America/Sao_Paulo";
export const isoDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const DOW = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
export const DOW_NM = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const dowIdx = (iso: string) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;
export const longDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })
  .format(new Date(iso + "T12:00:00Z")).replace(/^./, (c) => c.toUpperCase()).replace(".", "");
/** Imagem do catálogo: n=0 início (img/ex/<id>.webp), n=1 fim (img/ex/<id>-1.webp). */
export const img = (id: string, n = 0) => `/img/ex/${encodeURIComponent(id)}${n ? `-${n}` : ""}.webp`;
export const lsGet = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
export const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } };
export const getPath = (o: any, path: string) => path.split(".").reduce((a, k) => a?.[k], o);
export function setPath(o: any, path: string, v: unknown) { const ks = path.split("."); const last = ks.pop()!; const t = ks.reduce((a, k) => (a[k] ??= {}), o); t[last] = v; }
