// #55/#62 Privacidade e dados (LGPD): termos, privacidade, exportar tudo em JSON, revogar o consentimento (leva a exportar e
// apagar) e apagar a conta (digitando "apagar" + Face ID; imediato e irreversível). Apagar leva junto chaves do Chat, sessões,
// passkeys e arquivos (R2). Regra da #54: o dono não sai enquanto houver outras contas.
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { HttpError, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { comFaceId, erroPasskey } from "../entrar/webauthn.ts";
import { limparNavegador } from "./comum.tsx";

export function SeusDados({ donaComOutras }: { donaComOutras: boolean }) {
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const ok = C.confirmaApagar(txt);

  const apagar = async () => {
    if (!ok || busy) return;
    setErro(""); setBusy(true);
    try {
      await comFaceId(() => api("DELETE", "/api/account", { confirm: "APAGAR" }));
      limparNavegador();
      location.hash = "#entrar"; location.reload();
    } catch (e) {
      setErro(e instanceof HttpError ? e.message : (e as { name?: string })?.name ? erroPasskey(e) : "Sem conexão: nada foi apagado. Tente de novo.");
      setBusy(false);
    }
  };

  return <section class="card conta-sec" aria-labelledby="ct-dd">
    <h2 id="ct-dd">Seus dados</h2>
    <p class="small sub">Baixe tudo o que o app guarda sobre você num arquivo JSON (treinos, comida, diário, perfil; das mídias, só os dados).</p>
    <a class="btn full" href="/api/account/export" download><Icon id="arrow" />Exportar meus dados</a>

    <h3 style="margin-top:8px">Apagar minha conta</h3>
    <p class="small sub">Apaga agora, sem volta: todos os dados, fotos e vídeos, as chaves do Chat, os aparelhos e as passkeys. Pede o Face ID.</p>
    {donaComOutras
      ? <div class="note warn"><Icon id="warn" /><span>Você é o dono do app: apague ou passe as outras contas antes. Enquanto houver outras pessoas, ninguém mais administraria convites e resets.</span></div>
      : <form class="conta-form" onSubmit={(e) => { e.preventDefault(); void apagar(); }}>
        <label class="f" for="ct-apagar">Para confirmar, digite <b>apagar</b></label>
        <input id="ct-apagar" class="input" value={txt} autocomplete="off" autocapitalize="off" spellcheck={false} maxLength={20} onInput={(e) => setTxt(e.currentTarget.value)} />
        {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
        <button type="submit" class="btn danger full" disabled={!ok || busy}>{busy ? "Apagando…" : "Apagar minha conta"}</button>
      </form>}
  </section>;
}

export function PrivacidadeDados({ dona }: { dona: boolean }) {
  const [outras, setOutras] = useState<boolean | null>(null);
  useEffect(() => { if (dona) api<{ people: unknown[] }>("GET", "/api/account/people").then((p) => setOutras(p.people.length > 1)).catch(() => setOutras(true)); }, [dona]);
  return <>
    <section class="card conta-sec" aria-labelledby="ct-lg">
      <h2 id="ct-lg">Termos e privacidade</h2>
      <p class="small sub">O que o app coleta, para quê, por quanto tempo e os seus direitos (LGPD).</p>
      <a class="conta-item" href="#privacidade"><Icon id="book" /><span>Privacidade</span><Icon id="arrow" /></a>
      <a class="conta-item" href="#termos"><Icon id="book" /><span>Termos de uso</span><Icon id="arrow" /></a>
      <h3 style="margin-top:8px">Revogar o consentimento</h3>
      <p class="small sub">O app só funciona com o seu consentimento para o dado de saúde. Revogar = exportar os seus dados e apagar a conta, logo abaixo.</p>
    </section>
    <SeusDados donaComOutras={dona && outras !== false} />
  </>;
}
