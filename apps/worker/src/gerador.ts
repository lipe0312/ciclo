// #105 Entrada do gerador determinístico (#65). Duas portas:
//  - entrada NOVA (PUT/PATCH /api/profile, ciclo_perfil_atualizar): validada com os helpers de http.ts; fora das faixas → 400;
//  - dado JÁ SALVO (gerar a semana, "Gerar treino"): saneado, nunca 400 (dor legada de região que saiu do catálogo ou perfil
//    antigo fora das faixas não pode travar a pessoa). A regra fica no core; aqui só a validação.
// O perfil é dado de saúde (docs/03-seguranca.md): nada daqui vai para log, e o erro só nomeia o campo (nunca o valor).
import { AVISOS_SAUDE, DOWS, PAIN_REGIONS, mensagemPerfil } from "@ciclo/core";
import type { AvisoSaude, BaseGerador, Dow, Pain } from "@ciclo/core";
import { HttpError, int, oneOf } from "./http.ts";

const REGIOES = PAIN_REGIONS.map((r) => r.id);
const SEXOS = ["m", "f"] as const;

export interface EntradaGerador extends BaseGerador {
  minutos: number; dias: Dow[]; diasMeta: number; dores: Pain[]; saude: AvisoSaude[];
}
type Bruto = { sex?: unknown; level?: unknown; minutes?: unknown; daysUsual?: unknown; daysTarget?: unknown; pains?: unknown; saude?: unknown };

const lista = (v: unknown, campo: string, max: number): unknown[] => {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > max) throw new HttpError(400, `${campo} inválido`);
  return v;
};
const semRepetir = <T>(xs: T[], campo: string): T[] => {
  if (new Set(xs).size !== xs.length) throw new HttpError(400, `${campo}: itens repetidos`);
  return xs;
};
const CHECA: Record<keyof Bruto, (v: unknown) => unknown> = {
  sex: (v) => oneOf(v, "sex", SEXOS),
  level: (v) => int(v, "level", 0, 3),
  minutes: (v) => int(v, "minutes", 20, 180),
  daysUsual: (v) => semRepetir(lista(v, "daysUsual", 7).map((d) => oneOf(d, "daysUsual", DOWS)), "daysUsual"),
  daysTarget: (v) => int(v, "daysTarget", 1, 7),
  pains: (v) => lista(v, "pains", 100).map((p): Pain => {
    if (!p || typeof p !== "object") throw new HttpError(400, "pains inválido");
    const x = p as { region?: unknown; intensity?: unknown };
    return { region: oneOf(x.region, "pains.region", REGIOES), intensity: int(x.intensity, "pains.intensity", 1, 3) as 1 | 2 | 3 };
  }),
  saude: (v) => semRepetir(lista(v, "saude", AVISOS_SAUDE.length).map((s) => oneOf(s, "saude", AVISOS_SAUDE)), "saude"),
};

/** Entrada completa e nova: nível, minutos, dias, meta, dores, sexo e saúde. Qualquer campo fora → HttpError 400. */
export function validarEntradaGerador(v: Bruto): EntradaGerador {
  return {
    sexo: v.sex == null ? null : (CHECA.sex(v.sex) as "m" | "f"), nivel: CHECA.level(v.level) as 0 | 1 | 2 | 3,
    minutos: CHECA.minutes(v.minutes) as number, dias: CHECA.daysUsual(v.daysUsual) as Dow[], diasMeta: CHECA.daysTarget(v.daysTarget) as number,
    dores: CHECA.pains(v.pains) as Pain[], saude: CHECA.saude(v.saude) as AvisoSaude[],
  };
}

/** Patch novo do perfil (app ou Chat): confere, com http.ts, só os campos do gerador que vieram (null/"" = não respondido).
 *  `humano`: a mensagem é a da tela (mensagemPerfil), como no resto do perfil. */
export function validarPatchGerador(patch: unknown, humano: boolean): void {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return; // o formato é recusado pelo validador do perfil
  const p = patch as Record<string, unknown>;
  for (const k of ["sex", "level", "minutes", "daysUsual", "daysTarget", "saude"] as const) {
    if (!Object.hasOwn(p, k) || p[k] == null || p[k] === "") continue;
    try { CHECA[k](p[k]); } catch (e) {
      if (humano && e instanceof HttpError) throw new HttpError(400, mensagemPerfil([k]), "perfil_invalido");
      throw e;
    }
  }
}

const inteiro = (v: unknown, lo: number, hi: number, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : padrao);

/** Dado já salvo: nunca recusa. Dor de região desconhecida sai, faixas são ajustadas, dia inválido é ignorado. */
export function entradaGeradorSalva(v: Bruto): EntradaGerador {
  const dias = Array.isArray(v.daysUsual) ? DOWS.filter((d) => (v.daysUsual as unknown[]).includes(d)) : [];
  const dores = (Array.isArray(v.pains) ? v.pains : []).flatMap((p): Pain[] => {
    const x = (p ?? {}) as { region?: unknown; intensity?: unknown };
    return typeof x.region === "string" && REGIOES.includes(x.region) ? [{ region: x.region, intensity: inteiro(x.intensity, 1, 3, 2) as 1 | 2 | 3 }] : [];
  });
  const saude = AVISOS_SAUDE.filter((s) => Array.isArray(v.saude) && v.saude.includes(s));
  return {
    sexo: v.sex === "m" || v.sex === "f" ? v.sex : null, nivel: inteiro(v.level, 0, 3, 1) as 0 | 1 | 2 | 3,
    minutos: inteiro(v.minutes, 20, 180, 60), dias, diasMeta: inteiro(v.daysTarget, 1, 7, dias.length || 4), dores, saude,
  };
}
