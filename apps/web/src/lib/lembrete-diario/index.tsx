// Lembrete do Diário (#27): faixa fina no topo, NUNCA modal. Some ao fazer; "mais tarde" adia 1× no dia.
// Regra (o que mostrar) no core: diaryReminder. Ao montar, marca a abertura do app (dias sem abrir → resumo único).
import { useEffect } from "preact/hooks";
import { C, S, today } from "../store/index.ts";
import { D, bootDiario, snooze, yesterday } from "../diario/estado.ts";
import { Icon } from "../ui/index.tsx";
import "./lembrete.css";

let booted = false;

export function LembreteDiario({ hidden = false }: { hidden?: boolean }) {
  useEffect(() => { if (!booted) { booted = true; bootDiario(); } }, []);
  if (hidden || !D.loaded) return null;
  const r = C.diaryReminder({
    today, checkinToday: !!(S.week.checkins[today] ?? D.checkins[today]), checkoutYesterday: !!D.checkouts[yesterday],
    snoozedOn: D.reminder.snoozedOn, absence: D.reminder.absence,
  });
  if (!r || location.hash.split("?")[0] === r.href) return null; // já está na tela que a faixa abriria
  return <div class="lembrete-diario" role="status">
    <Icon id={r.kind === "resumo" ? "cal" : "book"} />
    <a href={r.href} class="ld-link">{r.text}<Icon id="arrow" /></a>
    <button type="button" class="btn sm ghost ld-later" onClick={snooze}>Mais tarde</button>
  </div>;
}
