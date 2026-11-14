// #62 Conta: o que as subtelas compartilham — dados da conta, sair, cabeçalho com voltar e o avatar de iniciais.
import type { ComponentChildren } from "preact";
import * as C from "@ciclo/core";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";

export interface Account {
  name: string | null; sobrenome: string | null; email: string | null; role: "owner" | "user"; via: string | null;
  sexo: C.Sexo | null; nascimento: string | null; alturaCm: number | null; pesoKg: number | null;
}

export const dia = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }) : "nunca");

/** Some tudo o que o app guardou neste navegador (fila offline, caches de tela, preferências). A origem é só do app. */
export function limparNavegador() {
  try { localStorage.clear(); } catch { /* sem storage */ }
  try { sessionStorage.clear(); } catch { /* sem storage */ }
}

/** Sair: apaga a sessão no servidor e o cookie, limpa o aparelho e volta para o login. */
export async function sair() {
  if (SERVER) { try { await api("POST", "/auth/logout", {}); } catch { /* sem rede: o cookie some no próximo login; a tela volta ao login de qualquer jeito */ } }
  limparNavegador();
  location.hash = "#entrar"; location.reload();
}

export const nomeCompleto = (a: Pick<Account, "name" | "sobrenome"> | null) => [a?.name, a?.sobrenome].filter(Boolean).join(" ") || "Sua conta";

export function Avatar({ nome, sobrenome, grande }: { nome: string | null | undefined; sobrenome?: string | null; grande?: boolean }) {
  return <span class={`avatar${grande ? " lg" : ""}`} aria-hidden="true">{C.iniciais(nome, sobrenome)}</span>;
}

/** Cabeçalho de subtela: voltar para Conta + título. */
export function Sub({ titulo, children }: { titulo: string; children?: ComponentChildren }) {
  return <div class="conta">
    <a class="btn ghost conta-voltar" href="#conta"><Icon id="back" />Conta</a>
    <h1>{titulo}</h1>
    {children}
  </div>;
}
