// Gancho de mini-barra global: telas registram um provedor; o shell mostra o primeiro que devolver algo
// (ex.: treino em andamento quando você está em outra tela). Fica acima da barra inferior.
import type { VNode } from "preact";

type Provider = (screen: string) => VNode | null;
const providers = new Map<string, Provider>();
export function registerMiniBar(id: string, p: Provider) { providers.set(id, p); }
export function MiniBarra({ screen }: { screen: string }) {
  for (const p of providers.values()) { const v = p(screen); if (v) return <div class="minibar">{v}</div>; }
  return null;
}
