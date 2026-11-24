// #79 Treino sem academia cadastrada: o app sempre gera. Sem academia, o equipamento é o peso corporal (exercícios sem
// aparelho) mais o que a pessoa marcou; a faixa de aviso convida a cadastrar a academia e pode ser dispensada por 7 dias.

// equipamentoSemAcademia e PESO_CORPORAL ficam em equipamentos.ts (#139: a semana usa sem ciclo de import).
import type { Visibilidade } from "./home-inicio.ts";
import { faltaParaGerar } from "./perfil.ts";

/** Marca, no retorno do MCP e da API, que o treino saiu sem academia (para o Claude avisar a pessoa). */
export const EQUIPAMENTO_SEM_ACADEMIA = "sem_academia" as const;

/** "Dispensar" da faixa "Treino montado com peso corporal" esconde por 7 dias (o mesmo prazo do "Lembrar depois" da #73). */
export const FAIXA_SEM_ACADEMIA_DIAS = 7;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dia = (iso: string) => Date.parse(iso + "T12:00:00Z");

/** A faixa aparece enquanto houver 0 academias, salvo se foi dispensada há menos de 7 dias. */
export function faixaSemAcademia(i: { academias: number; dispensadaEm: string | null | undefined; hoje: string }): Visibilidade {
  if (i.academias > 0) return "oculto";
  const d = i.dispensadaEm;
  if (typeof d === "string" && ISO.test(d) && ISO.test(i.hoje) && !Number.isNaN(dia(d))
    && Math.round((dia(i.hoje) - dia(d)) / 864e5) < FAIXA_SEM_ACADEMIA_DIAS) return "oculto";
  return "mostrar";
}

/**
 * Sem academia, o treino só sai com o básico do perfil respondido (objetivo, experiência, dias, duração, onde treina):
 * quem pulou os Primeiros passos continua no Hoje vazio, sem treino aleatório (#63). Com academia, nada muda.
 */
export function semBaseParaGerar(perfil: Record<string, unknown> | null | undefined, academias: number): boolean {
  return academias === 0 && faltaParaGerar(perfil ?? {}).length > 0;
}
