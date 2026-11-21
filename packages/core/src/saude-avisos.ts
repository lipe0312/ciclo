// #105 Sinais de saúde informados pela pessoa no perfil (opcional). Servem SÓ para avisos que encaminham a um profissional:
// nada de diagnóstico e o treino não muda por eles. Base: docs/09-base-cientifica.md#saúde-e-encaminhamento.
// É dado de saúde: nunca vai para log.

export const AVISOS_SAUDE = ["gestacao", "pos_parto", "red_s"] as const;
export type AvisoSaude = (typeof AVISOS_SAUDE)[number];

/** Avisos que encaminham a um profissional (valores desconhecidos são ignorados). */
export function avisosSaude(saude: readonly unknown[] | null | undefined): string[] {
  const s = new Set((saude ?? []).filter((x): x is AvisoSaude => typeof x === "string" && (AVISOS_SAUDE as readonly string[]).includes(x)));
  const out: string[] = [];
  if (s.has("gestacao") || s.has("pos_parto")) out.push("Gestação ou pós-parto: converse com um profissional de saúde antes de seguir este treino (inclui o assoalho pélvico).");
  if (s.has("red_s")) out.push("Cansaço que não passa, menstruação que some ou comer pouco para o treino pedem um profissional de saúde (baixa energia, RED-S).");
  return out;
}
