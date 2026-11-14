// #62 LGPD mínima: #privacidade e #termos, abertos sem sessão (o convite linka para cá antes do cadastro).
// O controlador (nome do dono e e-mail de contato) vem do servidor (/auth/legal; o e-mail é o secret OWNER_EMAIL, nunca do repositório).
// Os textos também aparecem dentro da etapa de aceite do cadastro (Termos/Privacidade abaixo).
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import type { Route } from "../../lib/roteador/index.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import "../entrar/entrar.css";

interface Legal { controlador: { nome: string | null; email: string | null }; versoes: Record<C.DocLegal, string> }
const dataBR = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

export function Termos() {
  return <div class="legal-txt">
    <p class="tiny sub">Versão de {dataBR(C.CONSENT_VERSAO.termos)}</p>
    <ul>
      <li><b>Uso pessoal.</b> O Ciclo é um app de treino para uso pessoal, só para quem foi convidado.</li>
      <li><b>Não é aconselhamento médico.</b> O app sugere treino e registra hábitos, mas não diagnostica nem trata. Dor forte, que não passa, ou qualquer condição de saúde: procure um profissional.</li>
      <li><b>O acesso por convite pode ser revogado</b> por quem administra o app.</li>
      <li><b>Não há garantia de disponibilidade.</b> O app pode ficar fora do ar ou mudar. Exporte seus dados quando quiser, em Conta → Privacidade e dados.</li>
    </ul>
  </div>;
}

export function Privacidade({ controlador }: { controlador?: Legal["controlador"] | null }) {
  const nome = controlador?.nome ?? "quem administra este app";
  return <div class="legal-txt">
    <p class="tiny sub">Versão de {dataBR(C.CONSENT_VERSAO.privacidade)}</p>
    <h3>Controlador</h3>
    <p>{nome}{controlador?.email ? <> · contato: <a class="link44" href={`mailto:${controlador.email}`}>{controlador.email}</a></> : <> · contato: fale com quem te convidou.</>}</p>
    <h3>Dados coletados</h3>
    <ul>
      <li><b>Cadastro:</b> nome, sobrenome, e-mail, sexo e nascimento.</li>
      <li><b>Saúde (dado sensível):</b> peso, medidas, dores, exames, alimentação e treinos.</li>
      <li><b>Técnicos:</b> aparelho, IP só em hash (nunca o IP) e sessões.</li>
    </ul>
    <h3>Finalidade</h3>
    <p>Montar e acompanhar o seu treino. Sem venda, sem anúncio, sem compartilhamento.</p>
    <h3>Base legal</h3>
    <p>Consentimento específico e destacado para o dado de saúde (LGPD, art. 11, I), dado no cadastro.</p>
    <h3>Operadores</h3>
    <p>Cloudflare (hospedagem) e, se você conectar o Chat, a Anthropic (pela sua própria conta).</p>
    <h3>Retenção</h3>
    <p>Enquanto a conta existir. Apagar a conta remove tudo em até 30 dias, inclusive backups.</p>
    <h3>Seus direitos (art. 18)</h3>
    <p>Acesso, correção, portabilidade e exclusão, com botões na própria tela (Conta → Perfil e Conta → Privacidade e dados), e revogação do consentimento, que leva a exportar e apagar a conta.</p>
    <h3>Segurança</h3>
    <p>Entrada por passkey (Face ID), sem senha. Os dados ficam separados por conta: ninguém vê os dados de outra pessoa.</p>
  </div>;
}

export default function Legal({ route }: { route: Route }) {
  const doc: C.DocLegal = route.screen === "termos" ? "termos" : "privacidade";
  const [legal, setLegal] = useState<Legal | null>(null);
  useEffect(() => { if (SERVER) api<Legal>("GET", "/auth/legal").then(setLegal).catch(() => setLegal(null)); }, []);
  const voltar = () => { if (history.length > 1) history.back(); else location.hash = "#entrar"; };
  return <div class="entrar legal">
    <div class="brand entrar-brand"><span class="logo"><Icon id="cycle" /></span>Ciclo</div>
    <h1>{doc === "termos" ? "Termos de uso" : "Privacidade"}</h1>
    {doc === "termos" ? <Termos /> : <Privacidade controlador={legal?.controlador} />}
    <nav class="legal-nav" aria-label="Documentos">
      <a class="btn ghost" href={doc === "termos" ? "#privacidade" : "#termos"}>{doc === "termos" ? "Ler a privacidade" : "Ler os termos"}</a>
      <button type="button" class="btn" onClick={voltar}><Icon id="back" />Voltar</button>
    </nav>
  </div>;
}
