// Check-in da manhã (veio do Hoje): sono, energia, dor muscular, estresse, comida de ontem e peso opcional. ≤ 10 s.
import { C, S, commit, today } from "../../lib/store/index.ts";
import { Card, Icon, Seg, toast } from "../../lib/ui/index.tsx";
import { longDate } from "../../lib/util.ts";
import { D, checkinOf, saveCheckin } from "../../lib/diario/estado.ts";

export const CK: Record<string, { nm: string; opts: [number, string][] }> = {
  sleepH: { nm: "Sono", opts: [[5, "≤5h"], [6, "6h"], [7, "7h"], [8, "8h"], [9, "9h+"]] },
  energy: { nm: "Energia", opts: [[1, "baixa"], [2, "ok"], [3, "alta"]] },
  soreness: { nm: "Dor muscular", opts: [[0, "zero"], [1, "leve"], [2, "alta"]] },
  stress: { nm: "Estresse", opts: [[1, "baixo"], [2, "médio"], [3, "alto"]] },
  food: { nm: "Comida ontem", opts: [[-1, "menos"], [0, "normal"], [1, "mais"]] },
};
const draftOf = (d: string) => (S.ui.ckDraft?.date === d ? S.ui.ckDraft : { date: d, ...(checkinOf(d) ?? {}) });

export function Checkin() {
  const d = D.sel, saved = checkinOf(d), draft = draftOf(d);
  const r = saved ? C.readiness(saved as Parameters<typeof C.readiness>[0]) : null;
  function save() {
    const w = parseFloat(((document.getElementById("ckWeight") as HTMLInputElement | null)?.value || "").replace(",", "."));
    const v = { ...draft, weightKg: Number.isFinite(w) ? w : draft.weightKg ?? null };
    const miss = Object.keys(CK).filter((k) => v[k] == null);
    if (miss.length) return toast(`Falta: ${miss.map((k) => CK[k].nm.toLowerCase()).join(", ")}`);
    if (v.weightKg != null && (v.weightKg < 30 || v.weightKg > 250)) return toast("Peso entre 30 e 250 kg");
    const { date, ...vals } = v; S.ui.ckDraft = null;
    saveCheckin(date, vals); toast("Check-in salvo");
  }
  return <Card cls={!saved && d === today ? "hl" : ""} id="checkin">
    <div class="row between wrapx"><div><p class="kicker">Check-in da manhã · {d === today ? "hoje" : longDate(d)}</p>
      <h2 style="margin-top:2px">{r ? `Prontidão: ${r.label}` : "Como você está? (10 s)"}</h2></div>
      {saved && <span class="badge ok"><Icon id="check" />feito</span>}</div>
    <p class="small sub" style="margin-top:4px">{r ? r.advice : "É o dado mais importante da revisão de domingo. Toque e pronto."}</p>
    <div style="margin-top:12px">{Object.entries(CK).map(([k, c]) => <div class="ckrow" key={k}><span class="small">{c.nm}</span>
      <Seg opts={c.opts} value={draft[k]} label={c.nm} onPick={(v) => { S.ui.ckDraft = { ...draftOf(d), [k]: v }; commit(); }} /></div>)}
      <div class="ckrow"><label class="small" for="ckWeight">Peso (opcional)</label><input class="input num" id="ckWeight" key={d} inputMode="decimal" placeholder="kg · em jejum" defaultValue={draft.weightKg ?? ""} style="max-width:140px" /></div></div>
    <button type="button" class="btn pri full" style="margin-top:14px" onClick={save}><Icon id="check" />{saved ? "Atualizar check-in" : "Salvar check-in"}</button>
  </Card>;
}
