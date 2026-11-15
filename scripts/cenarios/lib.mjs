// #70 Peças comuns dos cenários de teste local. Tudo fictício: nomes, e-mails (@dev.localhost / @exemplo.com) e números.
// Um seed recebe `ctx` = { sql(texto) → linhas, api(método, caminho, corpo?) → dados, hoje, agora, dia(n) } e não sabe se roda
// no Chrome de verdade (wrangler dev) ou num D1 falso (teste): as duas pontas implementam o mesmo ctx.
import { createHash, randomUUID } from "node:crypto";
import { CONSENT_VERSAO } from "@ciclo/core";

/** Literal SQL: só texto que o próprio seed escreve (constantes), com aspas dobradas. */
export const lit = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return `'${String(v).replaceAll("'", "''")}'`;
};

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const emailDev = (slug) => `${slug}@dev.localhost`;

/** Cria a conta como o cadastro cria (nome, sobrenome, sexo, termos aceitos), SEM passkey: o localhost entra pelo usuário de dev.
 *  `onboarding`: "pendente" (padrão) ou "concluido". Devolve o id. */
export async function criarConta(ctx, { slug, email, nome, sobrenome, sexo, role = "user", onboarding = "pendente", criadaHa = 0 }) {
  const id = randomUUID(), t = ctx.agora - criadaHa * 86_400_000;
  await ctx.sql(`INSERT INTO user (id, email, created_at, last_seen_at, onboarding_done_at, role, name, sobrenome, sexo)
    VALUES (${lit(id)}, ${lit(email ?? emailDev(slug))}, ${t}, ${ctx.agora}, ${onboarding === "concluido" ? t : "NULL"}, ${lit(role)}, ${lit(nome)}, ${lit(sobrenome)}, ${lit(sexo)});
    INSERT INTO consent (user_id, doc, versao, aceito_em) VALUES (${lit(id)}, 'termos', ${lit(CONSENT_VERSAO.termos)}, ${t}), (${lit(id)}, 'privacidade', ${lit(CONSENT_VERSAO.privacidade)}, ${t})`);
  return id;
}

/** Zera TODAS as tabelas de dados (a das migrations fica). `user` primeiro: o ON DELETE CASCADE leva quase tudo. */
export async function limparTudo(ctx) {
  const linhas = await ctx.sql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
    AND name <> 'd1_migrations' AND name NOT LIKE 'busca\\_%' ESCAPE '\\'`);
  const nomes = linhas.map((r) => r.name).filter((n) => /^[a-z0-9_]+$/.test(n));
  await ctx.sql(["DELETE FROM user", ...nomes.filter((n) => n !== "user").map((n) => `DELETE FROM ${n}`)].join(";\n"));
}

/** Dia de hoje e o de n dias atrás (AAAA-MM-DD), no fuso do app. */
export const hojeSP = (agora = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
export const somarDias = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
export const diaSemana = (iso) => ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(iso + "T12:00:00Z").getUTCDay()];
