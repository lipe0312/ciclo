// Mapa do lugar: Leaflet + OpenStreetMap (ADR-0010). Carregado sob demanda (fora do JS inicial). Toque no mapa marca o ponto;
// "usar minha localização" só pede permissão no toque; a busca de endereço passa pelo Worker (Nominatim, 1 req/s).
import { useEffect, useRef, useState } from "preact/hooks";
import { S } from "../../lib/store/index.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import "./academias.css";

export interface Ponto { lat: number; lng: number }
/** Posição inicial: o ponto do lugar; senão o de algum lugar já marcado; senão o Brasil inteiro. */
const centroPadrao = (p: Ponto | null): { c: Ponto; z: number } => {
  if (p) return { c: p, z: 16 };
  const g = S.gyms.find((x) => x.lat != null && x.lng != null);
  return g ? { c: { lat: g.lat!, lng: g.lng! }, z: 13 } : { c: { lat: -14.2, lng: -51.9 }, z: 4 };
};
export const linkMapa = (p: Ponto) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;

/** O mapa em si. `onPick` ausente = só mostra. `foco` (muda a cada busca/localização) leva o mapa até o ponto. */
export function Mapa({ ponto, onPick, foco, rotulo }: { ponto: Ponto | null; onPick?: (p: Ponto) => void; foco?: { n: number } | null; rotulo: string }) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<{ map: any; pin: any; L: any } | null>(null);
  const pick = useRef(onPick); pick.current = onPick;
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let morto = false;
    (async () => {
      try {
        const [L] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (morto || !el.current) return;
        const { c, z } = centroPadrao(ponto);
        const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([c.lat, c.lng], z);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, referrerPolicy: "origin", // a política dos tiles pede um Referer; só a origem vai, nunca o caminho
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        }).addTo(map);
        const pin = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "lug-pin", html: "<i></i>", iconSize: [32, 40], iconAnchor: [16, 40] }), keyboard: false });
        if (ponto) pin.addTo(map);
        map.on("click", (e: any) => { if (!pick.current) return; pin.setLatLng(e.latlng).addTo(map); pick.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
        st.current = { map, pin, L };
        setTimeout(() => map.invalidateSize(), 0);
      } catch { setErro(true); }
    })();
    return () => { morto = true; st.current?.map.remove(); st.current = null; };
  }, []);

  // o ponto mudou por fora (busca, localização, "usar o centro"): move o pino; o mapa só viaja quando `foco` muda
  useEffect(() => {
    const s = st.current; if (!s) return;
    if (ponto) { s.pin.setLatLng([ponto.lat, ponto.lng]); s.pin.addTo(s.map); } else s.pin.remove();
  }, [ponto?.lat, ponto?.lng]);
  useEffect(() => { const s = st.current; if (s && foco && ponto) s.map.setView([ponto.lat, ponto.lng], 17); }, [foco?.n]);

  if (erro) return <div class="note warn"><Icon id="warn" /><span>Não consegui carregar o mapa (sem internet?). Dá para continuar e marcar o ponto depois.</span></div>;
  return <div class="lug-map" ref={el} role="application" aria-label={rotulo} />;
}

/** Mapa + busca de endereço + "usar minha localização" + "marcar o centro". Controlado por fora (ponto e endereço). */
export function SeletorDeLocal({ ponto, endereco, onChange }: { ponto: Ponto | null; endereco: string; onChange: (p: Ponto | null, endereco: string) => void }) {
  const [q, setQ] = useState(""), [achados, setAchados] = useState<{ label: string; lat: number; lng: number }[] | null>(null);
  const [ocupado, setOcupado] = useState(false), [foco, setFoco] = useState({ n: 0 });
  const ir = (p: Ponto, end?: string) => { onChange(p, end ?? endereco); setFoco((f) => ({ n: f.n + 1 })); };

  const buscar = async (e: Event) => {
    e.preventDefault();
    const t = q.trim();
    if (t.length < 3) return toast("Digite ao menos 3 letras");
    if (!SERVER) return toast("A busca de endereço precisa do app conectado. Toque no mapa para marcar.");
    setOcupado(true);
    try { setAchados((await api<{ results: { label: string; lat: number; lng: number }[] }>("GET", `/api/geocode?q=${encodeURIComponent(t)}`)).results); }
    catch (err: any) { toast(err?.message || "Busca indisponível; toque no mapa para marcar"); setAchados(null); }
    finally { setOcupado(false); }
  };
  const minhaLocalizacao = () => {
    if (!navigator.geolocation) return toast("Este aparelho não informa a localização. Busque o endereço ou toque no mapa.");
    setOcupado(true);
    // só aqui, no toque, o navegador pede a permissão
    navigator.geolocation.getCurrentPosition(
      (pos) => { setOcupado(false); ir({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast("Ponto marcado onde você está. Ajuste tocando no mapa."); },
      (err) => { setOcupado(false); toast(err.code === 1 ? "Sem permissão de localização. Busque o endereço ou toque no mapa." : "Não consegui pegar sua localização. Busque o endereço ou toque no mapa."); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  };

  return <div class="lug-local">
    <form class="lug-busca" onSubmit={buscar} role="search">
      <label class="sr" for="lug-q">Buscar endereço</label>
      <input id="lug-q" class="input" type="search" value={q} maxLength={120} placeholder="Rua, número, cidade" autocomplete="street-address" onInput={(e) => setQ(e.currentTarget.value)} />
      <button type="submit" class="btn" disabled={ocupado}><Icon id="search" />Buscar</button>
    </form>
    {achados && <ul class="lug-achados" aria-label="Resultados da busca">
      {achados.length ? achados.map((r, i) => <li key={i}><button type="button" onClick={() => { ir({ lat: r.lat, lng: r.lng }, r.label.slice(0, 160)); setAchados(null); }}><Icon id="gym" /><span>{r.label}</span></button></li>)
        : <li class="small sub" style="padding:10px 4px">Nada encontrado. Tente com a cidade ou toque no mapa.</li>}</ul>}
    <div class="row wrapx" style="gap:8px;margin:10px 0 0"><button type="button" class="btn" disabled={ocupado} onClick={minhaLocalizacao}><Icon id="target" />Usar minha localização</button>
      {ponto && <button type="button" class="btn ghost" onClick={() => onChange(null, endereco)}>Tirar o ponto</button>}</div>
    <div class="lug-end"><label class="f" for="lug-end">Endereço (opcional)</label>
      <input id="lug-end" class="input" value={endereco} maxLength={160} placeholder="Como aparece na lista" onInput={(e) => onChange(ponto, e.currentTarget.value)} /></div>
    <Mapa ponto={ponto} onPick={(p) => onChange(p, endereco)} foco={foco} rotulo="Mapa: toque para marcar onde fica o lugar" />
    <p class="small sub lug-status" aria-live="polite">{ponto ? `Ponto marcado (${ponto.lat.toFixed(4)}, ${ponto.lng.toFixed(4)}). Toque em outro lugar do mapa para mover.` : "Toque no mapa para marcar o ponto."}</p>
  </div>;
}
