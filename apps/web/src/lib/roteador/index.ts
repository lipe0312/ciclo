// Roteador por hash com estado na URL: #tela/parte/parte?chave=valor  (ex.: #treino/exercicio/Face_Pull, #treino/exercicios?q=rosca)
import { useEffect, useState } from "preact/hooks";

export interface Route { screen: string; parts: string[]; query: Record<string, string> }
export function parse(hash = location.hash): Route {
  const raw = hash.replace(/^#/, "");
  const [path, qs = ""] = raw.split("?");
  const [screen = "", ...parts] = path.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  return { screen: screen || "hoje", parts, query: Object.fromEntries(new URLSearchParams(qs)) };
}
export function href(screen: string, parts: string[] = [], query: Record<string, string | null | undefined> = {}) {
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== "") as [string, string][]).toString();
  return "#" + [screen, ...parts.map(encodeURIComponent)].join("/") + (q ? "?" + q : "");
}
export function go(h: string) { location.hash = h; }
/** Atualiza a URL sem criar entrada no histórico (filtros, busca enquanto digita). */
export function replace(h: string) { history.replaceState(null, "", location.pathname + location.search + h); dispatchEvent(new Event("rota")); }

export function useRoute(): Route {
  const [r, set] = useState(parse());
  useEffect(() => {
    const f = () => set(parse());
    addEventListener("hashchange", f); addEventListener("rota", f);
    return () => { removeEventListener("hashchange", f); removeEventListener("rota", f); };
  }, []);
  return r;
}
