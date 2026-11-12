// D1 e R2 falsos para testar o Worker real no Node (node:sqlite, sem dependência). Aplica as migrations de verdade.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

const MIG = new URL("../migrations/", import.meta.url);
type V = string | number | null;
const norm = (a: unknown[]): V[] => a.map((v) => {
  if (v === undefined) throw new Error("D1_TYPE_ERROR: undefined");
  return typeof v === "boolean" ? Number(v) : (v as V);
});
const plain = (r: unknown) => (r ? { ...(r as object) } : null);

class Stmt {
  db: DatabaseSync; sql: string; args: V[];
  constructor(db: DatabaseSync, sql: string, args: V[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a: unknown[]) { return new Stmt(this.db, this.sql, norm(a)); }
  async first<T>(col?: string): Promise<T | null> {
    const r = plain(this.db.prepare(this.sql).get(...this.args)) as Record<string, unknown> | null;
    return (r ? (col ? r[col] : r) : null) as T | null;
  }
  allSync() { return { success: true, meta: {}, results: this.db.prepare(this.sql).all(...this.args).map(plain) }; }
  async all() { return this.allSync(); }
  async run() {
    const i = this.db.prepare(this.sql).run(...this.args);
    return { success: true, results: [], meta: { changes: Number(i.changes), last_row_id: Number(i.lastInsertRowid) } };
  }
}

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, MIG), "utf8"));
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(st: Stmt[]) {
      db.exec("BEGIN");
      try { const r = st.map((s) => s.allSync()); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

export function fakeR2() {
  const m = new Map<string, Uint8Array>();
  return {
    m,
    async put(key: string, body: BodyInit | null) { const b = new Uint8Array(await new Response(body).arrayBuffer()); m.set(key, b); return { key, size: b.length }; },
    async get(key: string, o?: { range?: { offset: number; length: number } }) {
      const b = m.get(key); if (!b) return null;
      const part = o?.range ? b.slice(o.range.offset, o.range.offset + o.range.length) : b;
      return { body: new Response(part).body, size: part.length };
    },
    async delete(k: string | string[]) { for (const x of [k].flat()) m.delete(x); },
    async list(o: { prefix?: string; cursor?: string; limit?: number }) {
      const keys = [...m.keys()].filter((k) => k.startsWith(o.prefix ?? "")).sort();
      const s = Number(o.cursor ?? 0), e = s + (o.limit ?? 1000);
      return { objects: keys.slice(s, e).map((key) => ({ key })), truncated: e < keys.length, cursor: String(e) };
    },
  };
}

export const BOOT = "b".repeat(64);
export function makeEnv(extra: Record<string, unknown> = {}) {
  return {
    DB: fakeD1(), MEDIA: fakeR2(), AI: { run: async () => ({ text: "ok" }) },
    ASSETS: { fetch: async () => new Response("asset") }, APP_VERSION: "test", DEV_NO_AUTH: "1", MCP_TOKEN: BOOT, ...extra,
  } as any;
}

const worker = (await import("../src/index.ts")).default as { fetch(r: Request, e: unknown): Promise<Response> };
export async function call(env: unknown, method: string, path: string, o: { user?: string; body?: unknown; raw?: Uint8Array; ct?: string; bearer?: string; host?: string; headers?: Record<string, string> } = {}) {
  const h: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.user) h["x-dev-user"] = o.user;
  if (o.bearer) h.Authorization = `Bearer ${o.bearer}`;
  let body: BodyInit | undefined;
  if (o.raw) { body = o.raw; h["Content-Type"] = o.ct!; h["Content-Length"] = String(o.raw.length); }
  else if (o.body !== undefined) { body = JSON.stringify(o.body); h["Content-Type"] = "application/json"; }
  const r = await worker.fetch(new Request(`http://${o.host ?? "localhost:8791"}${path}`, { method, headers: h, body }), env);
  const text = await r.text();
  let data: any = null; try { data = JSON.parse(text); } catch { /* binário */ }
  return { status: r.status, text, data, headers: r.headers };
}
export const mcp = (env: unknown, token: string, name: string, args: Record<string, unknown> = {}) =>
  call(env, "POST", "/mcp", { bearer: token, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
