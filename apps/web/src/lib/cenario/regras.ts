// #70 Regras puras do botão "↺ cenário" (testáveis sem navegador).
/** Só no computador do desenvolvedor: o botão nunca aparece em outro host. */
export const ehLocalhost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";
/** Chaves do aparelho que o reset apaga (rascunhos e cache do app; o tema escolhido fica). */
export const chavesDoCiclo = (chaves: readonly string[]) => chaves.filter((k) => k.startsWith("ciclo:") && k !== "ciclo:theme");
