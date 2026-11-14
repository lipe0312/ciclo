// Códigos de recuperação: aparecem UMA vez (na criação da conta ou ao gerar novos). Usado em #entrar e em Conta.
import { useState } from "preact/hooks";
import { Icon } from "../../lib/ui/index.tsx";

export function Codigos({ codigos, onOk, okLabel = "Já guardei" }: { codigos: string[]; onOk: () => void; okLabel?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(codigos.join("\n")); setCopiado(true); } catch { setCopiado(false); }
  };
  return <div class="card hl">
    <p class="kicker">Códigos de recuperação</p>
    <h2 style="margin:4px 0 8px">Guarde estes 8 códigos</h2>
    <p class="small sub">Se perder o aparelho, cada código entra uma vez. Eles não aparecem de novo: salve no gerenciador de senhas ou imprima.</p>
    <ul class="codigos" aria-label="Códigos de recuperação">{codigos.map((c) => <li key={c}>{c}</li>)}</ul>
    <div class="row wrapx" style="gap:8px">
      <button type="button" class="btn" onClick={copiar}><Icon id={copiado ? "check" : "edit"} />{copiado ? "Copiados" : "Copiar códigos"}</button>
      <button type="button" class="btn pri" onClick={onOk}>{okLabel}</button>
    </div>
  </div>;
}
