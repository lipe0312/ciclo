// Comida 2.0 (#28): estimativa local, médias de 7 dias, aderência à proteína, tendência do peso (EMA) e calorias adaptativas.
// Funções puras e sem dependências. Só a proteína é meta rígida; as calorias se ajustam pela tendência do peso (até ±150 kcal/semana).

// ---------- refeições ----------
export const MEALS = ["cafe", "almoco", "lanche", "jantar", "ceia"] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_NM: Record<Meal | "sem", string> = { cafe: "Café", almoco: "Almoço", lanche: "Lanche", jantar: "Jantar", ceia: "Ceia", sem: "Sem refeição" };

/** Refeição pelo texto ("café: 2 ovos") ou, sem palavra-chave, pela hora do dia (0-23). */
export function guessMeal(text: string, hour: number): Meal {
  const t = norm(text);
  if (/\b(cafe|desjejum)\b/.test(t)) return "cafe";
  if (/\balmoco\b/.test(t)) return "almoco";
  if (/\blanche\b/.test(t)) return "lanche";
  if (/\b(jantar|janta)\b/.test(t)) return "jantar";
  if (/\bceia\b/.test(t)) return "ceia";
  if (hour < 5) return "ceia";
  if (hour < 10) return "cafe";
  if (hour < 14) return "almoco";
  if (hour < 18) return "lanche";
  if (hour < 22) return "jantar";
  return "ceia";
}

// ---------- estimativa local (porções caseiras, ~TACO) ----------
const norm = (s: string) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** [padrão (texto sem acento), rótulo, kcal e proteína por unidade, gramas (ou ml) de uma unidade] */
const FOOD_TABLE: [RegExp, string, number, number, number][] = [
  [/\bovos?\b/, "Ovo", 70, 6, 50], [/\bpa(o|es)\b/, "Pão", 140, 4.5, 50], [/\barroz\b/, "Arroz", 200, 4, 150], [/\bfeij/, "Feijão", 140, 9, 100],
  [/\bfrango\b/, "Frango", 250, 45, 150], [/\b(carne|bife|patinho)\b/, "Carne", 300, 40, 150], [/\bwhey\b/, "Whey", 120, 24, 30],
  [/\bbananas?\b/, "Banana", 90, 1, 100], [/\bleite\b/, "Leite", 120, 6, 200], [/\biogurte\b/, "Iogurte", 100, 8, 170], [/\bqueijo\b/, "Queijo", 100, 7, 30],
  [/\bmacarr/, "Macarrão", 300, 10, 200], [/\bbatata\b/, "Batata", 150, 3, 150], [/\baveia\b/, "Aveia", 110, 4, 30],
  [/\b(peixe|tilapia|atum)\b/, "Peixe", 180, 30, 150], [/\b(salada|alface|tomate)\b/, "Salada", 25, 1, 80],
];
const NUMBER_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, meio: 0.5, meia: 0.5 };
const MAX_UNITS = 12;

export interface FoodPart { label: string; kcal: number; prot: number }
const num = (s: string) => Number(s.replace(",", "."));

/** O que a estimativa local reconheceu no texto, alimento por alimento (o resto é ignorado: o Claude confere depois). */
export function foodParts(text: string): FoodPart[] {
  const out: FoodPart[] = [];
  for (const part of norm(text).split(/[,;\n+·]|\be\b|\bcom\b/)) {
    const row = FOOD_TABLE.find(([re]) => re.test(part));
    if (!row) continue;
    const [, label, kcal, prot, unitG] = row;
    let units = 1;
    const g = part.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramas?|ml)\b/);
    const d = part.match(/(\d+(?:[.,]\d+)?)/);
    const w = part.match(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|meio|meia)\b/);
    if (g) units = num(g[1]) / unitG;
    else if (d) units = num(d[1]);
    else if (w) units = NUMBER_WORDS[w[1]];
    units = Math.max(0, Math.min(units, MAX_UNITS));
    out.push({ label, kcal: kcal * units, prot: prot * units });
  }
  return out;
}
export function estimateFood(text: string): { kcal: number; prot: number } {
  const p = foodParts(text);
  return { kcal: Math.round(p.reduce((s, x) => s + x.kcal, 0)), prot: Math.round(p.reduce((s, x) => s + x.prot, 0) * 10) / 10 };
}

// ---------- datas ----------
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

// ---------- médias, aderência e distribuição ----------
export interface FoodEntry { date: string; meal?: Meal | null; kcal: number | null; prot: number | null; text?: string }
export interface DayTotals { date: string; kcal: number; prot: number; logged: boolean }

export function dayTotals(entries: readonly FoodEntry[], date: string): DayTotals {
  let kcal = 0, prot = 0, logged = false;
  for (const e of entries) if (e.date === date) { logged = true; kcal += e.kcal ?? 0; prot += e.prot ?? 0; }
  return { date, kcal: Math.round(kcal), prot: Math.round(prot), logged };
}

/** Dias em que a proteína bateu a meta (≥ 95%: a estimativa é aproximada). Só entram dias registrados. */
export function proteinAdherence(protByDay: readonly number[], target: number, tolerance = 0.95): { hit: number; of: number; rate: number } {
  const hit = protByDay.filter((p) => p >= target * tolerance).length;
  return { hit, of: protByDay.length, rate: protByDay.length ? Math.round((hit / protByDay.length) * 100) : 0 };
}

export interface FoodAverages {
  from: string; to: string; days: DayTotals[]; daysLogged: number;
  avgKcal: number | null; avgProt: number | null; kcalPct: number | null; protPct: number | null;
  adherence: { hit: number; of: number; rate: number };
  byMeal: { meal: Meal | "sem"; kcal: number; share: number }[];
}

/** Média dos últimos `days` dias até `end` (inclusive). Só dias com registro entram na média: faltar um dia não derruba a conta. */
export function foodAverages(entries: readonly FoodEntry[], end: string, targets: { kcal: number; protein: number }, days = 7): FoodAverages {
  const dates = Array.from({ length: days }, (_, i) => addDays(end, i - (days - 1)));
  const list = dates.map((d) => dayTotals(entries, d));
  const logged = list.filter((d) => d.logged);
  const avg = (f: (d: DayTotals) => number) => (logged.length ? Math.round(logged.reduce((s, d) => s + f(d), 0) / logged.length) : null);
  const avgKcal = avg((d) => d.kcal), avgProt = avg((d) => d.prot);
  const inWin = new Set(dates);
  const kcalBy = new Map<Meal | "sem", number>();
  for (const e of entries) if (inWin.has(e.date)) kcalBy.set(e.meal ?? "sem", (kcalBy.get(e.meal ?? "sem") ?? 0) + (e.kcal ?? 0));
  const total = [...kcalBy.values()].reduce((s, v) => s + v, 0);
  const byMeal = ([...MEALS, "sem"] as const).filter((m) => kcalBy.has(m))
    .map((m) => ({ meal: m, kcal: Math.round(kcalBy.get(m)!), share: total ? Math.round((kcalBy.get(m)! / total) * 100) : 0 }));
  return {
    from: dates[0], to: end, days: list, daysLogged: logged.length, avgKcal, avgProt,
    kcalPct: avgKcal == null || !targets.kcal ? null : Math.round((avgKcal / targets.kcal) * 100),
    protPct: avgProt == null || !targets.protein ? null : Math.round((avgProt / targets.protein) * 100),
    adherence: proteinAdherence(logged.map((d) => d.prot), targets.protein), byMeal,
  };
}

/** "O que mais te dá proteína": soma por alimento reconhecido (reescalado ao total do registro quando o Claude corrigiu). */
export function topProteinFoods(entries: readonly FoodEntry[], limit = 5): { label: string; prot: number; times: number }[] {
  const acc = new Map<string, { prot: number; times: number }>();
  for (const e of entries) {
    const parts = foodParts(e.text ?? "");
    const sum = parts.reduce((s, p) => s + p.prot, 0);
    const k = e.prot != null && sum > 0 ? e.prot / sum : 1;
    for (const p of parts) { const a = acc.get(p.label) ?? { prot: 0, times: 0 }; a.prot += p.prot * k; a.times++; acc.set(p.label, a); }
  }
  return [...acc].map(([label, a]) => ({ label, prot: Math.round(a.prot * 10) / 10, times: a.times })).sort((a, b) => b.prot - a.prot).slice(0, limit);
}

// ---------- tendência do peso ----------
export interface WeightPoint { date: string; kg: number }
export const EMA_ALPHA = 0.1;
const MIN_WEIGHINS = 4, MIN_SPAN_DAYS = 10, WINDOW_DAYS = 21, TREND_DAYS = 14;
const KCAL_PER_KG = 7700;

export interface WeightTrend { last: number | null; perWeek: number | null; weighins: number; reason?: string }
/** EMA do peso (α 0,1) e variação da tendência em kg/semana nos últimos 14 dias. Precisa de ≥ 4 pesagens em 3 semanas, espalhadas por ≥ 10 dias. */
export function weightTrend(weights: readonly WeightPoint[], end: string): WeightTrend {
  const all = weights.filter((w) => w.date <= end && Number.isFinite(w.kg)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!all.length) return { last: null, perWeek: null, weighins: 0 };
  const emaAt = new Map<string, number>();
  let ema = all[0].kg;
  for (const w of all) { ema = emaAt.size === 0 ? w.kg : EMA_ALPHA * w.kg + (1 - EMA_ALPHA) * ema; emaAt.set(w.date, ema); }
  const valueOn = (d: string) => { let v = all[0].kg; for (const w of all) { if (w.date <= d) v = emaAt.get(w.date)!; else break; } return v; };
  const winStart = addDays(end, -(WINDOW_DAYS - 1));
  const inWin = all.filter((w) => w.date >= winStart);
  const last = Math.round(valueOn(end) * 100) / 100;
  if (inWin.length < MIN_WEIGHINS || diffDays(inWin[0].date, inWin[inWin.length - 1].date) < MIN_SPAN_DAYS) return { last, perWeek: null, weighins: inWin.length };
  const ref = addDays(end, -TREND_DAYS) < all[0].date ? all[0].date : addDays(end, -TREND_DAYS);
  const span = diffDays(ref, end);
  if (span < MIN_SPAN_DAYS) return { last, perWeek: null, weighins: inWin.length };
  const perWeek = Math.round(((valueOn(end) - valueOn(ref)) / span) * 7 * 100) / 100;
  return { last, perWeek: perWeek || 0, weighins: inWin.length };
}

// ---------- calorias adaptativas ----------
export const PACES = ["lento", "moderado", "rapido"] as const;
export type Pace = (typeof PACES)[number];
/** Ganho desejado em kg/semana. */
export const PACE_KG_WEEK: Record<Pace, number> = { lento: 0.15, moderado: 0.25, rapido: 0.4 };
export const PACE_NM: Record<Pace, string> = { lento: "Lento", moderado: "Moderado", rapido: "Rápido" };
export const MAX_WEEKLY_ADJUST = 150;
export const KCAL_MIN = 1200, KCAL_MAX = 6000;
const MIN_LOGGED_DAYS = 7, MIN_DAY_KCAL = 800;
/** Fora disto os dados (pesagem errada, comida faltando) não sustentam um ajuste. */
const PLAUSIBLE_TDEE: [number, number] = [800, 8000], MAX_PLAUSIBLE_TREND = 3;

export interface AdaptiveInput {
  weights: readonly WeightPoint[]; intake: readonly { date: string; kcal: number }[]; currentKcal: number; pace: Pace; end: string;
  /** variação da cintura (cm) em 4 semanas; > 1 com peso subindo rápido derruba a meta em 150 kcal */
  waistDeltaCm4w?: number | null;
}
export interface AdaptiveResult {
  code: "ok" | "dentro" | "sem_dados" | "cintura";
  adjust: number; kcal: number; faixa: [number, number];
  tdee: number | null; avgIntake: number | null; trendKgWeek: number | null; desired: number | null; loggedDays: number;
  /** o "por que mudou" que aparece na tela */
  reason: string;
}

const br = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const sgn = (n: number) => (n > 0 ? `+${n}` : String(n));
const kg2 = (n: number) => (n > 0 ? "+" : n < 0 ? "-" : "") + Math.abs(n).toFixed(2).replace(".", ",");
const clampKcal = (n: number) => Math.max(KCAL_MIN, Math.min(KCAL_MAX, n));

/**
 * Estima o gasto (média ingerida − variação da tendência do peso × 7700 kcal/kg) e leva a meta até o ritmo de ganho escolhido,
 * no máximo ±150 kcal por semana. Pouco dado não mexe na meta e diz o que falta.
 */
export function adaptiveTarget(i: AdaptiveInput): AdaptiveResult {
  const cur = i.currentKcal;
  const result = (p: Partial<AdaptiveResult> & Pick<AdaptiveResult, "code" | "adjust" | "reason">): AdaptiveResult => {
    // piso/teto de segurança, e nunca mais que ±150 da meta atual (mesmo que ela já esteja fora da faixa)
    const kcal = Math.max(cur - MAX_WEEKLY_ADJUST, Math.min(cur + MAX_WEEKLY_ADJUST, clampKcal(cur + p.adjust)));
    return { tdee: null, avgIntake: null, trendKgWeek: null, desired: null, loggedDays: 0, ...p, kcal, adjust: kcal - cur, faixa: [kcal - 100, kcal + 100] };
  };
  const trend = weightTrend(i.weights, i.end);
  if (trend.perWeek == null) {
    return result({ code: "sem_dados", adjust: 0, reason: `Ainda não dá para ajustar: faltam registros de peso (preciso de ao menos ${MIN_WEIGHINS} pesagens em 3 semanas, espalhadas por ${MIN_SPAN_DAYS} dias ou mais; tenho ${trend.weighins}). Pesar 2 a 3 vezes por semana basta.` });
  }
  const winStart = addDays(i.end, -(WINDOW_DAYS - 1));
  const days = new Map<string, number>();
  for (const x of i.intake) if (x.date >= winStart && x.date <= i.end && x.kcal >= MIN_DAY_KCAL) days.set(x.date, x.kcal);
  const n = days.size;
  if (n < MIN_LOGGED_DAYS) {
    return result({ code: "sem_dados", adjust: 0, trendKgWeek: trend.perWeek, loggedDays: n, reason: `Ainda não dá para ajustar: poucos dias com comida registrada (${n} de ${MIN_LOGGED_DAYS} necessários nas últimas 3 semanas). Dia com menos de ${MIN_DAY_KCAL} kcal conta como incompleto.` });
  }
  const avgIntake = Math.round([...days.values()].reduce((s, v) => s + v, 0) / n);
  const tdee = Math.round(avgIntake - (trend.perWeek * KCAL_PER_KG) / 7);
  const desired = Math.round(tdee + (PACE_KG_WEEK[i.pace] * KCAL_PER_KG) / 7);
  if (tdee < PLAUSIBLE_TDEE[0] || tdee > PLAUSIBLE_TDEE[1] || Math.abs(trend.perWeek) > MAX_PLAUSIBLE_TREND) {
    return result({ code: "sem_dados", adjust: 0, avgIntake, trendKgWeek: trend.perWeek, loggedDays: n, reason: `Os números não fecham (gasto estimado de ~${br(tdee)} kcal com o peso variando ${kg2(trend.perWeek)} kg/semana). Confira os pesos e a comida registrada; não vou mexer na meta com isso.` });
  }
  const base = { avgIntake, tdee, desired, trendKgWeek: trend.perWeek, loggedDays: n };
  const visto = `Você comeu em média ${br(avgIntake)} kcal/dia (${n} dias registrados) e a tendência do peso ficou em ${kg2(trend.perWeek)} kg/semana: gasto estimado de ~${br(tdee)} kcal.`;

  if ((i.waistDeltaCm4w ?? 0) > 1 && trend.perWeek >= PACE_KG_WEEK.rapido) {
    return result({ ...base, code: "cintura", adjust: -MAX_WEEKLY_ADJUST, reason: `${visto} A cintura subiu ${String(Math.round(i.waistDeltaCm4w! * 10) / 10).replace(".", ",")} cm em 4 semanas com o peso subindo rápido: -${MAX_WEEKLY_ADJUST} kcal antes de mexer no treino. De ${br(cur)} para ${br(clampKcal(cur - MAX_WEEKLY_ADJUST))}.` });
  }
  const delta = desired - cur;
  if (Math.abs(delta) < 50) {
    return result({ ...base, code: "dentro", adjust: 0, reason: `${visto} A meta de ${br(cur)} já está perto do que o ritmo ${PACE_NM[i.pace].toLowerCase()} pede (~${br(desired)}): mantém.` });
  }
  const adjust = Math.max(-MAX_WEEKLY_ADJUST, Math.min(MAX_WEEKLY_ADJUST, Math.round(delta / 5) * 5));
  const novo = clampKcal(cur + adjust);
  const limite = Math.abs(delta) > MAX_WEEKLY_ADJUST ? ` (limite de ±${MAX_WEEKLY_ADJUST} por semana)` : "";
  return result({ ...base, code: "ok", adjust, reason: `${visto} Para o ritmo ${PACE_NM[i.pace].toLowerCase()} (~${PACE_KG_WEEK[i.pace].toString().replace(".", ",")} kg/semana) a meta pede ~${br(desired)}. Ajuste de ${sgn(novo - cur)} kcal${limite}: de ${br(cur)} para ${br(novo)}.` });
}

// ---------- motor de voz ----------
export type VoiceEngine = "whisper" | "navegador" | "nenhum";
export interface VoiceEnv {
  /** https ou localhost (nunca file://) */ secure: boolean;
  /** MediaRecorder + getUserMedia */ recorder: boolean;
  /** SpeechRecognition / webkitSpeechRecognition */ recognition: boolean;
  /** há servidor (não é a demonstração) */ server: boolean;
  /** o Worker tem o binding de IA (Whisper) */ serverAi: boolean;
  /** o Whisper falhou nesta sessão: cai para o navegador */ whisperFalhou?: boolean;
}
export interface VoicePick { engine: VoiceEngine; label: string; help: string }

/** Hierarquia: 1) Whisper no servidor, 2) reconhecimento do navegador, 3) mensagem clara. */
export function pickVoiceEngine(e: VoiceEnv): VoicePick {
  if (e.secure && e.recorder && e.server && e.serverAi && !e.whisperFalhou) return { engine: "whisper", label: "Whisper (servidor)", help: "" };
  if (e.secure && e.recognition) return { engine: "navegador", label: "Reconhecimento do navegador", help: "" };
  return {
    engine: "nenhum", label: "Sem microfone no app",
    help: e.secure
      ? "Este navegador não tem reconhecimento de voz (Firefox e alguns navegadores de privacidade não têm). Use o microfone do teclado: toque no ícone de microfone do teclado do celular."
      : "O microfone só funciona em https ou localhost, nunca abrindo o arquivo direto. Use o microfone do teclado enquanto isso.",
  };
}

/** Mensagem curta, em pt-BR, para cada motivo de erro do microfone. */
export function voiceHelp(code: string): string {
  switch (code) {
    case "permissao": return "Sem permissão de microfone. Libere nas configurações do navegador (ícone de cadeado) e tente de novo.";
    case "sem_microfone": return "Não encontrei um microfone neste aparelho. Use o microfone do teclado.";
    case "audio_grande": return "O áudio ficou grande demais (máximo ~2 min). Grave em partes menores.";
    case "audio_vazio": return "Não captei áudio. Fale mais perto do microfone e tente de novo.";
    case "fala_nao_entendida": return "Não entendi nada. Tente de novo, falando devagar e perto do microfone.";
    case "sem_servidor": return "A transcrição no servidor não está ligada. Vou usar o reconhecimento do navegador ou o microfone do teclado.";
    case "falha_modelo": return "A transcrição no servidor falhou agora. Tente de novo ou use o microfone do teclado.";
    case "rede": return "Sem conexão para transcrever. Tente de novo ou use o microfone do teclado.";
    default: return "Não deu certo. Tente de novo ou use o microfone do teclado.";
  }
}
