// Checkup inicial (quiz dos Primeiros passos): feito / pulado / nunca, e quando lembrar quem pulou.
export type EstadoCheckup = "feito" | "pulado" | "nunca";
export const DIAS_DISPENSA = 7;

/** `nunca`: Primeiros passos ainda não terminados nem pulados. `pulado`: seguiu sem fazer. Sem marca no perfil = feito (contas antigas, perfil do Claude). */
export function estadoCheckup(onboardingFeito: boolean, meta?: { checkup?: string; [k: string]: unknown } | null): EstadoCheckup {
  if (!onboardingFeito) return "nunca";
  return meta?.checkup === "pulado" ? "pulado" : "feito";
}

/** Momento (ms) até o qual a faixa fica escondida depois de dispensar. */
export const dispensarCheckup = (agora: number): number => agora + DIAS_DISPENSA * 864e5;

export const mostrarFaixaCheckup = (estado: EstadoCheckup, dispensadoAte: number | null | undefined, agora: number): boolean =>
  estado !== "feito" && !(typeof dispensadoAte === "number" && agora < dispensadoAte);
