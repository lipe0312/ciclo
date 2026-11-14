import { test } from "node:test";
import assert from "node:assert/strict";
import { TELAS, TELAS_ABA, TELAS_MAIS, caminhoAteHoje, voltarDe } from "../src/index.ts";

// Uma amostra de cada forma de rota que o app abre (#tela/parte/parte). Dados fictícios.
const ROTAS: [string, string[]][] = [
  ["hoje", []], ["treino", []], ["treino", ["exercicios"]], ["treino", ["exercicio", "Face_Pull"]], ["treino", ["historico"]],
  ["treino", ["cardio"]], ["treino", ["ativo", "2"]], ["semana", []], ["semana", ["dia", "2026-11-12"]],
  ["diario", []], ["diario", ["exames"]], ["diario", ["resumo"]], ["diario", ["treinar"]], ["diario", ["checkout", "2026-11-13"]],
  ["comida", []], ["chat", []], ["claude", []], ["corpo", []], ["academias", []], ["academias", ["novo"]],
  ["academias", ["lugar-1"]], ["academias", ["lugar-1", "editar"]], ["academias", ["lugar-1", "aparelho", "supino"]],
  ["perfil", []], ["perfil", ["objetivo"]], ["conta", []], ["vida", []], ["mais", []], ["primeiros-passos", []],
  ["primeiros-passos", ["3"]], ["entrar", []], ["tela-que-nao-existe", ["x"]],
];

test("toda rota tem um caminho de volta para a Home", () => {
  for (const [screen, parts] of ROTAS) {
    const c = caminhoAteHoje(screen, parts);
    assert.ok(c.length <= 4, `${screen}/${parts.join("/")} leva ${c.length} passos`);
    const fim = c.length ? c[c.length - 1] : { screen, parts };
    assert.equal(fim.screen, "hoje", `${screen}/${parts.join("/")} não chega na Home`);
    assert.deepEqual(fim.parts, []);
  }
  for (const t of TELAS) assert.equal(caminhoAteHoje(t, []).at(-1)?.screen ?? t, "hoje", t);
});

test("a Home não tem voltar; as outras sempre têm destino com nome", () => {
  assert.equal(voltarDe("hoje", []), null);
  for (const [screen, parts] of ROTAS) {
    if (screen === "hoje") continue;
    const v = voltarDe(screen, parts);
    assert.ok(v && v.nm.length > 0, `${screen} sem voltar`);
  }
});

test("destinos previsíveis: sobe um nível, não volta no histórico", () => {
  assert.deepEqual(voltarDe("semana", ["dia", "2026-11-12"]), { screen: "semana", parts: [], nm: "Semana" });
  assert.deepEqual(voltarDe("semana", []), { screen: "hoje", parts: [], nm: "Hoje" });
  assert.deepEqual(voltarDe("treino", ["exercicio", "Face_Pull"]), { screen: "treino", parts: ["exercicios"], nm: "Exercícios" });
  assert.deepEqual(voltarDe("treino", ["ativo", "0"]), { screen: "treino", parts: [], nm: "Treino" });
  assert.deepEqual(voltarDe("academias", ["lugar-1", "aparelho", "supino"]), { screen: "academias", parts: ["lugar-1"], nm: "Lugar" });
  assert.deepEqual(voltarDe("academias", ["lugar-1", "editar"]), { screen: "academias", parts: ["lugar-1"], nm: "Lugar" });
  assert.deepEqual(voltarDe("academias", ["novo"]), { screen: "academias", parts: [], nm: "Academias" });
  assert.deepEqual(voltarDe("perfil", ["objetivo"]), { screen: "perfil", parts: [], nm: "Perfil" });
  assert.deepEqual(voltarDe("corpo", []), { screen: "mais", parts: [], nm: "Mais" });
  assert.deepEqual(voltarDe("mais", []), { screen: "hoje", parts: [], nm: "Hoje" });
  assert.deepEqual(voltarDe("primeiros-passos", ["2"]), { screen: "hoje", parts: [], nm: "Hoje" });
});

test("abas e Mais: no máximo 5 abas, e a aba de conversa se chama Chat", () => {
  assert.ok(TELAS_ABA.length <= 5);
  assert.ok((TELAS_ABA as readonly string[]).includes("chat") && !(TELAS_ABA as readonly string[]).includes("claude"));
  for (const t of [...TELAS_ABA, ...TELAS_MAIS]) assert.ok(TELAS.includes(t), t);
});
