# ADR-0011 · Conta própria com passkey, convite e códigos de recuperação
**Status:** aceito (issue #54, decisão do dono: opção A)

**Decisão:**
- **Login = passkey (WebAuthn)**, sem senha e sem e-mail. A verificação roda no Worker com **WebCrypto**, sem dependência: ES256 (P-256, assinatura DER → r||s) e RS256. O core (`packages/core/src/conta.ts`) decodifica CBOR, `authenticatorData`, chave COSE → JWK e confere `clientDataJSON`; o Worker (`auth-conta.ts`) confere desafio de uso único (5 min, tabela `auth_challenge`), origem, hash do rpId, flags UP+UV e contador, e verifica a assinatura. Atestado: `none` (não amarramos fabricante).
- **Conta só por convite** (código de 80 bits, uso único, 7 dias, só SHA-256 no D1) criado pelo `owner`. A **1ª conta** nasce com o secret `OWNER_SETUP_CODE`; o bootstrap fecha quando existe owner ou qualquer passkey (índice único parcial garante um owner só). Se quem faz o bootstrap já está logado (Access), a conta dele vira owner com os dados.
- **Teto de 10 contas**: `MAX_USERS` da config, limitado a 10 no código; a criação é um `INSERT … SELECT … WHERE (SELECT COUNT(*) FROM user) < max` dentro do mesmo batch que gasta o convite (transação). Vale também para contas criadas pelo Access.
- **Sessão**: cookie `__Host-ciclo` (`HttpOnly; Secure; SameSite=Lax; Path=/`), 90 dias, renovada no uso (no máx. 1×/dia), só o SHA-256 no D1. "Sair de todos" apaga todas as sessões da conta.
- **Recuperação**: 8 códigos (50 bits, uso único, só hash); queimar o código e criar a sessão é um batch só.
- **Poder do owner sobre outra conta (reset de acesso)**: o owner pode resetar o acesso de qualquer outra pessoa. Na hora, **todas as sessões dela caem e todos os tokens do Claude dela são revogados**; quem usar o convite novo troca as passkeys e os códigos de recuperação e **passa a controlar a conta com os dados dela** (o owner não lê os dados pelo app, mas quem recebe o convite sim). Ou seja: a pessoa confia no owner. O reset é a única forma de o owner agir sobre outra conta; os endpoints de pessoas nunca devolvem dado de saúde.
- **Owner não sai sozinho**: `DELETE /api/account` do owner é recusado (409 `dona_com_contas`) enquanto houver outras contas. Depois do 1º acesso, **apague o secret `OWNER_SETUP_CODE`** (`wrangler secret delete`): o bootstrap já fecha quando existe owner ou passkey, mas sem o secret ele não reabre nem num banco esvaziado.
- **Segredos fora do banco**: o desafio WebAuthn em andamento guarda só o hash do convite; o limite por IP guarda o HMAC do IP com o secret `AUTH_PEPPER` (recomendado; sem ele usa o `OWNER_SETUP_CODE`). Erro de `UNIQUE` na criação não diz se um e-mail já tem conta.
- **Verificação estrita**: RS256 só com expoente 65537 e ≥ 2048 bits; assinatura ES256 só em DER canônico.
- **Transição**: enquanto `ACCESS_*` existirem, `/api` aceita a sessão própria **ou** o JWT do Access (mesma verificação da ADR-0007). Sem os secrets, só a sessão própria.
- **Abuso**: `/auth/*` limitado por IP (HMAC, nunca o IP puro) a 30 POST/10 min. Proteções mais amplas ficam na #56.

**Pendências (follow-up):** reautenticação (step-up, Face ID de novo com `userVerification: required`) em ações sensíveis (apagar conta, gerar token do Claude, criar convite, gerar códigos); limite **global** para `/auth/recover` e para o setup (além do por IP), na #56.

**Por que não `@simplewebauthn/server`:** seria a 1ª dependência de runtime do Worker; ES256/RS256 com WebCrypto cabe em ~250 linhas testadas com um autenticador falso (`packages/core/test/fake-autenticador.ts`).

**Contrato:** `POST /auth/login/options|login|register/options|register|recover|logout`, `GET /auth/status`; `GET /api/account/devices`, `DELETE /api/account/sessions/:id`, `POST /api/account/logout-all`, `DELETE /api/account/passkeys/:id`, `POST /api/account/recovery-codes`; owner: `GET /api/account/people`, `POST /api/account/invites`, `DELETE /api/account/invites/:id`, `POST /api/account/people/:id/reset`. 401 de `/api` traz `{"code":"entrar"}` e o app vai para `#entrar?volta=<rota>`.
