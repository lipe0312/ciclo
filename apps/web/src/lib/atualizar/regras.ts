// #114 Atualização sozinha: confere a "versão da conta" no servidor e, se mudou, busca os dados de novo.
// Aqui só a regra (sem DOM nem fetch): o controlador recebe as dependências, para testar sem navegador.
export const INTERVALO_MS = 8000; // com a aba visível; oculta = nenhuma chamada
export const JANELA_PROPRIA_MS = 4000; // escrita feita neste aparelho há pouco: se ainda assim precisar recarregar, sem o aviso
export const DEBOUNCE_ESCRITA_MS = 600; // várias escritas seguidas (toques no stepper) viram uma conferência só

export interface Deps {
  /** Versão atual no servidor, ou null sem rede/sem sessão. */
  buscarVersao(): Promise<number | null>;
  /** Busca os dados de novo (estado, Hoje, Semana, Comida…); a versão vista é gravada de volta por `marcar`. */
  recarregar(): Promise<void>;
  /** Treino em andamento: não mexe na tela por baixo da pessoa (tenta de novo quando acabar). */
  ocupado(): boolean;
  agora(): number;
  avisar(texto: string): void;
}

export function criarAtualizador(d: Deps) {
  let vista: number | null = null;
  let emVoo = false;
  let ultimaEscrita = -Infinity;
  let proprias = 0; // escritas deste aparelho aceitas pelo servidor desde a última sincronização (cada uma sobe a versão em +1)

  /** A versão que veio junto com os dados (GET /api/state) passa a ser a "vista". */
  const marcar = (v: unknown) => { if (typeof v === "number" && Number.isFinite(v)) vista = v; };
  const escreveu = () => { ultimaEscrita = d.agora(); proprias++; };

  /** Confere e, se a versão mudou, recarrega. Devolve true se recarregou. Nunca lança. */
  async function conferir(): Promise<boolean> {
    if (emVoo) return false;
    emVoo = true;
    try {
      const atual = await d.buscarVersao();
      if (atual == null || atual === vista) return false;
      // só escritas deste aparelho (a tela já está certa, otimista): adota a versão e segue, sem buscar nada de novo nem piscar
      if (vista != null && proprias > 0 && atual > vista && atual - vista <= proprias) { vista = atual; proprias = 0; return false; }
      if (d.ocupado()) return false; // fica `vista` antiga: recarrega quando o treino acabar
      const primeira = vista == null; // abriu sem sinal: ainda não há dados do servidor na tela
      const propria = d.agora() - ultimaEscrita < JANELA_PROPRIA_MS;
      proprias = 0;
      await d.recarregar();
      if (!propria && !primeira) d.avisar("Atualizado");
      return true;
    } catch { return false; }
    finally { emVoo = false; }
  }
  return { marcar, escreveu, conferir, vista: () => vista };
}
