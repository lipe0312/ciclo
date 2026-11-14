// #70 Botão "↺ cenário": só localhost; o reset apaga o cache do app mas deixa o tema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chavesDoCiclo, ehLocalhost } from "../src/lib/cenario/regras.ts";

test("ehLocalhost: só localhost e 127.0.0.1", () => {
  for (const h of ["localhost", "127.0.0.1"]) assert.equal(ehLocalhost(h), true);
  for (const h of ["ciclo.exemplo.workers.dev", "localhost.evil.com", "192.168.0.10", ""]) assert.equal(ehLocalhost(h), false, h);
});

test("chavesDoCiclo: limpa o que é do app e preserva o tema e o que é de outros", () => {
  assert.deepEqual(chavesDoCiclo(["ciclo:pp", "ciclo:theme", "ciclo:state", "outra", "ciclo:fila"]), ["ciclo:pp", "ciclo:state", "ciclo:fila"]);
});
