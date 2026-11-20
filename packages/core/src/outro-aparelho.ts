// #83 Conta → Segurança: "Entrar em outro aparelho". Só ordena as situações pela plataforma mais provável; mostra todas.
export type Plataforma = "android" | "ios" | "mac" | "windows" | "outro";
export type SituacaoId = "android" | "windows" | "qr" | "gerenciador" | "chave" | "adicionar" | "codigos";

/** Ordem padrão (a mesma da issue). */
export const SITUACOES: readonly SituacaoId[] = ["android", "windows", "qr", "gerenciador", "chave", "adicionar", "codigos"];

/** Plataforma a partir de `navigator.userAgentData.platform` (se houver) e do User-Agent. Só serve para ordenar texto. */
export function detectarPlataforma(ua?: string | null, hint?: string | null, toques = 0): Plataforma {
  const h = (hint ?? "").toLowerCase();
  const u = (ua ?? "").toLowerCase();
  if (h === "android" || /android/.test(u)) return "android";
  if (h === "ios" || /iphone|ipad|ipod/.test(u)) return "ios";
  if (h === "windows" || /windows/.test(u)) return "windows";
  if (h === "macos" || /macintosh|mac os x/.test(u)) return toques > 1 ? "ios" : "mac"; // iPadOS se apresenta como Mac
  return "outro";
}

/** Situação aberta primeiro para cada plataforma. iPhone/Mac já têm as Chaves do iCloud: o QR serve para o resto. */
const PRIMEIRA: Record<Plataforma, SituacaoId> = { android: "android", windows: "windows", ios: "qr", mac: "qr", outro: "qr" };
export const situacaoProvavel = (p: Plataforma): SituacaoId => PRIMEIRA[p];

/** Todas as situações, a mais provável na frente; o resto mantém a ordem padrão. */
export function ordenarSituacoes(p: Plataforma): SituacaoId[] {
  const a = PRIMEIRA[p];
  return [a, ...SITUACOES.filter((s) => s !== a)];
}
