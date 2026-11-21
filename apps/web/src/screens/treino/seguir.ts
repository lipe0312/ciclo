// #122 O treino do dia mudou no meio do treino (IA, regerar, outro aparelho): aplica na MESMA sessão pela regra do core,
// deixa o aviso na sessão e guarda o plano dela no servidor (outro aparelho retoma igual). Baixa só com sessão aberta.
// Nada novo na fonte (o treino de onde a sessão veio ou o último que o aparelho adotou) = nada muda.
import { seguirTreinoDoDia } from "@ciclo/core/sessao-dia";
import { C, S } from "../../lib/store/index.ts";
import { send } from "../../lib/api/index.ts";
import { toast } from "../../lib/ui/index.tsx";

export function seguir(plan: C.DayPlan): boolean {
  const s = S.session; if (!s || s.finishedAt) return false;
  s.plan.doDia ??= S.ui.treinoVisto ?? C.assinaturaTreino(s.plan); // sessão começada antes da #122: veio do último treino adotado
  const nome = (id: string) => C.EXERCISE_BY_ID[id]?.nm ?? S.personalizados[id]?.nome ?? "exercício";
  const r = seguirTreinoDoDia(s, plan, { nome, visto: S.ui.treinoVisto });
  if (!r) return false;
  S.session = r.sessao; S.ui.treinoVisto = r.sessao.plan.doDia ?? null; S.ui.avisoSessao = r.aviso;
  // sem rede o `send` põe na fila e reenvia; recusado pelo servidor: avisa (a mudança vale neste aparelho)
  void send("PUT", `/api/sessions/${encodeURIComponent(s.id)}/plan`, { plan: r.sessao.plan })
    .catch(() => toast("A mudança do treino não foi salva no servidor: vale só neste aparelho"));
  return true;
}
