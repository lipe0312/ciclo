// Tela Chat (#30): caixa de pedidos com status honesto da fila, "Continuar no Chat", memória do Chat (editável),
// checklist "Chat ligado" e os 3 caminhos para mudar o treino. Sem API: a caixa é respondida pela rotina ou pelo vigia.
import { useEffect } from "preact/hooks";
import { CaixaClaude } from "./caixa.tsx";
import { ClaudeLigado, MemoriaCard, StatusFila, loadClaude, useClaude } from "./memoria.tsx";
import { Card, Icon } from "../../lib/ui/index.tsx";
import { C } from "../../lib/store/index.ts";

export default function Chat() {
  const info = useClaude();
  useEffect(() => { const t = setInterval(loadClaude, 60_000); return () => clearInterval(t); }, []);
  return <><p class="kicker">Seu treinador · connector MCP</p>
    <div class="row between wrapx" style="margin-bottom:14px;row-gap:6px"><h1>Chat</h1><StatusFila info={info} /></div>
    <div class="grid dash"><div class="stack"><CaixaClaude limit={30} />
      <a class="btn full" href={C.CLAUDE_NOVO} target="_blank" rel="noopener noreferrer"><Icon id="chat" />Conversar agora no Chat</a></div>
      <div class="stack">
        <Card><h2>Como mudar seu treino</h2>
          <ol class="small" style="margin:8px 0 0;padding-left:20px;display:grid;gap:4px">
            <li><b>Editar à mão</b> no Treino: trocar, séries e reps (o Chat só revisa).</li>
            <li><b>Gerar outro</b> no Treino, na hora e sem o Chat.</li>
            <li><b>Pedir ao Chat</b> aqui: a proposta volta com <i>Aplicar</i>.</li>
          </ol></Card>
        <MemoriaCard info={info} />
        <ClaudeLigado info={info} />
      </div></div></>;
}
