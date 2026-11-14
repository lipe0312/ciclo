// #64 Navegação: toda tela tem uma saída previsível. O destino do "voltar" é o nível de cima na árvore
// de telas (pilha própria), nunca history.back cego. O botão, o Esc e o gesto da borda usam esta mesma regra.
export interface Destino { screen: string; parts: string[]; nm: string }

/** Barra inferior (no máximo 5) e o resto, que fica em "Mais". */
export const TELAS_ABA = ["hoje", "treino", "diario", "comida", "chat"] as const;
export const TELAS_MAIS = ["corpo", "academias", "perfil", "conta", "vida"] as const;
/** Todas as telas do app (rota #tela/...). "claude" é apelido antigo de "chat". */
export const TELAS: readonly string[] = [...TELAS_ABA, ...TELAS_MAIS, "semana", "mais", "primeiros-passos", "entrar"];

const NOME: Record<string, string> = {
  hoje: "Hoje", treino: "Treino", diario: "Diário", comida: "Comida", chat: "Chat", corpo: "Corpo", academias: "Academias",
  perfil: "Perfil", conta: "Conta", vida: "Vida", semana: "Semana", mais: "Mais",
};
const para = (screen: string, parts: string[] = [], nm = NOME[screen] ?? "Voltar"): Destino => ({ screen, parts, nm });
const HOJE = () => para("hoje");

/** Para onde o "voltar" leva a partir de uma rota. A Home não tem voltar (null). */
export function voltarDe(screen: string, parts: readonly string[]): Destino | null {
  const s = screen === "claude" ? "chat" : screen;
  const [a, b] = parts;
  if (s === "hoje") return parts.length ? HOJE() : null;
  if (s === "primeiros-passos" || s === "entrar" || s === "mais") return HOJE();
  if (!TELAS.includes(s)) return HOJE();
  if (!a) return (TELAS_MAIS as readonly string[]).includes(s) ? para("mais") : HOJE();
  if (s === "treino" && a === "exercicio") return para("treino", ["exercicios"], "Exercícios");
  if (s === "academias" && a !== "novo" && b) return para("academias", [a], "Lugar");
  return para(s);
}

/** A sequência de destinos tocando "voltar" até a Home (vazia se já está nela). Para em 8 passos (sem ciclo). */
export function caminhoAteHoje(screen: string, parts: readonly string[]): Destino[] {
  const out: Destino[] = [];
  let cur = voltarDe(screen, parts);
  while (cur && out.length < 8) { out.push(cur); cur = voltarDe(cur.screen, cur.parts); }
  return out;
}
