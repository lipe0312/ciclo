export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  ASSETS: Fetcher;
  APP_VERSION: string;
  MCP_TOKEN?: string;          // só bootstrap LOCAL (DEV_NO_AUTH + localhost) → usuário de dev "dev". Ignorado em produção.
  ACCESS_TEAM_DOMAIN?: string; // ex.: suaconta.cloudflareaccess.com
  ACCESS_AUD?: string;         // "Application Audience (AUD) Tag" do app no Access
  ALLOWED_EMAILS?: string;     // produção: e-mails (vírgula) que podem criar/usar conta. Vazio = ninguém (falha fechada)
  DEV_NO_AUTH?: string;        // "1" só em .dev.vars (localhost)
}

/** Usuário autenticado da requisição. O userId vem SEMPRE daqui (sessão/token), nunca do corpo. */
export interface AuthUser { id: string; email: string; createdAt: number; onboardingDoneAt: number | null }
