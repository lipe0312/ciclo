// #55 Seus dados (LGPD): exportar tudo em JSON e apagar a conta (digitando "apagar"; imediato e irreversível).
// Apagar leva junto chaves do Claude, sessões, passkeys e arquivos (R2). Regra da #54: a dona não sai enquanto houver outras contas.
import { useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { HttpError, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";

/** Some tudo o que o app guardou neste navegador (fila offline, caches de tela, preferências). A origem é só do app. */
function limparNavegador() {
  try { localStorage.clear(); } catch { /* sem storage */ }
  try { sessionStorage.clear(); } catch { /* sem storage */ }
}

export function SeusDados({ donaComOutras }: { donaComOutras: boolean }) {
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const ok = C.confirmaApagar(txt);

  const apagar = async () => {
    if (!ok || busy) return;
    setErro(""); setBusy(true);
    try {
      await api("DELETE", "/api/account", { confirm: "APAGAR" });
      limparNavegador();
      location.hash = "#entrar"; location.reload();
    } catch (e) {
      setErro(e instanceof HttpError ? e.message : "Sem conexão: nada foi apagado. Tente de novo.");
      setBusy(false);
    }
  };

  return <section class="card conta-sec" aria-labelledby="ct-dd">
    <h2 id="ct-dd">Seus dados</h2>
    <p class="small sub">Baixe tudo o que o app guarda sobre você num arquivo JSON (treinos, comida, diário, perfil; das mídias, só os dados).</p>
    <a class="btn full" href="/api/account/export" download><Icon id="arrow" />Exportar meus dados</a>

    <h3 style="margin-top:8px">Apagar minha conta</h3>
    <p class="small sub">Apaga agora, sem volta: todos os dados, fotos e vídeos, as chaves do Claude, os aparelhos e as passkeys.</p>
    {donaComOutras
      ? <div class="note warn"><Icon id="warn" /><span>Você é a dona do app: apague ou passe as outras contas antes. Enquanto houver outras pessoas, ninguém mais administraria convites e resets.</span></div>
      : <form class="conta-form" onSubmit={(e) => { e.preventDefault(); apagar(); }}>
        <label class="f" for="ct-apagar">Para confirmar, digite <b>apagar</b></label>
        <input id="ct-apagar" class="input" value={txt} autocomplete="off" autocapitalize="off" spellcheck={false} maxLength={20} onInput={(e) => setTxt(e.currentTarget.value)} />
        {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
        <button type="submit" class="btn danger full" disabled={!ok || busy}>{busy ? "Apagando…" : "Apagar minha conta"}</button>
      </form>}
  </section>;
}
