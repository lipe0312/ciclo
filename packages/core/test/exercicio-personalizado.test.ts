// #107 Exercício personalizado por conta: URL do YouTube, validação dos campos e hidratação no treino do dia.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, LIMITE_PERSONALIZADOS, ehIdPersonalizado, hydrate, novoIdPersonalizado, normalizarYoutube, validarExercicioPersonalizado } from "../src/index.ts";
import type { DayInput, ExercicioPersonalizado } from "../src/index.ts";

const V = "dQw4w9WgXcQ";

test("normalizarYoutube aceita watch, youtu.be e shorts e devolve o link canônico", () => {
  const can = `https://www.youtube.com/watch?v=${V}`;
  assert.equal(normalizarYoutube(`https://www.youtube.com/watch?v=${V}`), can);
  assert.equal(normalizarYoutube(`https://youtube.com/watch?v=${V}&t=42s`), can);
  assert.equal(normalizarYoutube(`https://m.youtube.com/watch?feature=share&v=${V}`), can);
  assert.equal(normalizarYoutube(`https://youtu.be/${V}`), can);
  assert.equal(normalizarYoutube(`https://youtu.be/${V}?si=abc`), can);
  assert.equal(normalizarYoutube(`https://www.youtube.com/shorts/${V}`), can);
  assert.equal(normalizarYoutube(`  https://www.youtube.com/shorts/${V}?feature=share  `), can);
});

test("normalizarYoutube recusa javascript:, outro domínio, domínio parecido e formatos fora da lista", () => {
  for (const u of [
    "javascript:alert(1)", `javascript://www.youtube.com/watch?v=${V}`, `data:text/html,https://youtu.be/${V}`,
    `https://youtube.com.evil.com/watch?v=${V}`, `https://evil.com/watch?v=${V}`, `https://www.youtube.com.evil.com/shorts/${V}`,
    `https://evilyoutube.com/watch?v=${V}`, `https://youtu.be.evil.com/${V}`, `https://evil.com/?u=https://youtu.be/${V}`,
    `http://www.youtube.com/watch?v=${V}`, `https://user:pw@www.youtube.com/watch?v=${V}`, `https://www.youtube.com:8443/watch?v=${V}`,
    `https://www.youtube.com/embed/${V}`, `https://www.youtube.com/watch?v=curto`, `https://www.youtube.com/watch?v=${V}"><script>`,
    `https://www.youtube.com/shorts/${V}/extra`, `https://youtu.be/`, "", "não é url", 42, null,
  ]) assert.equal(normalizarYoutube(u), null, String(u));
});

test("validarExercicioPersonalizado: campos no enum, limites de tamanho e vídeo normalizado", () => {
  const ok = validarExercicioPersonalizado({ nome: "  Elevação lateral no banco 30°  ", musculo: "ombro", aparelho: "halteres", descricao: "Peito no banco inclinado, sobe os halteres até a linha do ombro.", videoUrl: `https://youtu.be/${V}` });
  assert.ok(ok.ok);
  assert.equal(ok.value.nome, "Elevação lateral no banco 30°");
  assert.equal(ok.value.videoUrl, `https://www.youtube.com/watch?v=${V}`);
  const semVideo = validarExercicioPersonalizado({ nome: "Prancha com toque", musculo: "core", aparelho: null, descricao: "Prancha alta tocando o ombro oposto." });
  assert.ok(semVideo.ok); assert.equal(semVideo.value.videoUrl, null); assert.equal(semVideo.value.aparelho, null);

  const ruins: [Record<string, unknown>, string][] = [
    [{ nome: "x", musculo: "ombro", descricao: "ok" }, "nome"],
    [{ nome: "Ok nome", musculo: "pescoco", descricao: "ok" }, "musculo"],
    [{ nome: "Ok nome", musculo: "ombro", aparelho: "foguete", descricao: "ok" }, "aparelho"],
    [{ nome: "Ok nome", musculo: "ombro", descricao: "a".repeat(601) }, "descricao"],
    [{ nome: "Ok nome", musculo: "ombro", descricao: "" }, "descricao"],
    [{ nome: "Ok nome", musculo: "ombro", descricao: "ok", videoUrl: "javascript:alert(1)" }, "videoUrl"],
    [{ nome: "Ok nome", musculo: "ombro", descricao: "ok", videoUrl: `https://youtube.com.evil.com/watch?v=${V}` }, "videoUrl"],
  ];
  for (const [inp, campo] of ruins) {
    const r = validarExercicioPersonalizado(inp);
    assert.ok(!r.ok, campo); assert.ok(r.errors.some((e) => e.startsWith(campo)), `${campo}: ${r.errors.join("; ")}`);
  }
  // parcial (edição): só o que veio
  const p = validarExercicioPersonalizado({ descricao: "Nova descrição" }, true);
  assert.ok(p.ok); assert.deepEqual(Object.keys(p.value), ["descricao"]);
  const limpa = validarExercicioPersonalizado({ videoUrl: "" }, true);
  assert.ok(limpa.ok); assert.equal(limpa.value.videoUrl, null);
});

test("IDs personalizados: prefixo cus_, formato fixo e nunca colidem com o catálogo", () => {
  const id = novoIdPersonalizado();
  assert.match(id, /^cus_[a-z0-9]{12}$/);
  assert.ok(ehIdPersonalizado(id));
  assert.ok(!ehIdPersonalizado("cus_"));
  assert.ok(!ehIdPersonalizado("cus_../../x"));
  assert.ok(!EXERCISES.some((e) => ehIdPersonalizado(e.id)));
  assert.equal(LIMITE_PERSONALIZADOS, 200);
});

const inp = { equipment: ["halteres", "banco"], pains: [], minutes: 60, priorities: [], targets: {}, done: {}, freq: {} } as unknown as DayInput;
const meu: ExercicioPersonalizado = { id: "cus_abc123def456", nome: "Elevação Y no banco", musculo: "ombro", aparelho: "halteres", descricao: "Deitado de bruços.", videoUrl: null, criadoPor: "ia" };

test("hydrate: exercício personalizado da conta vira item com selo; o de outra conta é recusado mesmo com nome", () => {
  const { items, issues } = hydrate([{ id: meu.id, sets: 3 }], inp, { [meu.id]: meu });
  assert.equal(issues.filter((i) => i.severity === "erro").length, 0);
  assert.equal(items[0].exerciseId, meu.id); assert.equal(items[0].nm, meu.nome); assert.equal(items[0].muscle, "ombro");
  assert.equal(items[0].personalizado, true); assert.equal(items[0].sets, 3); assert.deepEqual(items[0].reps, [8, 12]);
  // sem o mapa (outra conta): erro, mesmo mandando nm/muscle (o caminho "exercício seu" não serve para cus_)
  const outro = hydrate([{ id: meu.id, sets: 3, nm: "qualquer", muscle: "ombro" }], inp, {});
  assert.equal(outro.items.length, 0);
  assert.ok(outro.issues.some((i) => i.severity === "erro" && i.code === "id_desconhecido"));
  // aparelho que a academia não tem: aviso (o personalizado não bloqueia)
  const sem = hydrate([{ id: meu.id, sets: 2 }], { ...inp, equipment: ["banco"] }, { [meu.id]: meu });
  assert.ok(sem.issues.some((i) => i.severity === "aviso" && i.code === "aparelho"));
});
