// Perfil de treino: formato, padrões, validação (app e Claude usam a MESMA regra), prioridades por subdivisão,
// "treino desatualizado" e o resumo de contexto entregue ao Claude. TS puro, sem dependências.

import { EXERCISE_BY_ID, MUSCLE_IDS, SUB_MUSCLES, SUB_MUSCLE_IDS } from "./catalog.ts";
import type { MuscleId, SubMuscleId } from "./catalog.ts";
import type { Remembered } from "./loads.ts";
import { MAX_PRIORITIES, MAX_PRIORITY_SUBS, groupsOfSubs, limitSubs, priorityGroups } from "./prioridades.ts";
import type { PriorityGroupId } from "./prioridades.ts";

import { DOWS } from "./semana.ts";
export const GOAL_IDS = ["bracos_ombros", "massa_geral", "definir", "recompor", "forca", "constancia", "shape_v", "perder_barriga", "saude", "retorno"] as const;
export const PLACES = ["academia", "casa"] as const;
export type PlaceChoice = (typeof PLACES)[number];
export const BODY_TYPES = ["muito_magro", "magro", "falso_magro", "normal", "atletico", "forte_gordura", "acima", "bem_acima"] as const;
export const FAT_WHERE = ["barriga", "peito", "costas/flancos", "quadril e coxas", "distribuído", "quase não acumulo"] as const;
export const HOURS = ["manha", "almoco", "tarde", "noite"] as const;
export const DIET_MODES = ["zero", "leve", "detalhado"] as const;
export const TIER_CATS = ["Hoje", "Treino", "Corpo", "Comida", "Plano"] as const;

export const DEFAULT_PROFILE = {
  sex: "m", age: 24, heightCm: 175, weightKg: 72, bodyType: "magro", fatWhere: ["barriga"] as string[], level: 1 as 0 | 1 | 2 | 3,
  goal: { id: "bracos_ombros", statement: "Braços e ombros maiores mantendo a cintura", horizonWeeks: 12, metrics: { bracoCm: 1.5, cinturaCm: 0, pesoKg: 1.5, aderenciaPct: 80 } } as {
    id: string; statement: string; horizonWeeks: number; metrics: { bracoCm: number; cinturaCm: number; pesoKg: number; aderenciaPct: number };
    /** dia em que o objetivo foi escolhido (AAAA-MM-DD); o "voltar a treinar" reduz o volume nas 2 primeiras semanas a partir dele */
    since?: string;
  },
  priorities: ["ombro", "biceps", "triceps"] as MuscleId[], remembered: [] as Remembered[], calibrate: true,
  daysUsual: ["seg", "ter", "qui", "sex"] as string[], daysTarget: 4, minutes: 60, weekStart: "seg", flexWeek: true, hour: "noite",
  prefs: {} as Record<string, any>, pinned: {} as Record<string, string>, avoid: [] as string[], dynamics: "tradicional", crowdedStrategy: "halteres",
  mobility: { squat: true, overhead: true },
  dayGym: { seg: "acad1", ter: "acad1", qua: "acad2", qui: "acad1", sex: "acad2", sab: "casa", dom: "casa" } as Record<string, string>,
  diet: { mode: "leve", typical: "", restrictions: [] as string[], supplements: ["whey"] as string[], kcal: 2650, protein: 139, pace: "moderado" as "lento" | "moderado" | "rapido", waterMl: 2500 },
  autonomy: "carga_sozinho", tone: "direto", reviewTime: "dom20",
  tiers: { Hoje: "haiku", Treino: "sonnet", Corpo: "opus", Comida: "haiku", Plano: "opus" } as Record<string, string>,
  /** prioridades por subdivisão (mapa de músculos), em ordem; `priorities` sai daqui */
  subPriorities: ["ombro_lat", "biceps", "triceps_longa"] as SubMuscleId[],
  /** quem preencheu: o app mostra "preenchido pelo Claude — confira" até o usuário confirmar */
  /** onde treina (multi): só a resposta leve do quiz; os aparelhos ficam em Academias */
  places: ["academia"] as ("academia" | "casa")[],
  /** `assistentes`: telas cujo mini-assistente de 1ª vez já foi visto (ou dispensado com "Fazer manual") */
  meta: { filledBy: "app" as "app" | "claude", confirmed: true } as { filledBy: "app" | "claude"; confirmed: boolean; checkup?: "feito" | "pulado"; assistentes?: Record<string, boolean> },
};
export type ProfileData = typeof DEFAULT_PROFILE;

// ---------- prioridades ----------
export interface Check { ok: boolean; errors: string[] }
/** No máximo 5 grupos de músculos (e 10 subdivisões), todas com ID do catálogo, sem repetir. */
export function validatePriorities(subs: unknown): Check {
  const errors: string[] = [];
  if (!Array.isArray(subs)) return { ok: false, errors: ["subPriorities deve ser uma lista de IDs"] };
  if (subs.length > MAX_PRIORITY_SUBS) errors.push(`subPriorities: até ${MAX_PRIORITY_SUBS} subdivisões (veio ${subs.length})`);
  const seen = new Set<unknown>(), validas: SubMuscleId[] = [];
  for (const s of subs) {
    if (typeof s !== "string" || !SUB_MUSCLE_IDS.includes(s as SubMuscleId)) errors.push(`subPriorities: "${typeof s === "string" ? s.slice(0, 40) : typeof s}" não existe`);
    else if (seen.has(s)) errors.push(`subPriorities: "${s}" repetido`);
    else validas.push(s as SubMuscleId);
    seen.add(s);
  }
  const grupos = groupsOfSubs(validas).length;
  if (grupos > MAX_PRIORITIES) errors.push(`subPriorities: até ${MAX_PRIORITIES} grupos de músculos (veio ${grupos})`);
  return { ok: !errors.length, errors };
}
/** Músculos (para o planejador) na ordem em que as subdivisões foram escolhidas, sem repetir. */
export function prioritiesFromSubs(subs: SubMuscleId[]): MuscleId[] {
  const out: MuscleId[] = [];
  for (const s of subs) { const m = SUB_MUSCLES[s]?.muscle; if (m && !out.includes(m)) out.push(m); }
  return out;
}
const doGrupo = (...g: PriorityGroupId[]): SubMuscleId[] => g.flatMap((x) => priorityGroups[x].subs);
const GOAL_SUBS: Record<string, SubMuscleId[]> = {
  bracos_ombros: ["ombro_lat", "biceps", "triceps_longa"],
  massa_geral: ["dorsal", "peito_medio", "quad"],
  definir: ["dorsal", "ombro_lat", "quad"],
  recompor: ["ombro_lat", "dorsal", "biceps"],
  forca: ["dorsal", "peito_medio", "quad"],
  constancia: [],
  shape_v: doGrupo("ombro", "costas"),                    // ombro largo, costas largas, cintura fina
  perder_barriga: doGrupo("pernas", "costas", "peito"),   // os grandes gastam mais; abdominal não "queima" a barriga
  saude: doGrupo("pernas", "costas"),                      // agachar e puxar: a base
  retorno: [],                                             // corpo todo, sem foco, entrando devagar
};
/** Subdivisões sugeridas ao escolher o objetivo (o usuário ajusta no mapa). */
export const goalPreset = (goalId: string): SubMuscleId[] => [...(GOAL_SUBS[goalId] ?? [])];

// ---------- validação ----------
type Err = (msg: string) => void;
type Rule = (v: unknown, path: string, err: Err) => unknown;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const int = (min: number, max: number): Rule => (v, p, err) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : (err(`${p} deve ser inteiro de ${min} a ${max}`), undefined));
const num = (min: number, max: number): Rule => (v, p, err) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : (err(`${p} deve ser número de ${min} a ${max}`), undefined));
const bool: Rule = (v, p, err) => (typeof v === "boolean" ? v : (err(`${p} deve ser verdadeiro/falso`), undefined));
const oneOf = (opts: readonly (string | number)[]): Rule => (v, p, err) => (opts.includes(v as never) ? v : (err(`${p} deve ser ${opts.join("|")}`), undefined));
const text = (max: number): Rule => (v, p, err) => (typeof v === "string" && v.length <= max ? v : (err(`${p} deve ser texto de até ${max} caracteres`), undefined));
const slug: Rule = (v, p, err) => (typeof v === "string" && /^[a-z0-9_-]{1,40}$/.test(v) ? v : (err(`${p} inválido`), undefined));
const exerciseId: Rule = (v, p, err) => (typeof v === "string" && own(EXERCISE_BY_ID, v) ? v : (err(`${p}: exercício "${typeof v === "string" ? v.slice(0, 60) : typeof v}" não existe no catálogo`), undefined));
const list = (item: Rule, max: number, unique = true): Rule => (v, p, err) => {
  if (!Array.isArray(v)) return err(`${p} deve ser uma lista`), undefined;
  if (v.length > max) return err(`${p}: até ${max} itens`), undefined;
  const out: unknown[] = []; let bad = false;
  v.forEach((x, i) => { const r = item(x, `${p}[${i}]`, (m) => { bad = true; err(m); }); out.push(r); });
  if (unique && !bad && new Set(out).size !== out.length) { err(`${p}: itens repetidos`); return undefined; }
  return bad ? undefined : out;
};
/** Mapa chave→valor; `null` no valor apaga a chave (só no patch). */
const record = (key: Rule, val: Rule, max: number): Rule => (v, p, err) => {
  if (!isObj(v)) return err(`${p} deve ser um objeto`), undefined;
  const ks = Object.keys(v);
  if (ks.length > max) return err(`${p}: até ${max} chaves`), undefined;
  const out: Record<string, unknown> = {};
  for (const k of ks) {
    const kk = k.slice(0, 40);
    if (key(k, `${p}.${kk}`, err) === undefined) continue;
    const r = v[k] === null ? null : val(v[k], `${p}.${kk}`, err);
    if (r !== undefined) out[k] = r;
  }
  return out;
};
const shape = (fields: Record<string, Rule>): Rule => (v, p, err) => {
  if (!isObj(v)) return err(`${p} deve ser um objeto`), undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) {
    if (!own(fields, k)) { err(`${p ? p + "." : ""}${k.slice(0, 40)}: campo desconhecido`); continue; }
    const r = fields[k](v[k], p ? `${p}.${k}` : k, err);
    if (r !== undefined) out[k] = r;
  }
  return out;
};

const musclesOnly: Rule = (v, p, err) => (typeof v === "string" && MUSCLE_IDS.includes(v as MuscleId) ? v : (err(`${p}: músculo inválido`), undefined));
const MUSCLE_GROUP: Record<MuscleId, PriorityGroupId> = { peito: "peito", costas: "costas", ombro: "ombro", post: "ombro", biceps: "biceps", triceps: "triceps", quad: "pernas", isquio: "pernas", gluteo: "gluteo", pant: "pernas", core: "abdomen" };
/** Músculos prioritários: sem repetir e de no máximo 5 grupos (ombro e ombro post. contam como um). */
const musclePriorities: Rule = (v, p, err) => {
  const r = list(musclesOnly, MAX_PRIORITY_SUBS)(v, p, err) as MuscleId[] | undefined;
  if (r && new Set(r.map((m) => MUSCLE_GROUP[m])).size > MAX_PRIORITIES) return err(`${p}: até ${MAX_PRIORITIES} grupos de músculos`), undefined;
  return r;
};
const yes: Rule = (v, p, err) => (v === true ? v : (err(`${p} deve ser verdadeiro`), undefined));
const isoDay: Rule = (v, p, err) => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) ? v : (err(`${p} deve ser uma data AAAA-MM-DD`), undefined));
const dowKey: Rule = (v, p, err) => (typeof v === "string" && (DOWS as readonly string[]).includes(v) ? v : (err(`${p}: dia inválido`), undefined));
const objectKeys = shape;

const SCHEMA: Record<string, Rule> = {
  sex: oneOf(["m", "f"]), age: int(12, 90), heightCm: int(120, 230), weightKg: num(30, 250),
  bodyType: oneOf(BODY_TYPES), fatWhere: list(oneOf(FAT_WHERE), 6), level: int(0, 3),
  goal: objectKeys({
    id: oneOf(GOAL_IDS), statement: text(140), horizonWeeks: oneOf([8, 12, 16]), since: isoDay,
    metrics: objectKeys({ bracoCm: num(-5, 10), cinturaCm: num(-20, 20), pesoKg: num(-30, 30), aderenciaPct: int(0, 100) }),
  }),
  priorities: musclePriorities,
  subPriorities: (v, p, err) => { const c = validatePriorities(v); c.errors.forEach(err); return c.ok ? v : undefined; },
  remembered: list(objectKeys({ exerciseId, kg: num(0, 600), reps: int(1, 30), confidence: oneOf(["certeza", "aproximado"]) }), 4, false),
  calibrate: bool,
  daysUsual: list(dowKey, 7), daysTarget: int(1, 7), minutes: int(20, 180), weekStart: oneOf(DOWS), flexWeek: bool, hour: oneOf(HOURS),
  prefs: record(musclesOnly, oneOf(["livre", "maquina", "cabo", "tanto_faz"]), 11),
  pinned: record(musclesOnly, exerciseId, 11), avoid: list(exerciseId, 30),
  dynamics: oneOf(["tradicional", "superserie", "circuito"]), crowdedStrategy: oneOf(["halteres", "reordenar", "esperar"]),
  mobility: objectKeys({ squat: bool, overhead: bool }),
  dayGym: record(dowKey, slug, 7),
  diet: objectKeys({ mode: oneOf(DIET_MODES), typical: text(1000), restrictions: list(text(40), 10), supplements: list(text(40), 10), kcal: int(800, 8000), protein: int(20, 500), pace: oneOf(["lento", "moderado", "rapido"]), waterMl: int(500, 8000) }),
  autonomy: oneOf(["so_sugere", "carga_sozinho", "tudo"]), tone: oneOf(["direto", "motivador", "tecnico"]), reviewTime: oneOf(["dom20", "seg7"]),
  tiers: record((v, p, err) => ((TIER_CATS as readonly string[]).includes(v as string) ? v : (err(`${p}: tipo de pedido inválido`), undefined)), oneOf(["haiku", "sonnet", "opus"]), 5),
  places: (v, p, err) => { const r = list(oneOf(PLACES), 2)(v, p, err); return Array.isArray(r) && !r.length ? (err(`${p}: escolha academia, casa ou os dois`), undefined) : r; },
  meta: objectKeys({ filledBy: oneOf(["app", "claude"]), confirmed: bool, checkup: oneOf(["feito", "pulado"]), assistentes: record(slug, yes, 12) }),
};
const PATCH_SHAPE = shape(SCHEMA);

export type Validation<T> = { ok: true; value: T; errors: [] } | { ok: false; errors: string[] };
/** Confere (campo a campo) um perfil inteiro OU parcial. Devolve só o que veio, limpo; qualquer erro recusa tudo. */
export function validateProfilePatch(patch: unknown): Validation<Record<string, any>> {
  if (!isObj(patch)) return { ok: false, errors: ["perfil deve ser um objeto"] };
  const errors: string[] = [];
  const value = PATCH_SHAPE(patch, "", (m) => { if (errors.length < 12) errors.push(m); }) as Record<string, any>;
  return errors.length ? { ok: false, errors } : { ok: true, value, errors: [] };
}

const MAPS = ["prefs", "pinned", "dayGym", "tiers"] as const;
const NESTED = ["goal", "mobility", "diet", "meta"] as const;
/** Aplica um patch já validado sobre a base (objetos mesclam, mapas mesclam e `null` apaga, listas substituem). */
function merge(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = structuredClone(base);
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if ((MAPS as readonly string[]).includes(k)) {
      const m: Record<string, unknown> = { ...(out[k] ?? {}) };
      for (const [mk, mv] of Object.entries(v)) { if (mv === null) delete m[mk]; else m[mk] = mv; }
      out[k] = m;
    } else if ((NESTED as readonly string[]).includes(k)) {
      const cur = { ...(out[k] ?? {}) };
      for (const [nk, nv] of Object.entries(v)) cur[nk] = nk === "metrics" ? { ...(cur.metrics ?? {}), ...(nv as object) } : nv;
      out[k] = cur;
    } else out[k] = structuredClone(v);
  }
  return out;
}

/** Valida o patch, mescla na base e deixa prioridades × subdivisões coerentes. */
export type Applied = { ok: true; profile: ProfileData; errors: [] } | { ok: false; errors: string[] };
export function applyProfilePatch(base: Partial<ProfileData> | Record<string, any>, patch: unknown): Applied {
  const v = validateProfilePatch(patch);
  if (!v.ok) return { ok: false, errors: v.errors };
  const p = merge(base as Record<string, any>, v.value);
  const hasSubs = own(v.value, "subPriorities"), hasPri = own(v.value, "priorities");
  if (hasSubs && !hasPri) p.priorities = prioritiesFromSubs(p.subPriorities);
  else if (hasPri && !hasSubs) p.subPriorities = (p.subPriorities ?? []).filter((s: SubMuscleId) => p.priorities.includes(SUB_MUSCLES[s]?.muscle));
  const bad = (p.subPriorities ?? []).filter((s: SubMuscleId) => !p.priorities.includes(SUB_MUSCLES[s]?.muscle));
  if (bad.length) return { ok: false, errors: [`subPriorities: ${bad.join(", ")} não pertence(m) aos músculos prioritários`] };
  return { ok: true, profile: p as ProfileData, errors: [] };
}

// ---------- treino desatualizado ----------
/** O que, no perfil, muda o treino gerado. Tom do Claude, comida, corpo e metas não entram. */
const PLAN_FIELDS = ["level", "priorities", "subPriorities", "minutes", "daysTarget", "daysUsual", "flexWeek", "weekStart", "prefs", "pinned", "avoid", "dynamics", "crowdedStrategy", "mobility", "dayGym", "remembered"] as const;
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]`
  : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v) ?? "null";
export function planFingerprint(p: Partial<ProfileData> | Record<string, any>): string {
  const full: Record<string, any> = { ...DEFAULT_PROFILE, ...(p as object) };
  return stable(Object.fromEntries(PLAN_FIELDS.map((k) => [k, full[k]])));
}
/** O treino foi feito com o perfil `then`; hoje o perfil é `now`. Sem base de comparação, não alarma. */
export function isPlanStale(then: Partial<ProfileData> | Record<string, any> | null | undefined, now: Partial<ProfileData> | Record<string, any>): boolean {
  return !!then && planFingerprint(then) !== planFingerprint(now);
}

// ---------- resumo de contexto (vai ao Claude) ----------
const LEVELS = ["nunca treinou", "menos de 1 ano", "1–3 anos", "3+ anos"];
const BODIES: Record<string, string> = { muito_magro: "muito magro", magro: "magro", falso_magro: "magro com barriga", normal: "normal", atletico: "atlético", forte_gordura: "forte com gordura", acima: "acima do peso", bem_acima: "bem acima do peso" };
/** Um formato só: o texto compacto que o Claude lê (sem repetir os mesmos dados em campos). */
export interface ContextSummary { versao: number; preenchidoPor: "app" | "claude"; confirmado: boolean; texto: string }
export function contextSummary(profile: Partial<ProfileData> | Record<string, any>, versao: number): ContextSummary {
  const p = { ...DEFAULT_PROFILE, ...(profile as object) } as ProfileData;
  const subs = (p.subPriorities ?? []).filter((s) => SUB_MUSCLES[s]);
  const prioridades = subs.length ? subs.map((s) => SUB_MUSCLES[s].nm) : (p.priorities ?? []).map((m) => String(m));
  const rotina = `${p.daysTarget} dias/semana (${(p.daysUsual ?? []).join(", ")}), ${p.minutes} min, semana começa na ${p.weekStart}, ${p.flexWeek ? "semana flexível" : "dias fixos"}`;
  const corpo = `${p.sex === "f" ? "mulher" : "homem"}, ${p.age} anos, ${p.heightCm} cm, ${p.weightKg} kg, ${BODIES[p.bodyType] ?? p.bodyType}`;
  const texto = `Objetivo: ${p.goal?.statement ?? ""}. Prioridades (em ordem): ${prioridades.join(" › ") || "nenhuma"}. Nível: ${LEVELS[p.level] ?? ""}. Rotina: ${rotina}. Corpo: ${corpo}. Comida: registro ${p.diet?.mode ?? "leve"}. Claude: autonomia ${p.autonomy}, tom ${p.tone}.`;
  return { versao, preenchidoPor: p.meta?.filledBy ?? "app", confirmado: p.meta?.confirmed ?? true, texto };
}

/** O treino foi gerado quando o perfil tinha a impressão `fp` (ver planFingerprint); `now` é o perfil de hoje. */
export const isFingerprintStale = (fp: string | null | undefined, now: Partial<ProfileData> | Record<string, any>): boolean => !!fp && fp !== planFingerprint(now);

/**
 * O que fazer com o treino do dia quando o perfil muda: congelar (ficou diferente da base, vira "desatualizado"),
 * descongelar (o usuário voltou ao perfil de antes e o congelamento foi só por causa do perfil) ou nada.
 */
export function planFreezeAction(fp: string | null | undefined, now: Partial<ProfileData> | Record<string, any>, st: { frozen: boolean; frozenByProfile: boolean }): "freeze" | "unfreeze" | "none" {
  if (!fp) return "none";
  const differs = fp !== planFingerprint(now);
  if (differs && !st.frozen) return "freeze";
  if (!differs && st.frozen && st.frozenByProfile) return "unfreeze";
  return "none";
}

// ---------- "seu plano em uma frase" ----------
const DOW_FULL: Record<string, string> = { seg: "segunda", ter: "terça", qua: "quarta", qui: "quinta", sex: "sexta", sab: "sábado", dom: "domingo" };
export const dowName = (d: string) => DOW_FULL[d] ?? d;
export function planSentence(profile: Partial<ProfileData> | Record<string, any>): string {
  const p = { ...DEFAULT_PROFILE, ...(profile as object) } as ProfileData;
  const subs = (p.subPriorities ?? []).filter((s) => SUB_MUSCLES[s]).map((s) => SUB_MUSCLES[s].nm.toLowerCase());
  const foco = subs.length ? `foco em ${subs.join(", ").replace(/, ([^,]*)$/, " e $1")}` : "o corpo todo, sem foco";
  return `${p.daysTarget} dias por semana, cerca de ${p.minutes} min por treino, ${foco}. Meta: ${String(p.goal?.statement ?? "").toLowerCase()}.`;
}

// ---------- completo / dá para melhorar + próximo passo recomendado ----------
export const PROFILE_BLOCKS = ["objetivo", "prioridades", "voce", "experiencia", "rotina", "preferencias", "mobilidade", "claude"] as const;
export type ProfileBlock = (typeof PROFILE_BLOCKS)[number];
export interface NextStep { block: ProfileBlock; cta: string; why: string }
export interface Completeness { total: number; done: number; badge: "completo" | "dá para melhorar"; blocks: Record<ProfileBlock, boolean>; next: NextStep | null }
/** Um bloco está "completo" quando o que ele pede para o treino ficar preciso foi respondido (padrões não contam). */
export function profileCompleteness(profile: Partial<ProfileData> | Record<string, any>): Completeness {
  const p = { ...DEFAULT_PROFILE, ...(profile as object) } as ProfileData;
  const blocks: Record<ProfileBlock, boolean> = {
    objetivo: !!p.goal?.id && !!p.goal?.statement,
    prioridades: (p.subPriorities ?? []).length > 0 || (p.priorities ?? []).length > 0,
    voce: !!p.age && !!p.heightCm && !!p.weightKg,
    experiencia: (p.remembered ?? []).length > 0,
    rotina: (p.daysUsual ?? []).length >= 1 && (p.daysUsual ?? []).length >= p.daysTarget,
    preferencias: Object.values(p.prefs ?? {}).some((v) => v && v !== "tanto_faz") || Object.keys(p.pinned ?? {}).length > 0 || (p.avoid ?? []).length > 0,
    mobilidade: p.mobility?.squat === true && p.mobility?.overhead === true ? true : typeof p.mobility?.squat === "boolean" && typeof p.mobility?.overhead === "boolean",
    claude: !!p.autonomy && !!p.tone,
  };
  const STEPS: Record<ProfileBlock, [string, string]> = {
    prioridades: ["Escolha os músculos que mais importam no mapa", "o treino protege esses músculos primeiro"],
    experiencia: ["Conte as cargas que você lembra", "cargas iniciais mais certeiras já no 1º treino"],
    rotina: ["Marque dias suficientes para a sua meta", "a semana distribui as séries nos dias que você realmente vai"],
    preferencias: ["Diga o que você prefere por músculo", "exercícios mais a sua cara e menos trocas"],
    objetivo: ["Escolha o objetivo principal", "tudo no app serve a ele"], voce: ["Complete seus dados básicos", "calibra o ritmo de ganho"],
    mobilidade: ["Responda a mobilidade", "evita exercícios que doem"], claude: ["Ajuste como o Chat trabalha com você", "define o que ele muda sozinho"],
  };
  const order: ProfileBlock[] = ["objetivo", "prioridades", "rotina", "experiencia", "preferencias", "voce", "mobilidade", "claude"];
  const pending = order.find((b) => !blocks[b]);
  const done = PROFILE_BLOCKS.filter((b) => blocks[b]).length;
  return { total: PROFILE_BLOCKS.length, done, badge: done === PROFILE_BLOCKS.length ? "completo" : "dá para melhorar", blocks, next: pending ? { block: pending, cta: STEPS[pending][0], why: STEPS[pending][1] } : null };
}

// ---------- perfis antigos ----------
const DEFAULT_SUB: Record<MuscleId, SubMuscleId> = { peito: "peito_medio", costas: "dorsal", ombro: "ombro_lat", post: "ombro_post", biceps: "biceps", triceps: "triceps_longa", quad: "quad", isquio: "isquio", gluteo: "gluteo", pant: "pant", core: "abdomen" };
/**
 * Perfil guardado numa versão anterior → perfil que passa na validação: descarta chaves e valores fora do schema
 * (o padrão preenche depois) e deixa prioridades × subdivisões coerentes (as prioridades antigas mandam; sem subdivisão, usa a padrão do músculo).
 */
export function normalizeProfile(raw: unknown): Record<string, any> {
  if (!isObj(raw)) return {};
  const out: Record<string, any> = {};
  for (const k of Object.keys(raw)) {
    if (!own(SCHEMA, k) || k === "priorities" || k === "subPriorities" || raw[k] === null) continue;
    const v = SCHEMA[k](raw[k], k, () => {}) as any;
    if (v === undefined) continue;
    if ((MAPS as readonly string[]).includes(k)) for (const mk of Object.keys(v)) if (v[mk] === null) delete v[mk];
    out[k] = v;
  }
  const uniq = <T,>(a: T[]) => [...new Set(a)];
  const pri = Array.isArray(raw.priorities) ? uniq(raw.priorities.filter((m): m is MuscleId => MUSCLE_IDS.includes(m as MuscleId))) : null;
  const subs = Array.isArray(raw.subPriorities) ? uniq(raw.subPriorities.filter((s): s is SubMuscleId => SUB_MUSCLE_IDS.includes(s as SubMuscleId))) : null;
  if (pri === null && subs === null) return out;
  let final: SubMuscleId[];
  if (pri && (pri.length || !subs?.length)) final = pri.flatMap((m) => { const own1 = (subs ?? []).filter((s) => SUB_MUSCLES[s].muscle === m); return own1.length ? own1 : [DEFAULT_SUB[m]]; });
  else final = subs ?? [];
  final = limitSubs(uniq(final));
  out.subPriorities = final; out.priorities = prioritiesFromSubs(final);
  return out;
}
