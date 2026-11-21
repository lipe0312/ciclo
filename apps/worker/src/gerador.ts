// #105 Entrada do gerador determinístico (#65), validada com os helpers de http.ts antes de gerar (semana do app, MCP e
// "Gerar treino"). Perfil fora das faixas → 400, nada é gerado. A regra fica no core; aqui só a validação.
// O perfil é dado de saúde (docs/03-seguranca.md): nada daqui vai para log, nem na mensagem de erro (só o nome do campo).
import { AVISOS_SAUDE, DOWS, PAIN_REGIONS } from "@ciclo/core";
import type { AvisoSaude, BaseGerador, Dow, Pain } from "@ciclo/core";
import { HttpError, int, oneOf } from "./http.ts";

const REGIOES = PAIN_REGIONS.map((r) => r.id);

export interface EntradaGerador extends BaseGerador {
  minutos: number; dias: Dow[]; diasMeta: number; dores: Pain[]; saude: AvisoSaude[];
}

const lista = (v: unknown, campo: string, max: number): unknown[] => {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > max) throw new HttpError(400, `${campo} inválido`);
  return v;
};
const semRepetir = <T>(xs: T[], campo: string): T[] => {
  if (new Set(xs).size !== xs.length) throw new HttpError(400, `${campo}: itens repetidos`);
  return xs;
};

/** Nível, minutos, dias, meta de dias, dores, sexo e saúde. Qualquer campo fora → HttpError 400 (só o nome do campo). */
export function validarEntradaGerador(v: { sex?: unknown; level?: unknown; minutes?: unknown; daysUsual?: unknown; daysTarget?: unknown; pains?: unknown; saude?: unknown }): EntradaGerador {
  const nivel = int(v.level, "level", 0, 3) as 0 | 1 | 2 | 3;
  const minutos = int(v.minutes, "minutes", 20, 180)!;
  const dias = semRepetir(lista(v.daysUsual, "daysUsual", 7).map((d) => oneOf(d, "daysUsual", DOWS)), "daysUsual");
  const diasMeta = int(v.daysTarget, "daysTarget", 1, 7)!;
  const dores = lista(v.pains, "pains", 100).map((p): Pain => {
    if (!p || typeof p !== "object") throw new HttpError(400, "pains inválido");
    const x = p as { region?: unknown; intensity?: unknown };
    return { region: oneOf(x.region, "pains.region", REGIOES), intensity: int(x.intensity, "pains.intensity", 1, 3) as 1 | 2 | 3 };
  });
  const saude = semRepetir(lista(v.saude, "saude", AVISOS_SAUDE.length).map((s) => oneOf(s, "saude", AVISOS_SAUDE)), "saude");
  const sexo = v.sex == null ? null : oneOf(v.sex, "sex", ["m", "f"] as const);
  return { sexo, nivel, minutos, dias, diasMeta, dores, saude };
}
