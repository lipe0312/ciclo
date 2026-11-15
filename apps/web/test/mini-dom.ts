// DOM mínimo para renderizar telas Preact no `node --test` (sem dependência nova). Cobre o que o Preact usa ao montar e
// atualizar: criar nós, atributos, propriedades, estilo, eventos e a árvore. Também traz os globais do navegador que o app lê.
type Ouvinte = (e: { type: string; target: No; currentTarget: No; preventDefault(): void; defaultPrevented: boolean }) => void;

export class No {
  childNodes: No[] = [];
  parentNode: No | null = null;
  attrs: Record<string, string> = {};
  ouvintes: Record<string, Ouvinte[]> = {};
  style: Record<string, string> & { setProperty(k: string, v: string): void; cssText: string };
  value = "";
  data = "";
  // o Preact usa o nome do evento em minúsculas quando `on<evento>` existe no nó
  onclick = null; oninput = null; onchange = null; onkeydown = null;
  nodeType: number; localName: string; namespaceURI: string | null;
  constructor(nodeType: number, localName: string, namespaceURI: string | null = null) {
    this.nodeType = nodeType; this.localName = localName; this.namespaceURI = namespaceURI;
    const st = { cssText: "" } as Record<string, string> & { setProperty(k: string, v: string): void; cssText: string };
    st.setProperty = (k, v) => { st[k] = v; };
    this.style = st;
  }
  get nodeName() { return this.localName.toUpperCase(); }
  get tagName() { return this.nodeName; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get nextSibling(): No | null { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] ?? null; }
  get ownerDocument() { return globalThis.document; }
  get textContent(): string { return this.nodeType === 3 ? this.data : this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v: string) { this.childNodes = []; if (v) this.appendChild(Object.assign(new No(3, "#text"), { data: v })); }
  get className() { return this.attrs.class ?? ""; }
  insertBefore(n: No, ref: No | null) {
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    return n;
  }
  appendChild(n: No) { return this.insertBefore(n, null); }
  removeChild(n: No) { this.childNodes = this.childNodes.filter((c) => c !== n); n.parentNode = null; return n; }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute(k: string, v: unknown) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  hasAttribute(k: string) { return k in this.attrs; }
  addEventListener(t: string, f: Ouvinte) { (this.ouvintes[t] ??= []).push(f); }
  removeEventListener(t: string, f: Ouvinte) { this.ouvintes[t] = (this.ouvintes[t] ?? []).filter((x) => x !== f); }
  dispatch(type: string): void {
    const e = { type, target: this as No, currentTarget: this as No, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const f of this.ouvintes[type] ?? []) f.call(this, e);
  }
  click() { if (!this.hasAttribute("disabled")) this.dispatch("click"); }
  focus() { /* sem foco no teste */ }
  /** Todos os elementos descendentes. */
  todos(): No[] { return this.childNodes.flatMap((c) => (c.nodeType === 1 ? [c, ...c.todos()] : [])); }
  porClasse(cls: string) { return this.todos().filter((e) => e.className.split(/\s+/).includes(cls)); }
}

/** Instala `document`, `location`, `localStorage` e companhia. `hash` é a rota inicial. */
export function instalarNavegador(hash = "#hoje") {
  const g = globalThis as Record<string, any>;
  const doc = {
    createElement: (t: string) => new No(1, t.toLowerCase()),
    createElementNS: (ns: string, t: string) => new No(1, t, ns),
    createTextNode: (d: string) => Object.assign(new No(3, "#text"), { data: String(d) }),
    body: new No(1, "body"), documentElement: Object.assign(new No(1, "html"), { dataset: {} }),
    activeElement: null, addEventListener() {}, removeEventListener() {}, hidden: false,
  };
  const mem = new Map<string, string>();
  const loc = { protocol: "http:", search: "", hash, pathname: "/", href: `http://localhost:8791/${hash}`, origin: "http://localhost:8791" };
  Object.assign(g, {
    document: doc, location: loc,
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() },
    history: { replaceState: (_s: unknown, _t: string, u: string) => { loc.hash = u.slice(u.indexOf("#")); } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  Object.defineProperty(g, "navigator", { value: { onLine: true, serviceWorker: undefined }, configurable: true });
  return { mem, loc };
}

/** Texto de um nó sem espaços repetidos. */
export const texto = (n: No) => n.textContent.replace(/\s+/g, " ").trim();
