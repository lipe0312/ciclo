// #140 Perfil → Sua IA → Avançado: modelo e esforço por tipo de pedido (gerar a semana, revisar o treino, comida, pedidos da
// rotina). Os modelos vêm da lista da própria chave (#88, GET /api/account/chaves); a regra e o texto vêm do core
// ("@ciclo/core/ia-pedidos"). Baixa só quando a pessoa abre o Avançado (fora do JS inicial e do JS da tela). Salva no perfil.
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { ROTULO_PEDIDO_IA, TIPOS_PEDIDO_IA, validarPrefPedidoIa } from "@ciclo/core/ia-pedidos";
import type { ModelosDasChaves, PrefPedidoIa, TipoPedidoIa } from "@ciclo/core/ia-pedidos";
import { SERVER, api } from "../../lib/api/index.ts";
import { S, commit } from "../../lib/store/index.ts";
import { profileChanged } from "../../lib/store/regras.ts";
import { Seg, toast } from "../../lib/ui/index.tsx";

interface ChaveMin { provedor: C.ProvedorIa; ativo: boolean; modelos: { id: string; familia: string }[] }
type Esf = C.Esforco | "";
const ESFORCOS: [Esf, string][] = [["", "Padrão"], ["baixo", "Baixo"], ["medio", "Médio"], ["alto", "Alto"]];
const lerPrefs = () => ((S.profile as { iaPedidos?: Partial<Record<TipoPedidoIa, PrefPedidoIa>> }).iaPedidos ?? {});

export default function Avancado() {
  const [chaves, setChaves] = useState<ChaveMin[] | null>(SERVER ? null : []);
  const [erro, setErro] = useState("");
  const [, redesenhar] = useState(0);
  useEffect(() => {
    if (!SERVER) return;
    api<{ chaves: ChaveMin[] }>("GET", "/api/account/chaves").then((r) => setChaves(r.chaves.filter((k) => k.ativo))).catch(() => { setChaves([]); setErro("Não deu para carregar os modelos das suas chaves."); });
  }, []);

  const lista = chaves ?? [];
  const modelos: ModelosDasChaves = {};
  for (const k of lista) modelos[k.provedor] = [...(modelos[k.provedor] ?? []), ...k.modelos.map((m) => m.id)];
  const prefs = lerPrefs();

  const gravar = (t: TipoPedidoIa, nova: PrefPedidoIa | null) => {
    if (nova) {
      const r = validarPrefPedidoIa(nova, SERVER ? modelos : undefined);
      if (!r.ok) { toast("Essa escolha não vale mais para as suas chaves."); return; }
      nova = r.valor;
    }
    const p = S.profile as { iaPedidos?: Record<string, PrefPedidoIa> };
    const mapa = { ...(p.iaPedidos ?? {}) };
    if (nova) mapa[t] = nova; else delete mapa[t];
    if (Object.keys(mapa).length) p.iaPedidos = mapa; else delete p.iaPedidos;
    profileChanged(); commit(); redesenhar((n) => n + 1);
  };
  const escolherModelo = (t: TipoPedidoIa, v: string) => {
    const atual = prefs[t] ?? {};
    const [prov, ...resto] = v.split("|");
    const modelo = resto.join("|");
    const proximo: PrefPedidoIa = v ? { provedor: prov as C.ProvedorIa, modelo, ...(atual.esforco ? { esforco: atual.esforco } : {}) } : { ...(atual.esforco ? { esforco: atual.esforco } : {}) };
    gravar(t, proximo.modelo || proximo.esforco ? proximo : null);
  };
  const escolherEsforco = (t: TipoPedidoIa, e: Esf) => {
    const atual = prefs[t] ?? {};
    const proximo: PrefPedidoIa = { ...(atual.modelo ? { provedor: atual.provedor, modelo: atual.modelo } : {}), ...(e ? { esforco: e } : {}) };
    gravar(t, proximo.modelo || proximo.esforco ? proximo : null);
  };

  return <div class="sia-av">
    <p class="small sub">Por padrão, cada pedido usa o modelo e o esforço que você definiu na chave. Aqui você troca por tipo de pedido. Só aparecem os modelos que as suas chaves acessam.</p>
    {erro && <p class="note warn small" role="alert">{erro}</p>}
    {chaves && !lista.length && !erro && <p class="small sub">{SERVER ? "Cadastre uma chave de API (acima) para escolher o modelo. O esforço você já pode ajustar." : "Na demonstração não há chaves: o esforço já pode ser ajustado."}</p>}
    {!chaves && <p class="small sub" aria-busy="true">Carregando…</p>}
    {chaves && TIPOS_PEDIDO_IA.map((t) => {
      const pref = prefs[t] ?? {};
      const valor = pref.provedor && pref.modelo ? `${pref.provedor}|${pref.modelo}` : "";
      const naLista = !valor || lista.some((k) => k.provedor === pref.provedor && k.modelos.some((m) => m.id === pref.modelo));
      const selId = `av-m-${t}`;
      return <section class="sia-av-tipo" key={t} aria-labelledby={`av-h-${t}`}>
        <h3 id={`av-h-${t}`}>{ROTULO_PEDIDO_IA[t].nm}</h3>
        <p class="tiny sub">{ROTULO_PEDIDO_IA[t].desc}</p>
        {(lista.length > 0 || valor) && <><label class="f" for={selId}>Modelo</label>
          <select id={selId} class="input" value={valor} onChange={(e) => escolherModelo(t, (e.currentTarget as HTMLSelectElement).value)}>
            <option value="">Padrão da chave</option>
            {!naLista && <option value={valor}>{pref.modelo} (a chave não acessa mais)</option>}
            {C.PROVEDORES_IA.filter((p) => lista.some((k) => k.provedor === p)).map((p) => <optgroup key={p} label={C.NOME_PROVEDOR[p]}>
              {[...new Map(lista.filter((k) => k.provedor === p).flatMap((k) => k.modelos).map((m) => [m.id, m])).values()].map((m) => <option key={m.id} value={`${p}|${m.id}`}>{m.familia} · {m.id}</option>)}
            </optgroup>)}
          </select></>}
        <span class="f">Esforço</span>
        <Seg<Esf> opts={ESFORCOS} value={pref.esforco ?? ""} label={`Esforço de ${ROTULO_PEDIDO_IA[t].nm}`} onPick={(v) => escolherEsforco(t, v)} />
      </section>;
    })}
  </div>;
}
