// Lembrete do Diário (#27, #42): faixa fina no topo, NUNCA modal; uma coisa por vez (core: entradaDoDia).
// Ordem: recap do período (fds/semana/mês) > "vai treinar hoje?" (dia sem treino) > check-in / checkout. "Mais tarde" some até amanhã 07:00.
// Nada aqui bloqueia a tela: dá para ir direto registrar comida e o recap volta no próximo acesso até concluir ou pular.
import { useEffect } from "preact/hooks";
import { C, S, today } from "../store/index.ts";
import { D, bootDiario, hojeDiario, recapPendente, respostaTreino, responderTreino, snooze } from "../diario/estado.ts";
import { diaDe, garantirSemana } from "../../screens/semana/estado.ts";
import { go } from "../roteador/index.ts";
import { Icon } from "../ui/index.tsx";
import { hourNow } from "../store/regras.ts";
import "./lembrete.css";

let booted = false;

export function LembreteDiario({ hidden = false }: { hidden?: boolean }) {
  useEffect(() => { if (!booted) { booted = true; bootDiario(); garantirSemana().catch(() => {}); } }, []);
  if (hidden || !D.loaded) return null;
  const hoje = hojeDiario(), dia = diaDe(today);
  const r = C.entradaDoDia({
    hoje, hora: hourNow(), recap: recapPendente(), snoozedOn: D.reminder.snoozedOn,
    diaSemTreino: dia?.status === "livre", respostaTreino: respostaTreino(hoje), treinouHoje: !!(S.session || S.week.attendance[today] === "fui"),
    checkinHoje: !!(S.week.checkins[hoje] ?? D.checkins[hoje]), checkoutOntem: !!D.checkouts[C.lastDays(hoje, 2)[0]], checkoutHoje: !!D.checkouts[hoje],
  });
  if (!r || location.hash.split("?")[0] === r.href) return null; // já está na tela que a faixa abriria
  if (r.kind === "treinar") return <div class="lembrete-diario" role="status">
    <Icon id="dumb" />
    <span class="ld-link">{r.text}</span>
    <button type="button" class="btn sm ld-sim" onClick={() => { responderTreino("sim", hoje); go(r.href); }}>Sim</button>
    <button type="button" class="btn sm ghost ld-later" onClick={() => { responderTreino("nao", hoje); go("#comida"); }}>Não</button>
  </div>;
  return <div class="lembrete-diario" role="status">
    <Icon id={r.kind === "recap" ? "cal" : "book"} />
    <a href={r.href} class="ld-link">{r.text}<Icon id="arrow" /></a>
    <button type="button" class="btn sm ghost ld-later" onClick={snooze}>Mais tarde</button>
  </div>;
}
