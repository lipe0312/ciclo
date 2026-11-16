// #80 "Faltam X g" com variedade: ≥ 3 fontes diferentes na semana, sem repetir carne/frango/whey todo dia, respeitando o
// que a pessoa evita e o que já comeu. Fictício.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALIMENTO_BY_KEY } from "../src/alimentos.ts";
import { faltaHojeVariada } from "../src/alimentos-variedade.ts";

test("#80 faltaHoje com variedade: ≥ 3 fontes diferentes na semana, não repete carne/frango/whey todo dia, respeita o que evitar e o já comido", () => {
  const meta = { kcal: 2650, protein: 150 }, totais = { kcal: 790, prot: 52 }; // o caso real: faltam 98 g
  const base = [ALIMENTO_BY_KEY.carne, ALIMENTO_BY_KEY.frango, ALIMENTO_BY_KEY.whey];
  const dias = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
  const semana = dias.map((dia) => faltaHojeVariada(meta, totais, base, { dia }));
  const fontes = new Set(semana.flatMap((f) => f.sugestoes.flatMap((s) => s.itens.map((i) => i.key))));
  assert.ok(fontes.size >= 3, `fontes na semana: ${[...fontes]}`);
  const PESADAS = new Set(["carne", "frango", "whey"]);
  const soPesadas = semana.filter((f) => f.sugestoes[0].itens.every((i) => PESADAS.has(i.key))).length;
  assert.ok(soPesadas < 7, "carne/frango/whey não em todo dia");
  assert.ok(new Set(semana.map((f) => f.sugestoes[0].texto)).size >= 3, "a combinação muda ao longo da semana");
  for (const f of semana) for (const s of f.sugestoes) assert.ok(s.prot >= 98 * 0.7, s.texto);
  // preferências: o que a pessoa evita nunca aparece; o que já comeu hoje vai para o fim da fila
  for (const dia of dias) {
    const f = faltaHojeVariada(meta, totais, base, { dia, evitar: ["atum", "ovo"] });
    assert.ok(f.sugestoes.every((s) => s.itens.every((i) => i.key !== "atum" && i.key !== "ovo")), dia);
    const g = faltaHojeVariada(meta, totais, base, { dia, comidos: ["tilapia", "frango"] });
    assert.ok(g.sugestoes[0].itens.every((i) => i.key !== "tilapia" && i.key !== "frango"), `${dia}: ${g.sugestoes[0].texto}`);
  }
  // sem dia (o MCP de hoje): duas carnes "pesadas" juntas deixam de ser a primeira opção
  const mcp = faltaHojeVariada(meta, totais, base);
  assert.ok(!mcp.sugestoes[0].itens.every((i) => PESADAS.has(i.key)) || mcp.sugestoes[0].itens.length === 1, mcp.sugestoes[0].texto);
});
