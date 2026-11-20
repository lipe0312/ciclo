# Entrar em outro aparelho (#83)

Texto da seção em Conta → Segurança (`apps/web/src/screens/conta/outro-aparelho.tsx`). A plataforma detectada
(`packages/core/src/outro-aparelho.ts`) só decide qual situação abre primeiro; todas aparecem. Sem senha, link mágico nem SMS.

## Fontes (documentação pública; reconferir antes de mudar o texto, pois os produtos mudam)
- Google: "Entre com passkeys" / Gerenciador de Senhas do Google, sincronização pela conta Google no Android e no Chrome. https://support.google.com/accounts/answer/13548313
- Microsoft: passkeys no Windows, Windows Hello e uso de passkey de outro dispositivo. https://learn.microsoft.com/windows/security/identity-protection/passkeys/
- Apple: passkeys e Chaves do iCloud (iPhone, iPad e Mac). https://support.apple.com/102195
- FIDO Alliance: autenticação entre dispositivos (QR + Bluetooth, "hybrid transport" do CTAP 2.2) e chaves de segurança. https://fidoalliance.org/passkeys/
- Bitwarden / 1Password: gerenciadores com passkeys em várias plataformas. https://bitwarden.com/help/storing-passkeys/ · https://support.1password.com/passkeys/

Observação: estas fontes foram listadas sem leitura online na hora de escrever (sem acesso à rede neste fluxo); o dono confere os links.

## Fora do escopo
- Nome do aparelho/autenticador por AAGUID na lista de passkeys: o AAGUID não é gravado hoje (a tabela de passkeys não tem a coluna), e gravar exige migration e mexer no fluxo de registro. Fica para issue própria.
