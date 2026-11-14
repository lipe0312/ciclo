// #70 Cenário `vazio`: a conta acabou de nascer pelo cadastro (nome, sobrenome, sexo, termos aceitos) e mais nada:
// sem perfil, academia, treino, comida ou dor. É exatamente o estado logo depois do 1º acesso (Primeiros passos pendente).
import { criarConta } from "./lib.mjs";

export const slug = "cenario-vazio";
export const descricao = "Conta recém-criada: só nome, sobrenome, sexo e termos. Sem perfil, academia, treino, comida ou dor.";
export const tem = ["conta de 'Ana Teste' (feminino)", "Primeiros passos pendente", "nada mais"];

export async function seed(ctx) {
  await criarConta(ctx, { slug, nome: "Ana", sobrenome: "Teste", sexo: "feminino" });
}
