// #83 Conta → Segurança: "Entrar em outro aparelho". Texto estático, por situação. A plataforma detectada só decide qual abre primeiro.
import { detectarPlataforma, ordenarSituacoes, type Plataforma, type SituacaoId } from "@ciclo/core";
import { Icon } from "../../lib/ui/index.tsx";

const TEXTOS: Record<SituacaoId, { titulo: string; corpo: string }> = {
  android: { titulo: "Android", corpo: "A passkey fica no Gerenciador de Senhas do Google e sincroniza com o Chrome dos outros aparelhos na mesma conta Google. Entre em Entrar e escolha a passkey salva." },
  windows: { titulo: "Windows", corpo: "No Chrome ou no Edge, o Windows Hello (PIN, rosto ou digital) cria uma passkey deste computador. Se preferir, use o celular pelo QR code." },
  qr: { titulo: "Qualquer computador, usando o celular", corpo: "Em Entrar, escolha “usar um telefone”, leia o QR code com o celular (Android ou iPhone) e confirme lá. Deixe o Bluetooth ligado nos dois aparelhos: o navegador confere que eles estão perto." },
  gerenciador: { titulo: "Gerenciador de senhas multiplataforma", corpo: "Com 1Password, Bitwarden e similares, a passkey salva neles funciona em todos os sistemas em que o gerenciador estiver instalado." },
  chave: { titulo: "Chave de segurança física", corpo: "Opcional: uma chave FIDO2 (como a YubiKey) guarda a passkey e vale em qualquer computador. Guarde-a em lugar seguro." },
  adicionar: { titulo: "Depois de entrar", corpo: "Em Conta → Segurança, use Adicionar passkey neste aparelho. Ele ganha uma passkey própria, com a confirmação recente do Face ID ou equivalente que o app já pede." },
  codigos: { titulo: "Último recurso: códigos de recuperação", corpo: "Guarde os códigos fora do celular (papel ou gerenciador). Cada código vale uma vez." },
};

const CUIDADOS = [
  "Perdeu um aparelho? Apague a passkey dele em Passkeys e encerre a sessão dele em Aparelhos.",
  "Nunca entre por um QR code que outra pessoa mandou. O QR só vale quando aparece na tela que você mesmo abriu.",
  "Computador compartilhado: não salve passkey nele. Use o celular pelo QR code e encerre a sessão no fim.",
];

export function plataformaAtual(): Plataforma {
  const n = navigator as Navigator & { userAgentData?: { platform?: string } };
  return detectarPlataforma(n.userAgent, n.userAgentData?.platform, n.maxTouchPoints);
}

export function OutroAparelho({ plataforma = plataformaAtual() }: { plataforma?: Plataforma }) {
  const ordem = ordenarSituacoes(plataforma);
  return <section class="card conta-sec" aria-labelledby="ct-oa">
    <h2 id="ct-oa">Entrar em outro aparelho</h2>
    <p class="small sub">Sem senha, sem link por e-mail e sem SMS: só passkey ou código de recuperação. Abrimos primeiro o caminho mais provável para este aparelho.</p>
    {ordem.map((id, i) => <details key={id} class="oa-sit" open={i === 0}>
      <summary>{TEXTOS[id].titulo}{i === 0 && <span class="badge acc">mais provável</span>}</summary>
      <p class="small sub">{TEXTOS[id].corpo}</p>
    </details>)}
    <div class="oa-cuidados" role="note">
      <h3><Icon id="warn" />Cuidados</h3>
      <ul class="small">{CUIDADOS.map((c) => <li key={c}>{c}</li>)}</ul>
    </div>
  </section>;
}
