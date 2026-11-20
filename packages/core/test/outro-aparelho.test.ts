import { test } from "node:test";
import assert from "node:assert/strict";
import { SITUACOES, detectarPlataforma, ordenarSituacoes, situacaoProvavel } from "../src/index.ts";

test("detecta a plataforma por hint e por User-Agent", () => {
  assert.equal(detectarPlataforma("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120", "Android"), "android");
  assert.equal(detectarPlataforma("Mozilla/5.0 (Linux; Android 14)"), "android");
  assert.equal(detectarPlataforma("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120", "Windows"), "windows");
  assert.equal(detectarPlataforma("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "ios");
  assert.equal(detectarPlataforma("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "macOS"), "mac");
  assert.equal(detectarPlataforma("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", null, 5), "ios");
  assert.equal(detectarPlataforma("Mozilla/5.0 (X11; Linux x86_64)", "Linux"), "outro");
  assert.equal(detectarPlataforma(null, null), "outro");
});

test("a situação provável abre primeiro e nenhuma some", () => {
  assert.equal(situacaoProvavel("android"), "android");
  assert.equal(situacaoProvavel("windows"), "windows");
  assert.equal(situacaoProvavel("outro"), "qr");
  for (const p of ["android", "ios", "mac", "windows", "outro"] as const) {
    const o = ordenarSituacoes(p);
    assert.equal(o[0], situacaoProvavel(p));
    assert.deepEqual([...o].sort(), [...SITUACOES].sort());
    assert.equal(o.length, 7);
  }
  assert.deepEqual(ordenarSituacoes("windows").slice(0, 3), ["windows", "android", "qr"]);
});
