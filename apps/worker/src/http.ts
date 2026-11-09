// Utilidades HTTP: respostas JSON com cabeçalhos de segurança, leitura de corpo com limite, validação leve.

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cache-Control": "no-store",
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 64 * 1024): Promise<T> {
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (len > maxBytes) throw new HttpError(413, "corpo grande demais");
  if (!(req.headers.get("Content-Type") ?? "").includes("application/json")) throw new HttpError(415, "use application/json");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "corpo grande demais");
  try { return JSON.parse(text) as T; } catch { throw new HttpError(400, "JSON inválido"); }
}

// ---- validação mínima (sem dependências) ----
export const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export function str(v: unknown, field: string, max = 500, required = true): string | null {
  if (v == null || v === "") { if (required) throw new HttpError(400, `${field} obrigatório`); return null; }
  if (typeof v !== "string" || v.length > max) throw new HttpError(400, `${field} inválido`);
  return v;
}
export function int(v: unknown, field: string, min: number, max: number, required = true): number | null {
  if (v == null) { if (required) throw new HttpError(400, `${field} obrigatório`); return null; }
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new HttpError(400, `${field} fora de ${min}..${max}`);
  return v;
}
export function num(v: unknown, field: string, min: number, max: number, required = true): number | null {
  if (v == null) { if (required) throw new HttpError(400, `${field} obrigatório`); return null; }
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new HttpError(400, `${field} fora de ${min}..${max}`);
  return v;
}
export function oneOf<T extends string>(v: unknown, field: string, opts: readonly T[]): T {
  if (typeof v !== "string" || !opts.includes(v as T)) throw new HttpError(400, `${field} deve ser ${opts.join("|")}`);
  return v as T;
}
export function date(v: unknown, field = "date"): string {
  if (!isDate(v)) throw new HttpError(400, `${field} deve ser YYYY-MM-DD`);
  return v;
}
export const id = () => crypto.randomUUID();
