// Tela Claude: caixa de pedidos completa. (Conversa por voz e histórico detalhado: outras issues.)
import { CaixaClaude } from "./caixa.tsx";
export default function Claude() {
  return <><p class="kicker">Seu treinador · connector MCP</p><h1 style="margin-bottom:14px">Claude</h1>
    <div class="grid dash"><div class="stack"><CaixaClaude limit={30} /></div>
      <div class="stack"><div class="card"><h2>Como funciona</h2><p class="small sub" style="margin-top:6px">Os pedidos ficam numa caixa. O Claude (no claude.ai ou no app do Claude) lê a caixa pelo connector, decide e devolve a mudança. Você aplica ou descarta aqui.</p></div></div></div></>;
}
