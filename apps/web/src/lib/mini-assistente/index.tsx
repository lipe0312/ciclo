// Mini-assistente de 1ª vez (#41): 2 a 4 passos no estilo do quiz, para as telas de cadastro mais fundo (Academias, Comida, Diário, Corpo).
// Cada tela só passa os passos; aqui ficam a barra, o Voltar/Continuar, o "Fazer manual" (quem prefere o formulário atual) e o estado
// "visto" por tela, guardado no perfil (meta.assistentes), então vale em todos os aparelhos. Nunca bloqueia: sempre dá para sair.
import { useState } from "preact/hooks";
import { S, commit } from "../store/index.ts";
import { profileChanged } from "../store/regras.ts";
import { Icon, toast } from "../ui/index.tsx";

export interface PassoMini {
  id: string; title: string; sub?: string;
  /** o "Continuar" só liga quando é verdadeiro (padrão: sempre) */
  ok?: boolean;
  /** a tela do passo; o estado das respostas fica com quem chama */
  Tela: () => any;
}

/** O assistente desta tela já foi visto (concluído ou dispensado com "Fazer manual")? */
export const assistenteVisto = (tela: string): boolean => S.profile.meta?.assistentes?.[tela] === true;
/** Marca como visto e grava no perfil (some nas próximas vezes, em qualquer aparelho). */
export function marcarAssistente(tela: string) {
  if (assistenteVisto(tela)) return;
  S.profile.meta = { ...S.profile.meta, assistentes: { ...S.profile.meta?.assistentes, [tela]: true } };
  profileChanged(); commit();
}

export function MiniAssistente({ tela, passos, concluir = "Concluir", onFim, onManual }: {
  tela: string; passos: PassoMini[]; concluir?: string;
  /** roda no último passo; se der erro, o assistente fica aberto e mostra a mensagem */
  onFim: () => void | Promise<void>;
  /** "Fazer manual": segue para o formulário de sempre */
  onManual: () => void;
}) {
  const [i, setI] = useState(0), [busy, setBusy] = useState(false);
  const n = passos.length, step = Math.min(i, n - 1), P = passos[step], Tela = P.Tela, ultimo = step === n - 1;
  const pct = Math.round(((step + 1) / n) * 100);
  const manual = () => { marcarAssistente(tela); onManual(); };
  const fim = async () => {
    setBusy(true);
    try { await onFim(); marcarAssistente(tela); }
    catch (e: any) { toast(e?.message || "Não deu para salvar agora. Tente de novo."); }
    finally { setBusy(false); }
  };
  return <div class="pp mini-ass" data-assistente={tela}>
    <div class="pp-top"><button type="button" class="btn" disabled={step === 0} onClick={() => setI(step - 1)} aria-label="Voltar um passo"><Icon id="back" />Voltar</button>
      <span class="small sub num" aria-hidden="true">{step + 1} de {n}</span>
      <button type="button" class="btn ghost" disabled={busy} onClick={manual}>Fazer manual</button></div>
    <div class="pp-bar" role="progressbar" aria-label="Progresso do assistente" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={`width:${pct}%`} /></div>
    <h1 class="pp-q">{P.title}</h1>{P.sub && <p class="sub pp-sub">{P.sub}</p>}
    <div class="pp-body"><Tela /></div>
    <div class="pp-cta">{ultimo
      ? <button type="button" class="btn pri lg full" disabled={busy || P.ok === false} onClick={fim}><Icon id="check" />{busy ? "Salvando…" : concluir}</button>
      : <button type="button" class="btn pri lg full" disabled={P.ok === false} onClick={() => setI(step + 1)}>Continuar<Icon id="arrow" /></button>}</div>
  </div>;
}
