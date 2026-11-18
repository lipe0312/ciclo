// #87 Comida em dias anteriores: seta e calendário escolhem o dia (até 30 dias atrás, o mesmo limite do Chat). Registrar,
// editar e apagar valem para o dia escolhido; os totais do dia e o painel da semana se recalculam. Dia fora da janela que
// o app já carregou (14 dias) é buscado do servidor só quando escolhido.
import { useEffect } from "preact/hooks";
import { DIAS_PARA_TRAS } from "@ciclo/core";
import { S, commit, today } from "../../lib/store/index.ts";
import type { FoodRow } from "../../lib/store/regras.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { addDays } from "../../lib/util.ts";

export const DIA_MIN = addDays(today, -DIAS_PARA_TRAS);
const JANELA = addDays(today, -13); // o que loadFood já traz
const buscados = new Set<string>();

/** Traz do servidor os registros de um dia antigo e junta aos que o app tem (sem duplicar). */
async function carregarDia(d: string) {
  if (!SERVER || d >= JANELA || buscados.has(d)) return;
  buscados.add(d);
  try {
    const r = await api<{ entries: any[] }>("GET", `/api/food?from=${d}&to=${d}`);
    const tem = new Set(S.food.map((f) => f.id));
    const novos: FoodRow[] = r.entries.filter((e) => !tem.has(e.id)).map((e) => ({
      id: e.id, date: e.date, text: e.text, kcal: e.kcal, prot: e.prot, meal: e.meal, source: e.source, confidence: e.confidence, via: e.via ?? null, createdAt: e.createdAt,
    }));
    if (novos.length) { S.food = S.food.concat(novos); commit(); }
  } catch { buscados.delete(d); /* offline: fica o que há */ }
}

/** #114 Atualização sozinha: loadFood volta só a janela de 14 dias. Os dias antigos que a pessoa já abriu são buscados de novo e SUBSTITUEM
 *  os registros do dia (nunca somam: o que foi apagado ou corrigido no servidor não volta). */
export async function recarregarDiasBuscados() {
  if (!SERVER) return;
  for (const d of [...buscados]) {
    try {
      const r = await api<{ entries: any[] }>("GET", `/api/food?from=${d}&to=${d}`);
      const dia: FoodRow[] = r.entries.map((e) => ({ id: e.id, date: e.date, text: e.text, kcal: e.kcal, prot: e.prot, meal: e.meal, source: e.source, confidence: e.confidence, via: e.via ?? null, createdAt: e.createdAt }));
      S.food = S.food.filter((f) => f.date !== d).concat(dia);
    } catch { /* offline: fica sem esse dia até abri-lo de novo */ }
  }
  commit();
}

const valido = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= DIA_MIN && d <= today;

/** Seta para o dia anterior/próximo, calendário nativo e "Hoje". Toques de 44 px; a data escolhida vem escrita. */
export function SeletorDia({ dia, setDia }: { dia: string; setDia: (d: string) => void }) {
  useEffect(() => { carregarDia(dia); }, [dia]);
  return <div class="row" role="group" aria-label="Dia dos registros" style="gap:var(--sp-2);flex-wrap:nowrap">
    <button type="button" class="iconbtn" aria-label="Dia anterior" disabled={dia <= DIA_MIN} onClick={() => setDia(addDays(dia, -1))}><Icon id="back" /></button>
    <label class="row" style="flex:1;min-width:0">
      <input class="input num" type="date" aria-label="Escolher o dia" style="min-width:0" min={DIA_MIN} max={today} value={dia}
        onChange={(e) => { const v = e.currentTarget.value; if (valido(v)) setDia(v); else e.currentTarget.value = dia; }} />
    </label>
    <button type="button" class="iconbtn" aria-label="Próximo dia" disabled={dia >= today} onClick={() => setDia(addDays(dia, 1))}><Icon id="arrow" /></button>
    {dia !== today && <button type="button" class="btn" style="flex:none" onClick={() => setDia(today)}>Hoje</button>}
  </div>;
}
