export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  ASSETS: Fetcher;
  APP_VERSION: string;
  MCP_TOKEN?: string;
  ACCESS_TEAM_DOMAIN?: string; // ex.: suaconta.cloudflareaccess.com
  ACCESS_AUD?: string;         // "Application Audience (AUD) Tag" do app no Access
  ALLOWED_EMAILS?: string;     // opcional, separado por vírgula
  DEV_NO_AUTH?: string;        // "1" só em .dev.vars (localhost)
}
