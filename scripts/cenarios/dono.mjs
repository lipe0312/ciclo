// #70 Cenário `dono`: o `semi` com papel de dono, 2 convites (1 usado, 1 pendente) e 3 de 10 vagas usadas (dono + 2 contas).
import { criarConta, lit, sha256 } from "./lib.mjs";
import { criarSemi } from "./semi.mjs";
import { randomUUID } from "node:crypto";

export const slug = "cenario-dono";
export const descricao = "O semi + papel de dono, 2 convites (1 usado, 1 pendente) e 3 de 10 vagas usadas.";
export const tem = ["tudo do semi (conta de 'Dona Teste')", "papel de dono", "convite usado por Caio Teste", "convite pendente para convidada@exemplo.com", "3 de 10 vagas usadas"];

export async function seed(ctx) {
  const donoId = await criarSemi(ctx, { slug, conta: { nome: "Dona", sobrenome: "Teste", role: "owner" } });
  const caio = await criarConta(ctx, { slug: "cenario-caio", nome: "Caio", sobrenome: "Teste", sexo: "masculino", onboarding: "concluido", criadaHa: 5 });
  await criarConta(ctx, { slug: "cenario-dani", nome: "Dani", sobrenome: "Teste", sexo: "nao_informado", criadaHa: 2 });
  const agora = ctx.agora, dia = 86_400_000;
  const convite = (cod, email, nome, extra) => `INSERT INTO invites (code_hash, id, created_by, email, nome, created_at, expires_at, used_by, used_at)
    VALUES (${lit(sha256("inv:" + cod))}, ${lit(randomUUID())}, ${lit(donoId)}, ${lit(email)}, ${lit(nome)}, ${extra.criado}, ${extra.vence}, ${lit(extra.por ?? null)}, ${lit(extra.em ?? null)})`;
  await ctx.sql([
    convite("codigo-ficticio-usado-0001", "caio@exemplo.com", "Caio", { criado: agora - 5 * dia, vence: agora + 2 * dia, por: caio, em: agora - 5 * dia }),
    convite("codigo-ficticio-pendente-0002", "convidada@exemplo.com", "Convidada", { criado: agora - dia, vence: agora + 6 * dia }),
  ].join(";\n"));
}
