export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  ASSETS: Fetcher;
  APP_VERSION: string;
  MCP_TOKEN?: string;          // só bootstrap LOCAL (DEV_NO_AUTH + localhost) → usuário de dev "dev". Ignorado em produção.
  OWNER_SETUP_CODE?: string;   // #54: código de uso único da PRIMEIRA conta (owner), ≥ 16 caracteres — `wrangler secret put`. Pode apagar depois.
  CONTATO_EMAIL?: string;      // #62: e-mail de contato do controlador em #privacidade (separado do OWNER_EMAIL; `wrangler secret put`, nunca no git). Sem ele: "Fale com quem te convidou".
  OWNER_EMAIL?: string;        // #62: e-mail do dono. O owner só nasce com o código E este e-mail (`wrangler secret put`; nunca no git). Contato do controlador em #privacidade.
  AUTH_PEPPER?: string;        // #54: segredo do HMAC do IP no limite de /auth/* (opcional, recomendado) — `wrangler secret put`
  TURNSTILE_SITE_KEY?: string; // #56: chave pública do Turnstile (vars). Sem ela e sem o secret, o Turnstile fica desligado (dev e testes).
  TURNSTILE_SECRET?: string;   // #56: secret do Turnstile (`wrangler secret put`), validado no servidor (siteverify)
  MAX_USERS?: string;          // #165: trava de EMERGÊNCIA que só abaixa o teto da fase ("0" fecha a entrada); sem a var, vale o teto da fase
  ENVIRONMENT?: string;        // #58: "staging" só no env.staging do wrangler.jsonc (a faixa "AMBIENTE DE TESTES"); ausente em produção. #56: só "development" | "local" | "test" relaxam AUTH_PEPPER e CF-Connecting-IP
  DEV_TUNNEL?: string;         // #58: "1" só no `npm run dev:tunnel` (túnel https temporário; WebAuthn usa o host do túnel)
  PUBLIC_ORIGIN?: string;      // #58: opcional, origem https fixa do WebAuthn (padrão: o host da requisição)
  CENARIO_NOME?: string;       // #70: só `npm run dev:cenario` (localhost): nome do cenário de teste; liga o botão "↺ cenário" do app
  CENARIO_CTRL?: string;       // #70: porta (127.0.0.1) em que o dev:cenario escuta o pedido de reset
  DEV_NO_AUTH?: string;        // "1" só em .dev.vars (localhost)
  VAPID_PUBLIC_KEY?: string;   // Web Push (descanso com a tela bloqueada): chave pública, base64url (65 bytes). Sem as duas chaves, o push fica desligado.
  VAPID_PRIVATE_KEY?: string;  // chave privada, base64url (32 bytes) — `wrangler secret put`; gere com `node scripts/gen-vapid.mjs`
  OAUTH_REDIRECT_HOSTS?: string; // #66: allowlist de redirect_uri do OAuth (https, vírgula; "/" no fim = prefixo). Vazia = callback oficial do Claude.
  OPENAI_API_KEY?: string;     // #66: OPCIONAL. Chave do dono (`wrangler secret put`) para o cérebro openai-api (só gerar/ajustar treino). Sem ela, desligado.
  OPENAI_MAX_USD?: string;     // #66: teto de gasto mensal em US$ (0 < teto ≤ 100), contado no D1 (cerebro_gasto). Sem ele, desligado.
  OPENAI_MODEL?: string;       // #66: opcional (padrão gpt-4.1-mini).
  ANTHROPIC_API_KEY?: string;  // #80: OPCIONAL. Chave do dono para estimar porções com o Haiku (2º provedor, depois do Workers AI). Sem ela, desligado.
  ANTHROPIC_MAX_USD?: string;  // #80: teto de gasto mensal em US$ (0 < teto ≤ 100), contado no D1 (cerebro_gasto). Sem ele, desligado.
  KEK_V1?: string;             // #88: chave-mestra (KEK) do cofre de chaves de API, 32 bytes em base64 (`wrangler secret put KEK_V1`). Sem ela, cadastrar chave fica desligado. Rotação: KEK_V2… (ADR-0015).
  VAPID_SUBJECT?: string;      // opcional: mailto:… ou https://… exigido por alguns serviços de push (padrão: mailto:ciclo@example.com)
}

/** Usuário autenticado da requisição. O userId vem SEMPRE daqui (sessão/token), nunca do corpo. */
export interface AuthUser {
  id: string; email: string; name: string | null; role: "owner" | "user"; createdAt: number; onboardingDoneAt: number | null;
  /** Como entrou: sessão (passkey/código), dev local ou token do Claude. */
  via?: "sessao" | "dev" | "mcp";
  /** id público da sessão atual (só quando via === "sessao"). */
  sessionId?: string;
  /** #62: último Face ID nesta sessão (ações sensíveis exigem ≤ 5 min). */
  reauthAt?: number | null;
  /** #62: falta aceitar a versão vigente dos termos ou da privacidade (app e MCP bloqueiam até aceitar). */
  aceitePendente?: boolean;
  /** #81: escopos do token do MCP ("ler" ou "ler escrever"). Ausente = sessão do app ou bootstrap local (tudo). */
  escopo?: string;
}
