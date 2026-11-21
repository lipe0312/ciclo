// #133 As 2 telas de IA no fim dos Primeiros passos (padrão do quiz: salvam por passo, Pular, Voltar). Aqui só se
// declara; a chave nunca é digitada aqui (vai para o cofre, em Perfil → Sua IA).
import * as C from "@ciclo/core";
import { S } from "../../lib/store/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { SheetHead, openSheet } from "../../lib/folha/index.tsx";
import { go, href } from "../../lib/roteador/index.ts";
import { ComoUsa, EscolhaIa } from "../../lib/sua-ia/escolha.tsx";
import { Guia } from "../../lib/sua-ia/guia.tsx";
import "../../lib/sua-ia/sua-ia.css";

export const TelaIa = ({ onMudou }: { onMudou: () => void }) => <EscolhaIa onMudou={onMudou} />;

function abrirGuia(p: C.PassoIa) {
  openSheet(() => <><SheetHead kicker={`${p.minutos} min`} title="Configurar agora" />
    <Guia passo={p} onChave={() => go("#perfil/ia")} /></>);
}

export function TelaIaAcesso({ onMudou, onDepois }: { onMudou: () => void; onDepois: () => void }) {
  const ia = S.profile.ia, primeiro = C.caminhos(ia)[0];
  // sem IA escolhida, esta tela não tem o que perguntar: volta para a escolha (ou segue com Pular etapa)
  if (!ia) return <div class="note" role="status"><Icon id="chat" /><div>
    <p class="small">Você ainda não escolheu a sua IA (ou "Não uso IA").</p>
    <button type="button" class="btn sm" style="margin-top:8px" onClick={() => go(href("primeiros-passos", [String(C.PASSOS_PP.indexOf("ia"))]))}><Icon id="back" />Voltar e escolher</button></div></div>;
  return <>
    <ComoUsa onMudou={onMudou} />
    {ia && <div class="note sia-fim" role="status"><Icon id="chat" /><div>
      <p class="small"><b>{C.resumoCaminho(ia)}</b></p>
      {primeiro && <div class="row wrapx" style="gap:8px;margin-top:8px">
        <button type="button" class="btn sm" onClick={() => abrirGuia(primeiro)}><Icon id="arrow" />Configurar agora</button>
        <button type="button" class="btn ghost sm" onClick={onDepois}>Depois</button></div>}
      <p class="tiny sub" style="margin-top:6px">Dá para trocar a qualquer hora em Perfil → Sua IA.</p></div></div>}
  </>;
}
