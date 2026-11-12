// Lugares onde se treina (academia, casa, hotel): validação única (app, Worker e Claude usam a mesma), id, e os dias da semana
// de cada lugar. O padrão por dia continua em profile.dayGym (é o que o planejador lê); estas funções mantêm os dois coerentes.
import { EQUIPMENT_BY_ID } from "./catalog.ts";
import { DOWS } from "./semana.ts";
import type { Dow } from "./semana.ts";

export const PLACE_KINDS = ["academia", "casa", "hotel"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
export const PLACE_KIND_NM: Record<PlaceKind, string> = { academia: "Academia", casa: "Casa", hotel: "Hotel" };
/** Faixas de horário em que a academia lota (as mesmas do app). */
export const BUSY_SLOTS = ["6-8", "12-14", "17-18", "18-20", "20-22"] as const;
export const PLACE_NAME_MAX = 40;
export const PLACE_ADDRESS_MAX = 160;
export const MAX_PLACES = 20;

export interface PlaceInput {
  name?: string; kind?: PlaceKind; address?: string | null; lat?: number | null; lng?: number | null;
  equipment?: string[]; busyHours?: string[]; weekdays?: Dow[]; sort?: number;
}
export type PlaceResult = { ok: true; value: PlaceInput; errors: [] } | { ok: false; errors: string[] };

const FIELDS = ["name", "kind", "address", "lat", "lng", "equipment", "busyHours", "weekdays", "sort"];
const CTRL = /[\u0000-\u001f\u007f]/;
const clip = (s: string) => s.slice(0, 40);
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Confere e limpa um lugar. `partial`: só valida o que veio (edição); sem `partial`, nome é obrigatório e o resto ganha padrão
 *  (menos `weekdays`, que só existe quando veio: ausente = não mexe nos dias). Qualquer erro recusa tudo. */
export function validatePlace(input: unknown, opts: { partial?: boolean } = {}): PlaceResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, errors: ["lugar deve ser um objeto"] };
  const o = input as Record<string, unknown>, errors: string[] = [], out: PlaceInput = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
  for (const k of Object.keys(o)) if (!FIELDS.includes(k)) errors.push(`${clip(k)}: campo desconhecido`);

  if (has("name")) {
    const v = o.name;
    if (typeof v !== "string" || CTRL.test(v)) errors.push("nome inválido");
    else {
      const n = v.replace(/\s+/g, " ").trim();
      if (!n) errors.push("nome obrigatório");
      else if (n.length > PLACE_NAME_MAX) errors.push(`nome deve ter até ${PLACE_NAME_MAX} caracteres`);
      else out.name = n;
    }
  } else if (!opts.partial) errors.push("nome obrigatório");

  if (has("kind")) {
    if (typeof o.kind === "string" && (PLACE_KINDS as readonly string[]).includes(o.kind)) out.kind = o.kind as PlaceKind;
    else errors.push(`tipo deve ser ${PLACE_KINDS.join("|")}`);
  } else if (!opts.partial) out.kind = "academia";

  if (has("address")) {
    const v = o.address;
    if (v === null) out.address = null;
    else if (typeof v !== "string" || CTRL.test(v)) errors.push("endereço inválido");
    else {
      const a = v.replace(/\s+/g, " ").trim();
      if (a.length > PLACE_ADDRESS_MAX) errors.push(`endereço deve ter até ${PLACE_ADDRESS_MAX} caracteres`);
      else out.address = a || null;
    }
  } else if (!opts.partial) out.address = null;

  if (has("lat") !== has("lng")) errors.push("lat e lng devem vir juntos");
  else if (has("lat")) {
    const coord = (k: "lat" | "lng", lim: number) => {
      const v = o[k];
      if (v === null) return null;
      if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > lim) { errors.push(`${k} deve ser número de -${lim} a ${lim}`); return undefined; }
      return round5(v);
    };
    const la = coord("lat", 90), ln = coord("lng", 180);
    if (la !== undefined && ln !== undefined) {
      if ((la === null) !== (ln === null)) errors.push("lat e lng devem vir juntos");
      else { out.lat = la; out.lng = ln; }
    }
  } else if (!opts.partial) { out.lat = null; out.lng = null; }

  const list = (k: "equipment" | "busyHours" | "weekdays", label: string, max: number, ok: (x: unknown) => boolean, bad: string): string[] | undefined => {
    const v = o[k];
    if (!Array.isArray(v)) { errors.push(`${label} deve ser uma lista`); return undefined; }
    if (v.length > max) { errors.push(`${label}: até ${max} itens`); return undefined; }
    const wrong = v.find((x) => !ok(x));
    if (wrong !== undefined || v.some((x) => typeof x !== "string")) { errors.push(`${bad}: ${clip(String(wrong ?? "?"))}`); return undefined; }
    return [...new Set(v as string[])];
  };
  if (has("equipment")) { const l = list("equipment", "aparelhos", 80, (x) => typeof x === "string" && Object.prototype.hasOwnProperty.call(EQUIPMENT_BY_ID, x), "aparelho desconhecido"); if (l) out.equipment = l; }
  else if (!opts.partial) out.equipment = [];
  if (has("busyHours")) { const l = list("busyHours", "horários", 12, (x) => (BUSY_SLOTS as readonly unknown[]).includes(x), "horário inválido"); if (l) out.busyHours = l; }
  else if (!opts.partial) out.busyHours = [];
  if (has("weekdays")) { const l = list("weekdays", "dias", 7, (x) => (DOWS as readonly unknown[]).includes(x), "dia inválido"); if (l) out.weekdays = DOWS.filter((d) => l.includes(d)); }

  if (has("sort")) {
    if (typeof o.sort === "number" && Number.isInteger(o.sort) && o.sort >= 0 && o.sort <= 99) out.sort = o.sort;
    else errors.push("sort deve ser inteiro de 0 a 99");
  }
  return errors.length ? { ok: false, errors: errors.slice(0, 12) } : { ok: true, value: out, errors: [] };
}

/** Id do lugar (slug sem acento, único entre os que já existem). */
export function placeIdFor(name: string, taken: readonly string[]): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "") || "lugar";
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) { const id = `${base}-${i}`; if (!taken.includes(id)) return id; }
}

type DayGym = Record<string, string | undefined>;
/** Padrão por dia: `patch` usa null para "sem padrão" (é o formato que o perfil aceita). */
export interface DaysChange { dayGym: Record<string, string>; patch: Record<string, string | null> }
const apply = (dayGym: DayGym, patch: Record<string, string | null>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [d, g] of Object.entries(dayGym)) if (g) out[d] = g;
  for (const [d, g] of Object.entries(patch)) { if (g === null) delete out[d]; else out[d] = g; }
  return out;
};

/** Dias da semana em que o lugar é o padrão. */
export const daysOfPlace = (dayGym: DayGym, gymId: string): Dow[] => DOWS.filter((d) => dayGym[d] === gymId);

/** O lugar passa a ser o padrão exatamente nos `weekdays`. Um dia tem um lugar só: quem tinha o dia perde. */
export function assignWeekdays(dayGym: DayGym, gymId: string, weekdays: readonly string[]): DaysChange {
  const patch: Record<string, string | null> = {};
  for (const d of DOWS) {
    const want = weekdays.includes(d), cur = dayGym[d];
    if (want && cur !== gymId) patch[d] = gymId;
    else if (!want && cur === gymId) patch[d] = null;
  }
  return { dayGym: apply(dayGym, patch), patch };
}

/** Apagar o lugar: os dias dele vão para `to` (ou ficam sem padrão, `null`). */
export function reassignDays(dayGym: DayGym, removedId: string, to: string | null): DaysChange {
  if (to === removedId) throw new Error("destino igual ao lugar apagado");
  const patch: Record<string, string | null> = {};
  for (const d of daysOfPlace(dayGym, removedId)) patch[d] = to;
  return { dayGym: apply(dayGym, patch), patch };
}
