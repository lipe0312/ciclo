// #114 O app percebe sozinho quando algo mudou na conta (o Claude pelo MCP, a caixa, outro aparelho) e atualiza a tela sem fechar o app.
// Confere GET /api/version ao voltar para a aba (visibilitychange/focus/online) e a cada poucos segundos SÓ com a aba visível.
// Mudou → recarrega os dados no lugar (commit re-renderiza o Preact: nada pisca e a rolagem fica), com o aviso "Atualizado".
import { SERVER, api, onEscrita } from "../api/index.ts";
import { toast } from "../ui/index.tsx";
import { DEBOUNCE_ESCRITA_MS, INTERVALO_MS, criarAtualizador } from "./regras.ts";

let ocupado = () => false;
let recarregar: () => Promise<void> = async () => {};
const A = criarAtualizador({
  buscarVersao: async () => { try { const r = await api<{ version: number }>("GET", "/api/version"); return typeof r?.version === "number" ? r.version : null; } catch { return null; } },
  recarregar: () => recarregar(),
  ocupado: () => ocupado(),
  agora: () => Date.now(),
  avisar: toast,
});
/** O /api/state traz a versão junto: a que veio com os dados é a que a tela já mostra. */
export const marcarVersao = A.marcar;

/** Liga a conferência (só no servidor; a demo não tem conta). `fazer` recarrega tudo que a tela mostra; `treinando` adia durante o treino. */
export function iniciarAtualizacao(fazer: () => Promise<void>, treinando: () => boolean) {
  if (!SERVER) return;
  recarregar = fazer; ocupado = treinando;
  let timer: ReturnType<typeof setInterval> | undefined;
  const parar = () => { if (timer) { clearInterval(timer); timer = undefined; } };
  const ligar = () => { if (document.hidden) return; void A.conferir(); if (!timer) timer = setInterval(() => { if (!document.hidden) void A.conferir(); }, INTERVALO_MS); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) parar(); else ligar(); });
  addEventListener("focus", () => { if (!document.hidden) void A.conferir(); });
  addEventListener("online", () => { if (!document.hidden) void A.conferir(); });
  // escrita deste aparelho (salvar, caixa de pedidos, resposta do chat): confere logo, sem esperar o ciclo; uma conferência por rajada
  let deb: ReturnType<typeof setTimeout> | undefined;
  onEscrita(() => { A.escreveu(); clearTimeout(deb); deb = setTimeout(() => { if (!document.hidden) void A.conferir(); }, DEBOUNCE_ESCRITA_MS); });
  ligar();
}
