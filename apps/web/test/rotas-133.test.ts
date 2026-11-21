// #133 As telas antigas de conectar redirecionam para Perfil → Sua IA no roteador (antes de pintar), em navegação
// direta e como segunda navegação (hashchange): parse já devolve a rota nova.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonico, parse } from "../src/lib/roteador/index.ts";

test("#conta/chat e #conta/chaves viram #perfil/ia; as outras rotas de Conta ficam", () => {
  for (const h of ["#conta/chat", "#conta/chaves", "#conta/chaves/", "#conta/chat?x=1"]) {
    assert.equal(canonico(h), "#perfil/ia", h);
    assert.deepEqual([parse(h).screen, parse(h).parts], ["perfil", ["ia"]], h);
  }
  for (const h of ["#conta", "#conta/perfil", "#conta/seguranca", "#perfil/ia", "#chat"]) assert.equal(canonico(h), h, h);
});
