// #81 Comida → Ajustes: o que a IA conectada faz com a comida dita na conversa (prévia antes de subir).
import { COMIDA_APROVACAO, COMIDA_APROVACAO_NM } from "@ciclo/core";
import type { ComidaAprovacao } from "@ciclo/core";
import { commit } from "../../lib/store/index.ts";
import { DIET } from "../../lib/store/regras.ts";
import { SERVER, send } from "../../lib/api/index.ts";
import { Card, Seg, toast } from "../../lib/ui/index.tsx";

const AJUDA: Record<ComidaAprovacao, string> = {
  sempre: "O Chat mostra o resumo (itens, gramas e total) e só sobe depois do seu “sim”.",
  so_duvidas: "Sobe direto o que ficou claro e pergunta só quando houver dúvida.",
  nunca: "Sobe direto. Você confere e ajusta depois aqui em Comida.",
};

export function Ajustes() {
  const v = DIET.aprovacao;
  const escolher = (x: ComidaAprovacao) => {
    const antes = DIET.aprovacao;
    DIET.aprovacao = x; commit();
    if (!SERVER) return;
    send("PATCH", "/api/home/preferencias", { comidaAprovacao: x }).then(() => toast("Ajuste salvo")).catch(() => { DIET.aprovacao = antes; commit(); toast("Não deu para salvar agora. Tente de novo."); });
  };
  return <Card>
    <p class="kicker">Ajustes</p>
    <h2 style="margin-top:6px">Comida dita na conversa</h2>
    <p class="small sub" style="margin:4px 0 10px">Pedir sua aprovação antes de subir para o Ciclo:</p>
    <Seg label="Aprovação da comida" opts={COMIDA_APROVACAO.map((x): [ComidaAprovacao, string] => [x, COMIDA_APROVACAO_NM[x]])} value={v} onPick={escolher} />
    <p class="tiny sub" style="margin-top:6px">{AJUDA[v]} O que entra pela conversa aparece com “via Chat · ≈ estimativa”, e o que você edita aqui vale sempre.</p>
  </Card>;
}
