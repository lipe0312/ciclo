// #55 "Conectar meu Claude": regras puras do token por pessoa (teto, expiração por falta de uso), do passo a passo
// guiado e da confirmação de apagar a conta. O Worker e a tela só chamam daqui.

export const MAX_MCP_TOKENS = 5;
export const TOKEN_IDLE_DAYS = 90;
export const TOKEN_IDLE_MS = TOKEN_IDLE_DAYS * 86_400_000;
const AVISO_DIAS = 14; // a tela avisa nos últimos 14 dias antes de expirar

export interface TokenInfo { createdAt: number; lastUsedAt: number | null; revokedAt: number | null }
export type EstadoTokenNome = "ativo" | "expirando" | "expirado" | "revogado";
export interface EstadoToken { estado: EstadoTokenNome; expiraEm: number; diasRestantes: number }

/** Token sem uso há 90 dias (contando da criação se nunca usado) expira. Revogado vence tudo. */
export function estadoToken(t: TokenInfo, now: number): EstadoToken {
  const expiraEm = (t.lastUsedAt ?? t.createdAt) + TOKEN_IDLE_MS;
  const diasRestantes = Math.max(0, Math.floor((expiraEm - now) / 86_400_000));
  if (t.revokedAt != null) return { estado: "revogado", expiraEm, diasRestantes };
  if (expiraEm <= now) return { estado: "expirado", expiraEm, diasRestantes: 0 };
  return { estado: diasRestantes < AVISO_DIAS ? "expirando" : "ativo", expiraEm, diasRestantes };
}

/** O token ainda autentica? (não revogado e não expirado) */
export const tokenValido = (t: TokenInfo, now: number) => { const e = estadoToken(t, now).estado; return e === "ativo" || e === "expirando"; };

/** Quantos contam no teto de 5. */
export const tokensAtivos = (ts: TokenInfo[], now: number) => ts.filter((t) => tokenValido(t, now)).length;

export const mcpUrl = (origin: string) => `${origin.replace(/\/+$/, "")}/mcp`;
export const cabecalhoAuth = (token: string) => `Authorization: Bearer ${token}`;

/** Passo atual do guia: 1 criar conta · 2 gerar chave · 3 colar no claude.ai · 4 testar · 5 conectado (✅).
 *  ✅ = algum token válido já foi usado por uma chamada MCP. */
export function passoConectar(s: { temConta: boolean; tokens: TokenInfo[] }, now: number): 1 | 2 | 3 | 4 | 5 {
  if (!s.temConta) return 1;
  const validos = s.tokens.filter((t) => tokenValido(t, now));
  if (!validos.length) return 2;
  return validos.some((t) => t.lastUsedAt != null) ? 5 : 3;
}

/** Confirmação de apagar a conta: a pessoa digita "apagar". */
export const confirmaApagar = (v: unknown) => typeof v === "string" && v.trim().toLowerCase() === "apagar";

/** Valores da demonstração: de mentira, marcados como exemplo e fora do formato real (nunca autenticam). */
export const EXEMPLO_CONEXAO = {
  url: "https://ciclo.exemplo.workers.dev/mcp",
  token: "ciclo_EXEMPLO_nao-funciona_crie-o-seu-na-conta",
} as const;
