// #139 "O que você tem sem academia" (perfil.equipamentos): chips de aparelho, nos Primeiros passos (passo Onde) e no
// Perfil de treino (Rotina). Sem academia cadastrada o treino usa o peso corporal e o que estiver marcado aqui (core:
// equipamentoSemAcademia). Nada marcado = só peso corporal. A validação é a do core (IDs do catálogo).
import * as C from "@ciclo/core";
import { EQUIPAMENTOS_CASA } from "@ciclo/core/equipamentos-casa";

export function alternarEquipamento(atual: readonly string[] | undefined, id: string): string[] {
  const a = atual ?? [];
  const novo = a.includes(id) ? a.filter((x) => x !== id) : [...a, id];
  return EQUIPAMENTOS_CASA.filter((x) => novo.includes(x)).concat(novo.filter((x) => !EQUIPAMENTOS_CASA.includes(x)));
}

export function SeletorEquipamentos({ valor, onMudar, temAcademia }: { valor: readonly string[] | undefined; onMudar: (v: string[]) => void; temAcademia: boolean }) {
  const v = valor ?? [];
  return <div class="equip-casa" role="group" aria-labelledby="equip-casa-t">
    <span class="f" id="equip-casa-t">O que você tem sem academia (opcional)</span>
    <p class="small sub">{temAcademia
      ? "Vale quando não houver academia cadastrada. Com academia, o treino usa os aparelhos dela."
      : "Sem academia cadastrada, o treino usa o peso corporal e o que você marcar aqui. Nada marcado = só peso corporal."}</p>
    <div class="chips" style="margin-top:8px">{EQUIPAMENTOS_CASA.map((id) => <button type="button" key={id} class="chip tall" aria-pressed={v.includes(id)}
      onClick={() => onMudar(alternarEquipamento(v, id))}>{C.EQUIPMENT_BY_ID[id]?.nm ?? id}</button>)}</div>
  </div>;
}
