// #105 A semana do app pelo gerador determinístico (#65). Quando a semana está limpa (nada feito, nada ajustado pelo dono,
// sem treino salvo e sem a divisão da pessoa), os dias de treino saem do gerarSemana e a semana inteira passa no
// validarSemana. Com treino feito ou escolha do dono, quem reorganiza é o planWeek (semana flexível), como antes.
// O resto (folgas, academia do dia, cardio, status) continua do planWeek. TS puro e determinístico.
import { MUSCLES } from "./catalog.ts";
import type { Group } from "./catalog.ts";
import { gerarSemana } from "./gerador.ts";
import type { DiaGerado, PerfilGerador, SemanaGerada } from "./gerador.ts";
import { resumirDia } from "./plan-day.ts";
import type { DayPlan } from "./plan-day.ts";
import { avisosSaude } from "./saude-avisos.ts";
import { divisaoSeguida, isClosed, planWeek } from "./semana.ts";
import type { Split, WeekInput, WeekPlan } from "./semana.ts";
import { rotuloDia } from "./semana-variacao.ts";

/** O que o gerador precisa e a semana não tem: sexo e nível. A saúde fica fora: o aviso sai na leitura (avisosDaSemana). */
export interface BaseGerador { sexo: "m" | "f" | null; nivel: 0 | 1 | 2 | 3 }
export type FonteSemana = "gerador" | "semana";
export type MotivoSemGerador = "divisao" | "ajuste" | "salvo" | "feito" | "dias" | "invalida";

const NOME: Record<Split, string> = { sup: "Superior", inf: "Inferior", full: "Corpo inteiro" };
const ORDEM_GRUPO: Group[] = ["sup", "inf"];

/** Por que a semana não sai do gerador (null = sai): divisão da pessoa, escolha do dono, treino salvo ou dia já fechado. */
export function motivoSemGerador(inp: WeekInput, plan: WeekPlan): MotivoSemGerador | null {
  if (divisaoSeguida(inp)) return "divisao";
  const datas = new Set(plan.days.map((d) => d.date));
  if (Object.keys(inp.overrides ?? {}).some((d) => datas.has(d))) return "ajuste";
  if (Object.keys(inp.fixed ?? {}).some((d) => datas.has(d))) return "salvo";
  for (const d of plan.days) if (d.kind !== "folga" && (d.kind !== "treino" || isClosed(d.date, inp))) return "feito";
  return null;
}

/** Entrada do gerador a partir da semana: os dias de treino do planWeek, os aparelhos que valem em todos eles e os alvos
 *  da semana (já com progressão e deload). */
export function perfilGeradorDaSemana(inp: WeekInput, plan: WeekPlan, base: BaseGerador): PerfilGerador {
  const p = inp.profile;
  const treinos = plan.days.filter((d) => d.kind === "treino");
  const eqDe = (gid: string | null) => p.gyms.find((g) => g.id === gid)?.equipment ?? [];
  const listas = treinos.map((d) => eqDe(d.gymId));
  const equipamentos = listas.length ? listas.reduce((a, b) => a.filter((q) => b.includes(q))) : [];
  return {
    sexo: base.sexo, nivel: base.nivel, prioridades: p.priorities, equipamentos,
    dias: treinos.map((d) => d.dow), diasMeta: treinos.length, minutos: p.minutes,
    dores: p.pains ?? [], evitar: p.avoid, prefs: p.prefs, pinned: p.pinned, familiar: p.familiar,
    alvos: inp.targets,
  };
}

/** DayPlan de um dia do gerador (resumo sempre a partir dos itens; nome pelo conteúdo). */
export function planoDoDiaDaSemana(dia: DiaGerado): DayPlan {
  const groups = ORDEM_GRUPO.filter((g) => dia.itens.some((i) => MUSCLES[i.muscle].group === g));
  const plan = resumirDia({
    name: NOME[dia.split], mode: "normal" as const, groups, items: dia.itens, prehab: [],
    why: ["Montado pelo gerador do app: volume da semana, 2× por músculo, ordem e tempo conferidos pelas mesmas regras."],
    dropped: [], missing: [], cap: 0, setsTotal: 0, estMinutes: 0, weekClosePct: 0, suggestCompensatory: false, perMuscle: {},
  });
  return { ...plan, name: rotuloDia(NOME[dia.split], plan.perMuscle) };
}

/** Os dias de treino de uma semana no formato do validarSemana. */
export function diasDoPlano(plan: Pick<WeekPlan, "days">): DiaGerado[] {
  return plan.days.filter((d) => d.kind !== "folga" && d.plan?.items.length).map((d) => {
    const gs = d.plan!.groups;
    return { dow: d.dow, split: (gs.length === 1 ? gs[0] : "full") as Split, itens: d.plan!.items };
  });
}

/** A semana do app: do gerador quando limpa (e válida); senão, a do planWeek. Nada de saúde aqui: a semana é gravada
 *  (versões e desfazer) e o aviso de saúde tem de sumir quando a pessoa desmarca; ele sai na leitura (avisosDaSemana). */
export function semanaComGerador(inp: WeekInput, base: BaseGerador): { plan: WeekPlan; fonte: FonteSemana; perfil: PerfilGerador | null; motivo: MotivoSemGerador | null } {
  const plan = planWeek(inp);
  const semGerador = (motivo: MotivoSemGerador) => ({ plan, fonte: "semana" as const, perfil: null, motivo });
  const motivo = motivoSemGerador(inp, plan);
  if (motivo) return semGerador(motivo);
  const perfil = perfilGeradorDaSemana(inp, plan, base);
  let g: SemanaGerada;
  try { g = gerarSemana(perfil); } catch { return semGerador("invalida"); }
  const treinos = plan.days.filter((d) => d.kind === "treino");
  // com menos de 2 dias o gerador acrescenta um: a semana do app não tem esse dia, fica o planWeek
  if (g.dias.map((d) => d.dow).join() !== treinos.map((d) => d.dow).join() || g.dias.some((d) => !d.itens.length)) return semGerador("dias");
  const days = plan.days.map((d) => {
    const gd = g.dias.find((x) => x.dow === d.dow);
    if (!gd) return d;
    const { repoe: _repoe, ...resto } = d; // semana limpa: nada a repor
    return { ...resto, plan: planoDoDiaDaSemana(gd), warn: [] };
  });
  return { plan: { ...plan, days, ...(g.avisos.length ? { avisos: g.avisos } : {}) }, fonte: "gerador", perfil, motivo: null };
}

/** Avisos da semana na hora de ler: os do gerador (gravados) + os de saúde do perfil ATUAL (nunca gravados). */
export function avisosDaSemana(plan: Pick<WeekPlan, "avisos">, saude: readonly unknown[] | null | undefined): string[] {
  return [...(plan.avisos ?? []), ...avisosSaude(saude)];
}
