export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  ASSETS: Fetcher;
  APP_VERSION: string;
  MCP_TOKEN?: string;          // só bootstrap LOCAL (DEV_NO_AUTH + localhost) → usuário de dev "dev". Ignorado em produção.
  OWNER_SETUP_CODE?: string;   // #54: código de uso único da PRIMEIRA conta (owner), ≥ 16 caracteres — `wrangler secret put`. Pode apagar depois.
  OWNER_EMAIL?: string;        // #62: e-mail do dono. O owner só nasce com o código E este e-mail (`wrangler secret put`; nunca no git). Contato do controlador em #privacidade.
  AUTH_PEPPER?: string;        // #54: segredo do HMAC do IP no limite de /auth/* (opcional, recomendado) — `wrangler secret put`
  TURNSTILE_SITE_KEY?: string; // #56: chave pública do Turnstile (vars). Sem ela e sem o secret, o Turnstile fica desligado (dev e testes).
  TURNSTILE_SECRET?: string;   // #56: secret do Turnstile (`wrangler secret put`), validado no servidor (siteverify)
  MAX_USERS?: string;          // #54: teto de contas (padrão 10; nunca passa de 10)
  ENVIRONMENT?: string;        // #58: "staging" só no env.staging do wrangler.jsonc (a faixa "AMBIENTE DE TESTES"); ausente em produção. #56: só "development" | "local" | "test" relaxam AUTH_PEPPER e CF-Connecting-IP
  DEV_TUNNEL?: string;         // #58: "1" só no `npm run dev:tunnel` (túnel https temporário; WebAuthn usa o host do túnel)
  PUBLIC_ORIGIN?: string;      // #58: opcional, origem https fixa do WebAuthn (padrão: o host da requisição)
  DEV_NO_AUTH?: string;        // "1" só em .dev.vars (localhost)
  VAPID_PUBLIC_KEY?: string;   // Web Push (descanso com a tela bloqueada): chave pública, base64url (65 bytes). Sem as duas chaves, o push fica desligado.
  VAPID_PRIVATE_KEY?: string;  // chave privada, base64url (32 bytes) — `wrangler secret put`; gere com `node scripts/gen-vapid.mjs`
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
  /** #62: falta aceitar a versão vigente dos termos ou da privacidade. */
  aceitePendente?: boolean;
}
