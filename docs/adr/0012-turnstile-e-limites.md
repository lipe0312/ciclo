# ADR-0012 · Turnstile opcional e limites de abuso no D1
**Status:** aceito (issue #56)

**Contexto:** com cadastro por convite e até 10 contas, o app vira alvo de força bruta no login, robôs no convite e upload gigante. Em `*.workers.dev` não há WAF nem regras de rate limit do painel (exigem domínio próprio), então a defesa fica no código.

**Decisão:**
- **Turnstile (Cloudflare, grátis)** como única dependência de runtime nova, e **externa**: o script `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` é carregado sob demanda só na tela `#entrar`, quando o servidor manda a chave pública. Nada no bundle, nada inline, sem pacote npm. A CSP ganha esse domínio em `script-src` e `frame-src` (e só ele).
- **Opcional:** sem `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET` fica desligado (dev local e testes). Ligado, o Worker valida o token no `siteverify` (com o IP) e **falha fechado** (sem token, token inválido ou serviço fora do ar → 403). Pede sempre na criação de conta por convite e, depois de 3 falhas seguidas do IP, para começar login, registro ou recuperação.
- **Contadores no D1, não no binding `ratelimits`:** o binding só aceita janelas de 10 s ou 60 s e conta por local (aproximado). O bloqueio de 15 min, os limites por hora e os testes determinísticos pedem contador exato. O custo é uma escrita a mais por tentativa ou escrita (cabe com folga nas 100 mil/dia).
- IP só como HMAC com `AUTH_PEPPER`, obrigatório em produção (`auth_rate_limit`, `auth_falhas`); IPv6 por /64. `uso_dia` guarda só números do app inteiro.
- O limite global conta só falhas de verificação e, no teto, deixa passar quem tem Turnstile válido: o atacante não tranca o dono fora.

**Privacidade:** o Turnstile roda no navegador e a Cloudflare vê sinais do aparelho (como em qualquer página atrás dela). Só aparece nos momentos acima.

**Alternativas descartadas:** hCaptcha/reCAPTCHA (terceiro fora da Cloudflare, rastreio), binding `ratelimits` sozinho (janelas curtas demais), Durable Object (classe e migração a mais para 10 contas).
