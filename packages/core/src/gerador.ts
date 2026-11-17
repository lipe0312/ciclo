// #65 Algoritmo de treino validado. Três peças separadas, todas puras e determinísticas:
//  1. faixasSemana: dias, divisão, alvo e faixa de volume por músculo (a "régua"), só a partir das entradas;
//  2. gerarSemana: monta a semana dentro da régua (nunca devolve semana inválida: teste de propriedade);
//  3. validarSemana: confere qualquer semana (do gerador, da IA ou editada) contra a régua e aponta violações.
// A IA (tier haiku) só revisa: aplicarRevisaoIA passa a resposta pelo validador e, se falhar, fica a determinística.
// Cada constante aponta para a seção de docs/09-base-cientifica.md que a justifica.

import { EXERCISES, EXERCISE_BY_ID, MUSCLES, MUSCLE_IDS } from "./catalog.ts";
import type { Exercise, Group, MuscleId } from "./catalog.ts";
import { candidates, item, painBlocks, weeklyTargets } from "./plan-day.ts";
import type { DayInput, Pain, PlanItem } from "./plan-day.ts";
import { DOWS, trainingDows } from "./semana.ts";
import type { Dow, Split } from "./semana.ts";
import { MAX_PRIORITIES } from "./prioridades.ts";

type Sexo = "m" | "f";
export type AvisoSaude = "gestacao" | "pos_parto" | "red_s";
export interface PerfilGerador {
  sexo: Sexo | string | null;
  nivel: 0 | 1 | 2 | 3;
  prioridades: MuscleId[];
  /** aparelhos marcados; null ou [] = sem academia (só peso corporal + o que foi marcado) */
  equipamentos: string[] | null;
  /** dias habituais (seg..dom) e a meta de dias por semana */
  dias: readonly string[];
  diasMeta?: number;
  minutos: number;
  dores?: Pain[];
  evitar?: string[];
  prefs?: DayInput["prefs"];
  pinned?: DayInput["pinned"];
  familiar?: string[];
  /** sinais de saúde informados pela pessoa: só geram aviso para procurar um profissional (nada de diagnóstico) */
  saude?: AvisoSaude[];
}
export type MotivoFora = "aparelho" | "dor" | "variedade" | "tempo";
export interface DiaGerado { dow: Dow; split: Split; itens: PlanItem[] }
export interface SemanaGerada { dias: DiaGerado[]; fora: { musculo: MuscleId; motivo: MotivoFora }[]; avisos: string[] }
export interface Violacao { codigo: string; msg: string; dia?: string; musculo?: MuscleId; exerciseId?: string }
export interface FaixaMusculo { alvo: number; min: number; max: number; series: number; sessoes: Dow[]; porSessao: Partial<Record<Dow, number>>; fora: MotivoFora | null; prioridade: boolean }
export interface Faixas { dias: { dow: Dow; split: Split; cap: number }[]; minutos: number; musculos: Record<MuscleId, FaixaMusculo> }

// ---------- constantes (docs/09-base-cientifica.md) ----------
/** Teto de séries semanais por músculo: 20 (homem) e 22 (mulher, +10%). docs/09-base-cientifica.md#volume-semanal */
export const VOLUME_TETO: Record<Sexo, number> = { m: 20, f: 22 };
/** Mínimo de sessões por músculo na semana (2×). docs/09-base-cientifica.md#frequência */
export const FREQ_MIN = 2;
/** Mínimo de dias para caber o 2× por músculo; com menos, a semana é montada com 2 e avisa. docs/09-base-cientifica.md#frequência */
export const DIAS_MIN = 2;
/** Teto de séries de um músculo numa mesma sessão (prioridade · demais). docs/09-base-cientifica.md#volume-por-sessão */
export const SESSAO_MAX = { prioridade: 6, outro: 4 } as const;
/** Teto de séries de um mesmo exercício no dia. docs/09-base-cientifica.md#volume-por-sessão */
export const SERIES_ITEM_MAX = 6;
/** Faixa de repetições aceita para hipertrofia, perto da falha. docs/09-base-cientifica.md#repetições */
export const REPS_FAIXA: readonly [number, number] = [5, 30];
/** Exercícios isométricos (contam segundos, não repetições): fora do gerador e da checagem de repetições. docs/09-base-cientifica.md#repetições */
export const ISOMETRICOS: readonly string[] = ["Plank"];
/** Repetições em reserva do treino normal (1–2; o "mais leve hoje" usa 3). docs/09-base-cientifica.md#rir */
export const RIR_PADRAO: readonly [number, number] = [1, 2];
/** Faixa de descanso aceita entre séries (s). docs/09-base-cientifica.md#descanso */
export const DESCANSO_FAIXA: readonly [number, number] = [45, 180];
/** Minutos por série, já com o descanso (o mesmo do planDay). docs/09-base-cientifica.md#tempo-por-série */
export const MIN_POR_SERIE = 3;
/** Menor duração aceita (o perfil aceita 20–180 min). docs/09-base-cientifica.md#tempo-por-série */
export const MINUTOS_MIN = 20;
/** Padrões de movimento multiarticulares: vão antes dos isolados no dia. docs/09-base-cientifica.md#ordem */
export const PADROES_COMPOSTOS: readonly string[] = ["press_h", "press_v", "row", "pull_v", "squat", "hinge"];
/** Multiarticulares sem família no catálogo (peso corporal). docs/09-base-cientifica.md#ordem */
export const COMPOSTOS_EXTRA: readonly string[] = ["Pushups", "Inverted_Row"];
/** Mulher: +15% de volume (dentro dos +10–20% da decisão A). docs/09-base-cientifica.md#diferenças-por-sexo */
export const FATOR_VOLUME_F = 1.15;
/** Mulher: +2 repetições nas duas pontas da faixa. docs/09-base-cientifica.md#diferenças-por-sexo */
export const MAIS_REPS_F = 2;
/** Mulher: descanso de 60–90 s nos isolados. docs/09-base-cientifica.md#diferenças-por-sexo */
export const DESCANSO_ISOLADO_F: readonly [number, number] = [60, 90];
/** Quanto a IA pode tirar do volume de um músculo em relação à determinística (20%). docs/09-base-cientifica.md#ia-revisora */
export const FOLGA_IA = 0.2;
/** Modelo barato que revisa a semana (o Chat conectado escolhe o tier). docs/09-base-cientifica.md#ia-revisora */
export const TIER_REVISAO = "haiku";

const n = (v?: number) => v ?? 0;
/** Só IDs próprios do catálogo ("__proto__", "constructor"… não passam). */
const exDe = (id: unknown): Exercise | undefined => (typeof id === "string" && Object.hasOwn(EXERCISE_BY_ID, id) ? EXERCISE_BY_ID[id] : undefined);
const dowIdx = (d: string) => DOWS.indexOf(d as Dow);
const vizinhos = (a: string, b: string) => Math.abs(dowIdx(a) - dowIdx(b)) === 1;
const sexoDe = (s: PerfilGerador["sexo"]): Sexo => (s === "f" || s === "feminino" ? "f" : "m");

/** Padrão de movimento: a família do catálogo (press_h, row…) ou, sem família, o próprio exercício. */
export function padraoDe(ex: Pick<Exercise, "id" | "fam">): string { return ex.fam ?? ex.id; }
/** Composto (multiarticular) pelo padrão, pela fadiga (≥ 2) ou pela lista de peso corporal. */
export function ehComposto(ex: Exercise | undefined): boolean {
  return !!ex && (PADROES_COMPOSTOS.includes(ex.fam ?? "") || ex.fat >= 2 || COMPOSTOS_EXTRA.includes(ex.id));
}

// Família que pertence a outro músculo (ex.: supino fechado é press_h, do peito): fica fora do gerador para o padrão
// de cada músculo ser só dele e a regra "sem repetir o padrão em dias seguidos" sempre ter saída.
const DONO_FAMILIA: Record<string, MuscleId> = /* @__PURE__ */ (() => {
  const c: Record<string, Partial<Record<MuscleId, number>>> = {};
  for (const e of EXERCISES) if (e.fam) (c[e.fam] ??= {})[e.m] = n(c[e.fam][e.m]) + 1;
  return Object.fromEntries(Object.entries(c).map(([f, ms]) => [f, (Object.entries(ms) as [MuscleId, number][]).sort((a, b) => b[1] - a[1])[0][0]]));
})();

function normalizar(p: PerfilGerador) {
  const avisos: string[] = [];
  const habituais = DOWS.filter((d) => p.dias.includes(d));
  let meta = Math.round(p.diasMeta ?? habituais.length);
  meta = Math.min(7, Math.max(meta, habituais.length));
  if (meta < DIAS_MIN) { avisos.push(`Com ${meta === 1 ? "1 dia" : "nenhum dia"} não dá 2× por músculo: a semana foi montada com ${DIAS_MIN} dias.`); meta = DIAS_MIN; }
  const dias = trainingDows(habituais, meta);
  const minutos = Math.min(180, Math.max(MINUTOS_MIN, Math.round(p.minutos || 0)));
  if (minutos !== p.minutos) avisos.push(`Duração ajustada para ${minutos} min.`);
  const prioridades = [...new Set(p.prioridades.filter((m) => MUSCLE_IDS.includes(m)))].slice(0, MAX_PRIORITIES);
  return { dias, minutos, prioridades, sexo: sexoDe(p.sexo), equip: p.equipamentos ?? [], avisos };
}

/** Divisão por número de dias (a mesma do app: ≤ 2 corpo inteiro; 3 sup/inf/inteiro; 4+ alterna, começando pelo grupo da 1ª prioridade). */
function divisoes(dias: Dow[], prioridades: MuscleId[]): Split[] {
  if (dias.length <= 2) return dias.map(() => "full");
  if (dias.length === 3) return ["sup", "inf", "full"];
  const g0: Group = prioridades[0] ? MUSCLES[prioridades[0]].group : "sup";
  const g1: Group = g0 === "sup" ? "inf" : "sup";
  return dias.map((_, i) => (i % 2 ? g1 : g0));
}

/** Opções do gerador para o músculo, já na ordem de preferência do app (candidates). */
function opcoes(m: MuscleId, p: PerfilGerador, equip: string[], comDor = true) {
  return candidates(m, {
    equipment: equip, pains: comDor ? p.dores ?? [] : [], avoid: p.evitar, prefs: p.prefs, pinned: p.pinned, familiar: p.familiar,
  }).filter((c) => !c.blockedByPain && !ISOMETRICOS.includes(c.ex.id) && !(c.ex.fam && DONO_FAMILIA[c.ex.fam] !== m)).map((c) => c.ex);
}

const alvoDe = (m: MuscleId, nivel: PerfilGerador["nivel"], prioridades: MuscleId[], sexo: Sexo) => {
  const t = weeklyTargets(nivel, prioridades)[m];
  return Math.min(VOLUME_TETO[sexo], sexo === "f" ? Math.round(t * FATOR_VOLUME_F) : t);
};

/** A régua da semana: dias, divisão, alvo, séries por sessão e faixa [min, max] de cada músculo. Só depende das entradas. */
export function faixasSemana(p: PerfilGerador): Faixas {
  const z = normalizar(p);
  const splits = divisoes(z.dias, z.prioridades);
  const cap = Math.floor(z.minutos / MIN_POR_SERIE);
  const dias = z.dias.map((dow, i) => ({ dow, split: splits[i], cap }));
  const resta: Record<string, number> = Object.fromEntries(dias.map((d) => [d.dow, cap]));
  const prio = (m: MuscleId) => z.prioridades.includes(m);
  const ordem = [...z.prioridades, ...MUSCLE_IDS.filter((m) => !prio(m)).sort((a, b) => MUSCLES[b].base - MUSCLES[a].base)];

  const musculos = {} as Record<MuscleId, FaixaMusculo>;
  for (const m of ordem) {
    const alvo = alvoDe(m, p.nivel, z.prioridades, z.sexo);
    const f: FaixaMusculo = { alvo, min: 0, max: alvo, series: 0, sessoes: [], porSessao: {}, fora: null, prioridade: prio(m) };
    musculos[m] = f;
    const ok = opcoes(m, p, z.equip);
    if (!ok.length) { f.fora = opcoes(m, p, z.equip, false).length ? "dor" : "aparelho"; continue; }
    const doGrupo = dias.filter((d) => d.split === "full" || d.split === MUSCLES[m].group).map((d) => d.dow);
    const k = Math.min(doGrupo.length, Math.max(FREQ_MIN, Math.floor(alvo / 3)));
    let sess: Dow[];
    if (new Set(ok.map(padraoDe)).size === 1) {
      // um padrão só: as sessões não podem cair em dias seguidos
      sess = [];
      for (const d of doGrupo) if (sess.length < k && !(sess.length && vizinhos(sess[sess.length - 1], d))) sess.push(d);
      if (sess.length < FREQ_MIN) { f.fora = "variedade"; continue; }
    } else sess = k === doGrupo.length ? doGrupo : Array.from({ length: k }, (_, j) => doGrupo[Math.round((j * (doGrupo.length - 1)) / (k - 1))]);
    sess = sess.filter((d) => resta[d] >= 1);
    if (sess.length < FREQ_MIN) { f.fora = "tempo"; continue; }
    f.sessoes = sess;
    for (const d of sess) { f.porSessao[d] = 1; resta[d]--; }
  }
  const ativos = ordem.filter((m) => !musculos[m].fora);
  // 2ª série em cada sessão (prioridades primeiro)
  for (const m of ativos) for (const d of musculos[m].sessoes) if (resta[d] >= 1 && n(musculos[m].porSessao[d]) < 2) { musculos[m].porSessao[d] = 2; resta[d]--; }
  // completa até o alvo: rodadas só de prioridades, depois as demais; sempre no dia com mais tempo sobrando
  for (const grupo of [ativos.filter(prio), ativos.filter((m) => !prio(m))]) {
    for (let mudou = true; mudou;) {
      mudou = false;
      for (const m of grupo) {
        const f = musculos[m], teto = f.prioridade ? SESSAO_MAX.prioridade : SESSAO_MAX.outro;
        const tot = Object.values(f.porSessao).reduce((a: number, b) => a + n(b), 0);
        if (tot >= f.alvo) continue;
        const d = f.sessoes.filter((x) => resta[x] >= 1 && n(f.porSessao[x]) < teto).sort((a, b) => resta[b] - resta[a] || dowIdx(a) - dowIdx(b))[0];
        if (!d) continue;
        f.porSessao[d] = n(f.porSessao[d]) + 1; resta[d]--; mudou = true;
      }
    }
  }
  for (const m of MUSCLE_IDS) {
    const f = musculos[m];
    f.series = Object.values(f.porSessao).reduce((a: number, b) => a + n(b), 0);
    f.min = f.series ? Math.max(FREQ_MIN, Math.floor(f.series * (1 - FOLGA_IA))) : 0;
  }
  return { dias, minutos: z.minutos, musculos };
}

/** Repetições e descanso pelo sexo (decisão A): mulher faz mais repetições e descansa 60–90 s nos isolados. */
function ajustarSexo(it: PlanItem, sexo: Sexo): PlanItem {
  if (sexo !== "f") return it;
  const ex = EXERCISE_BY_ID[it.exerciseId];
  const reps: [number, number] = ISOMETRICOS.includes(it.exerciseId) ? it.reps : [Math.min(REPS_FAIXA[1], it.reps[0] + MAIS_REPS_F), Math.min(REPS_FAIXA[1], it.reps[1] + MAIS_REPS_F)];
  const rest = ehComposto(ex) ? it.rest : Math.min(DESCANSO_ISOLADO_F[1], Math.max(DESCANSO_ISOLADO_F[0], it.rest));
  return { ...it, reps, rest };
}

const ordemDoDia = (prioridades: MuscleId[]) => (a: PlanItem, b: PlanItem) => {
  const ea = EXERCISE_BY_ID[a.exerciseId], eb = EXERCISE_BY_ID[b.exerciseId];
  const rank = (m: MuscleId) => (prioridades.includes(m) ? prioridades.indexOf(m) : 50 + MUSCLE_IDS.indexOf(m));
  return Number(ehComposto(eb)) - Number(ehComposto(ea)) || rank(a.muscle) - rank(b.muscle) || eb.fat - ea.fat;
};

function avisosDe(p: PerfilGerador, sexo: Sexo, fora: SemanaGerada["fora"]): string[] {
  const out: string[] = [];
  const txt: Record<MotivoFora, string> = {
    aparelho: "sem aparelho para ele nos itens marcados",
    dor: "todas as opções pegam a dor marcada",
    variedade: "só há um exercício possível e os dias são seguidos",
    tempo: "não coube no tempo (as prioridades vêm antes)",
  };
  for (const f of fora) out.push(`${MUSCLES[f.musculo].nm} fora da semana: ${txt[f.motivo]}.`);
  if (sexo === "f") {
    out.push(`Ponto de partida para mulher: ${Math.round((FATOR_VOLUME_F - 1) * 100)}% mais volume, mais repetições e descanso de ${DESCANSO_ISOLADO_F[0]}–${DESCANSO_ISOLADO_F[1]} s nos isolados; os check-ins ajustam.`);
    out.push("Ciclo menstrual: se os sintomas pesarem, use o \"mais leve hoje\"; o treino não muda pela fase.");
  }
  const s = new Set(p.saude ?? []);
  if (s.has("gestacao") || s.has("pos_parto")) out.push("Gestação ou pós-parto: converse com um profissional de saúde antes de seguir este treino (inclui o assoalho pélvico).");
  if (s.has("red_s")) out.push("Cansaço que não passa, menstruação que some ou comer pouco para o treino pedem um profissional de saúde (baixa energia, RED-S).");
  return out;
}

/** Gera a semana dentro da régua. Determinística; o teste de propriedade garante 0 semanas inválidas. */
export function gerarSemana(p: PerfilGerador): SemanaGerada {
  const z = normalizar(p);
  const fx = faixasSemana(p);
  const ok = Object.fromEntries(MUSCLE_IDS.map((m) => [m, opcoes(m, p, z.equip)])) as Record<MuscleId, Exercise[]>;
  const ordem = [...z.prioridades, ...MUSCLE_IDS.filter((m) => !z.prioridades.includes(m))];
  const dias: DiaGerado[] = [];
  for (const d of fx.dias) {
    const ontem = dias.find((x) => vizinhos(x.dow, d.dow) && dowIdx(x.dow) < dowIdx(d.dow));
    const proibidos = new Set((ontem?.itens ?? []).map((i) => padraoDe(EXERCISE_BY_ID[i.exerciseId])));
    const amanha = fx.dias.find((x) => vizinhos(x.dow, d.dow) && dowIdx(x.dow) > dowIdx(d.dow));
    const itens: PlanItem[] = [];
    for (const m of ordem) {
      const f = fx.musculos[m], sets = n(f.porSessao[d.dow]);
      if (!sets) continue;
      const opts = ok[m].filter((e) => !proibidos.has(padraoDe(e)));
      const first = opts[0];
      const alts = (skip: string[]) => opts.filter((e) => !skip.includes(e.id)).slice(0, 3).map((e) => e.id);
      // 2 exercícios só se amanhã o músculo não treina (senão sobraria padrão para amanhã)
      const second = sets >= 5 && !(amanha && n(f.porSessao[amanha.dow])) ? opts.find((e) => padraoDe(e) !== padraoDe(first)) : undefined;
      if (second) {
        const s1 = Math.ceil(sets / 2);
        itens.push(item(first, s1, alts([first.id, second.id])), item(second, sets - s1, alts([first.id, second.id])));
      } else itens.push(item(first, sets, alts([first.id])));
    }
    dias.push({ dow: d.dow, split: d.split, itens: itens.map((i) => ajustarSexo(i, z.sexo)).sort(ordemDoDia(z.prioridades)) });
  }
  const fora = ordem.filter((m) => fx.musculos[m].fora).map((m) => ({ musculo: m, motivo: fx.musculos[m].fora! }));
  const semana: SemanaGerada = { dias, fora, avisos: [...z.avisos, ...avisosDe(p, z.sexo, fora)] };
  const v = validarSemana(semana, p);
  if (v.length) throw new Error(`gerador devolveu semana inválida: ${v.map((x) => x.codigo).join(", ")}`);
  return semana;
}

/** Confere uma semana contra a régua das entradas. Lista vazia = válida. */
export function validarSemana(s: Pick<SemanaGerada, "dias">, p: PerfilGerador): Violacao[] {
  const z = normalizar(p);
  const fx = faixasSemana(p);
  const out: Violacao[] = [];
  const eq = new Set(z.equip);
  const dor = p.dores ?? [];
  const diasOk = new Set(fx.dias.map((d) => d.dow));
  const vol: Partial<Record<MuscleId, number>> = {}, freq: Partial<Record<MuscleId, number>> = {};
  const vistos = new Set<string>();

  for (const d of s.dias) {
    if (!diasOk.has(d.dow) || vistos.has(d.dow)) { out.push({ codigo: "dia", msg: `${d.dow} não é dia de treino da semana`, dia: d.dow }); continue; }
    vistos.add(d.dow);
    let total = 0, isolado = false;
    const noDia = new Set<MuscleId>(), ids = new Set<string>();
    for (const it of d.itens) {
      const ex = exDe(it.exerciseId);
      const v = (codigo: string, msg: string) => out.push({ codigo, msg, dia: d.dow, exerciseId: it.exerciseId, musculo: it.muscle });
      if (!ex || ex.planOff || ex.m !== it.muscle) { v("catalogo", `${it.exerciseId} não é do catálogo para ${it.muscle}`); continue; }
      if (!Number.isInteger(it.sets) || it.sets < 1 || it.sets > SERIES_ITEM_MAX) v("series", `${ex.nm}: ${it.sets} séries`);
      if (!ex.eq.every((q) => eq.has(q))) v("aparelho", `${ex.nm} pede aparelho não marcado`);
      if (painBlocks(ex, dor)) v("dor", `${ex.nm} pega a dor marcada`);
      if (p.evitar?.includes(ex.id)) v("evitar", `${ex.nm} está na lista de evitar`);
      if (ids.has(ex.id)) v("repetido", `${ex.nm} duas vezes no dia`);
      ids.add(ex.id);
      const [r0, r1] = it.reps ?? [0, 0];
      if (!ISOMETRICOS.includes(ex.id) && !(r0 >= REPS_FAIXA[0] && r1 <= REPS_FAIXA[1] && r0 <= r1)) v("reps", `${ex.nm}: ${r0}–${r1} repetições`);
      if (!(it.rest >= DESCANSO_FAIXA[0] && it.rest <= DESCANSO_FAIXA[1])) v("descanso", `${ex.nm}: ${it.rest} s`);
      if (z.sexo === "f" && !ehComposto(ex) && !(it.rest >= DESCANSO_ISOLADO_F[0] && it.rest <= DESCANSO_ISOLADO_F[1])) v("descanso", `${ex.nm}: ${it.rest} s (isolado: ${DESCANSO_ISOLADO_F.join("–")} s)`);
      if (ehComposto(ex) && isolado) v("ordem", `${ex.nm} (composto) depois de um isolado`);
      if (!ehComposto(ex)) isolado = true;
      total += n(it.sets);
      vol[ex.m] = n(vol[ex.m]) + n(it.sets);
      noDia.add(ex.m);
    }
    for (const m of noDia) freq[m] = n(freq[m]) + 1;
    if (total * MIN_POR_SERIE > fx.minutos) out.push({ codigo: "tempo", msg: `${d.dow}: ${total} séries não cabem em ${fx.minutos} min`, dia: d.dow });
  }
  // mesmo padrão em dias seguidos
  for (const a of s.dias) for (const b of s.dias) {
    if (!(vizinhos(a.dow, b.dow) && dowIdx(a.dow) < dowIdx(b.dow))) continue;
    const pa = new Set(a.itens.map((i) => exDe(i.exerciseId)).filter(Boolean).map((e) => padraoDe(e!)));
    for (const i of b.itens) { const e = exDe(i.exerciseId); if (e && pa.has(padraoDe(e))) out.push({ codigo: "padrao", msg: `${e.nm}: mesmo padrão de ${a.dow} em ${b.dow}`, dia: b.dow, exerciseId: e.id }); }
  }
  // volume, 2× e quem ficou fora
  for (const m of MUSCLE_IDS) {
    const f = fx.musculos[m], v = n(vol[m]), nm = MUSCLES[m].nm;
    if (!v) {
      if (f.series > 0) out.push({ codigo: "fora", msg: `${nm} ficou fora sem motivo (falta aparelho, dor ou tempo)`, musculo: m });
      continue;
    }
    if (n(freq[m]) < FREQ_MIN) out.push({ codigo: "frequencia", msg: `${nm} só ${n(freq[m])}× na semana`, musculo: m });
    if (v > f.max) out.push({ codigo: "volume_max", msg: `${nm}: ${v} séries passa de ${f.max}`, musculo: m });
    if (v < Math.max(FREQ_MIN, f.min)) out.push({ codigo: "volume_min", msg: `${nm}: ${v} séries abaixo de ${f.min}`, musculo: m });
  }
  return out;
}

// ---------- IA revisora (opcional, tier haiku) ----------
/** Tamanho máximo aceito da resposta da IA: acima disso fica a determinística. docs/09-base-cientifica.md#ia-revisora */
export const IA_LIMITES = { bytes: 50 * 1024, dias: 7, itensPorDia: 30 } as const;
export interface SemanaCompacta { dias: { dow: string; itens: { id: string; sets: number }[] }[] }
export function compactarSemana(s: Pick<SemanaGerada, "dias">): SemanaCompacta {
  return { dias: s.dias.map((d) => ({ dow: d.dow, itens: d.itens.map((i) => ({ id: i.exerciseId, sets: i.sets })) })) };
}

/** Texto para o modelo barato revisar a semana. A resposta esperada é só o JSON compacto. */
export function pedidoRevisaoIA(s: SemanaGerada, p: PerfilGerador): { tier: typeof TIER_REVISAO; texto: string } {
  const fx = faixasSemana(p);
  const faixas = MUSCLE_IDS.filter((m) => fx.musculos[m].series).map((m) => `${m} ${fx.musculos[m].min}–${fx.musculos[m].max}`).join(", ");
  const texto = [
    "Revise esta semana de treino. Só ajuste se melhorar; senão devolva igual.",
    `Regras: IDs só do catálogo; 2× por músculo; séries por músculo na faixa (${faixas}); até ${fx.minutos} min por dia (${MIN_POR_SERIE} min por série);`,
    "compostos antes dos isolados; sem repetir o mesmo exercício ou padrão em dias seguidos; nada que pegue a dor marcada; só aparelhos marcados.",
    "Responda só com JSON no formato {\"dias\":[{\"dow\":\"seg\",\"itens\":[{\"id\":\"...\",\"sets\":3}]}]}.",
    JSON.stringify(compactarSemana(s)),
  ].join("\n");
  return { tier: TIER_REVISAO, texto };
}

function hidratar(resp: unknown, p: PerfilGerador): { semana: SemanaGerada | null; violacoes: Violacao[] } {
  let r = resp;
  const grande = (msg: string) => ({ semana: null, violacoes: [{ codigo: "tamanho", msg }] });
  if (typeof r === "string" && r.length > IA_LIMITES.bytes) return grande("resposta maior que 50 KB");
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { return { semana: null, violacoes: [{ codigo: "formato", msg: "resposta não é JSON" }] }; } }
  const dias = (r as SemanaCompacta | null)?.dias;
  if (!Array.isArray(dias)) return { semana: null, violacoes: [{ codigo: "formato", msg: "resposta sem lista de dias" }] };
  if (dias.length > IA_LIMITES.dias) return grande(`${dias.length} dias (máximo ${IA_LIMITES.dias})`);
  if (dias.some((d) => Array.isArray(d?.itens) && d.itens.length > IA_LIMITES.itensPorDia)) return grande(`mais de ${IA_LIMITES.itensPorDia} itens num dia`);
  const sexo = sexoDe(p.sexo), fx = faixasSemana(p), z = normalizar(p);
  const out: DiaGerado[] = [], v: Violacao[] = [];
  for (const d of dias) {
    const dow = String(d?.dow ?? "") as Dow;
    const split = fx.dias.find((x) => x.dow === dow)?.split ?? "full";
    const itens: PlanItem[] = [];
    for (const it of Array.isArray(d?.itens) ? d.itens : []) {
      const ex = exDe(it?.id);
      if (!ex) { v.push({ codigo: "catalogo", msg: `${String(it?.id)} não existe no catálogo`, dia: dow }); continue; }
      itens.push(ajustarSexo(item(ex, Number(it?.sets), []), sexo));
    }
    out.push({ dow, split, itens: itens.sort(ordemDoDia(z.prioridades)) });
  }
  return { semana: { dias: out, fora: [], avisos: [] }, violacoes: v };
}

/** Passa a resposta da IA pelo validador. Válida → a semana da IA (com os mesmos avisos); senão → a determinística. Sem IA (null) → a determinística. */
export function aplicarRevisaoIA(det: SemanaGerada, resposta: unknown, p: PerfilGerador): { semana: SemanaGerada; fonte: "ia" | "deterministica"; violacoes: Violacao[] } {
  if (resposta == null) return { semana: det, fonte: "deterministica", violacoes: [] };
  const h = hidratar(resposta, p);
  const violacoes = h.semana ? [...h.violacoes, ...validarSemana(h.semana, p)] : h.violacoes;
  if (!h.semana || violacoes.length) return { semana: det, fonte: "deterministica", violacoes };
  return { semana: { ...h.semana, fora: det.fora, avisos: det.avisos }, fonte: "ia", violacoes: [] };
}
