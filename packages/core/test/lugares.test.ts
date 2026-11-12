import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSY_SLOTS, EQUIPMENT, PLACE_KINDS, assignWeekdays, daysOfPlace, placeIdFor, reassignDays, validatePlace } from "../src/index.ts";

const ok = (input: unknown, opts?: { partial?: boolean }): any => {
  const r = validatePlace(input, opts);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  return r.value;
};
const bad = (input: unknown, re: RegExp, opts?: { partial?: boolean }) => {
  const r = validatePlace(input, opts);
  assert.ok(!r.ok, "deveria recusar");
  if (!r.ok) assert.match(r.errors.join("; "), re);
};

test("lugar: aceita o mínimo (nome) e normaliza espaços", () => {
  const v = ok({ name: "  Smart   Fit Centro " });
  assert.equal(v.name, "Smart Fit Centro");
  assert.equal(v.kind, "academia");
  assert.deepEqual(v.equipment, []);
});

test("lugar: nome obrigatório, até 40 caracteres, sem caractere de controle", () => {
  bad({}, /nome/);
  bad({ name: "   " }, /nome/);
  bad({ name: "x".repeat(41) }, /40/);
  bad({ name: "Casa\u0000" }, /nome/);
  ok({ name: "x".repeat(40) });
});

test("lugar: tipo só academia, casa ou hotel", () => {
  for (const k of PLACE_KINDS) assert.equal(ok({ name: "A", kind: k }).kind, k);
  bad({ name: "A", kind: "praça" }, /tipo/);
});

test("lugar: lat/lng em faixa e sempre juntos", () => {
  const v = ok({ name: "A", lat: -23.55, lng: -46.63 });
  assert.equal(v.lat, -23.55); assert.equal(v.lng, -46.63);
  bad({ name: "A", lat: 91, lng: 0 }, /lat/);
  bad({ name: "A", lat: 0, lng: -181 }, /lng/);
  bad({ name: "A", lat: -23.55 }, /juntos/);
  bad({ name: "A", lat: "x", lng: 1 }, /lat/);
  bad({ name: "A", lat: NaN, lng: 1 }, /lat/);
  bad({ name: "A", lat: Infinity, lng: 1 }, /lat/);
  assert.equal(ok({ name: "A", lat: null, lng: null }).lat, null);
});

test("lugar: coordenada é arredondada a 5 casas (~1 m)", () => {
  const v = ok({ name: "A", lat: -23.5505199123, lng: -46.6333094456 });
  assert.equal(v.lat, -23.55052); assert.equal(v.lng, -46.63331);
});

test("lugar: endereço até 160 caracteres", () => {
  assert.equal(ok({ name: "A", address: " Av. Paulista, 1000 " }).address, "Av. Paulista, 1000");
  assert.equal(ok({ name: "A", address: "" }).address, null);
  bad({ name: "A", address: "x".repeat(161) }, /endereço/);
});

test("lugar: aparelhos só do catálogo, sem repetição", () => {
  assert.deepEqual(ok({ name: "A", equipment: ["halteres", "banco"] }).equipment, ["halteres", "banco"]);
  assert.deepEqual(ok({ name: "A", equipment: ["halteres", "halteres"] }).equipment, ["halteres"]);
  bad({ name: "A", equipment: ["nave_espacial"] }, /aparelho/);
  bad({ name: "A", equipment: "halteres" }, /aparelhos/);
  assert.equal(ok({ name: "A", equipment: EQUIPMENT.map((e) => e.id) }).equipment.length, EQUIPMENT.length);
});

test("lugar: horários que lota e dias da semana válidos", () => {
  assert.deepEqual(ok({ name: "A", busyHours: [BUSY_SLOTS[0]] }).busyHours, [BUSY_SLOTS[0]]);
  bad({ name: "A", busyHours: ["3-4"] }, /horário/);
  assert.deepEqual(ok({ name: "A", weekdays: ["qua", "seg", "seg"] }).weekdays, ["seg", "qua"]);
  bad({ name: "A", weekdays: ["xyz"] }, /dia/);
});

test("lugar: modo parcial só devolve o que veio (PUT sem apagar o resto)", () => {
  const v = ok({ name: "Novo nome" }, { partial: true });
  assert.deepEqual(Object.keys(v), ["name"]);
  assert.deepEqual(Object.keys(ok({ lat: 1, lng: 2 }, { partial: true })).sort(), ["lat", "lng"]);
  bad({ kind: "x" }, /tipo/, { partial: true });
});

test("lugar: entrada que não é objeto é recusada; campo desconhecido também", () => {
  bad(null, /objeto/);
  bad([], /objeto/);
  bad({ name: "A", deleted_at: 1 }, /desconhecido/);
});

test("id do lugar: slug sem acento, único entre os existentes", () => {
  assert.equal(placeIdFor("Smart Fit — Centro", []), "smart-fit-centro");
  assert.equal(placeIdFor("Academia", ["academia"]), "academia-2");
  assert.equal(placeIdFor("Academia", ["academia", "academia-2"]), "academia-3");
  assert.equal(placeIdFor("!!!", []), "lugar");
  assert.match(placeIdFor("x".repeat(80), []), /^[a-z0-9_-]{1,40}$/);
});

test("dias do lugar: um dia pertence a um lugar só", () => {
  const dayGym = { seg: "a", ter: "b", qua: "a" };
  assert.deepEqual(daysOfPlace(dayGym, "a"), ["seg", "qua"]);
  const r = assignWeekdays(dayGym, "b", ["seg", "sex"]);
  assert.deepEqual(r.dayGym, { seg: "b", qua: "a", sex: "b" });
  assert.deepEqual(daysOfPlace(r.dayGym, "b"), ["seg", "sex"]);
  // o patch (null apaga) é o que o servidor manda ao perfil
  assert.deepEqual(r.patch, { seg: "b", ter: null, sex: "b" });
});

test("dias do lugar: lista vazia libera os dias dele; dia fora de DOWS é ignorado", () => {
  const r = assignWeekdays({ seg: "a", qua: "a", ter: "b" }, "a", []);
  assert.deepEqual(r.patch, { seg: null, qua: null });
  assert.deepEqual(r.dayGym, { ter: "b" });
  assert.deepEqual(assignWeekdays({}, "a", ["seg", "foo" as any]).patch, { seg: "a" });
});

test("apagar lugar: reatribui os dias para o lugar escolhido", () => {
  const r = reassignDays({ seg: "a", ter: "b", qua: "a" }, "a", "b");
  assert.deepEqual(r.dayGym, { seg: "b", ter: "b", qua: "b" });
  assert.deepEqual(r.patch, { seg: "b", qua: "b" });
});

test("apagar lugar: sem destino, os dias ficam sem padrão (patch com null)", () => {
  const r = reassignDays({ seg: "a", ter: "b" }, "a", null);
  assert.deepEqual(r.dayGym, { ter: "b" });
  assert.deepEqual(r.patch, { seg: null });
});

test("apagar lugar: destino igual ao apagado é recusado", () => {
  assert.throws(() => reassignDays({ seg: "a" }, "a", "a"), /destino/);
});

test("apagar lugar: lugar sem dias não gera patch", () => {
  assert.deepEqual(reassignDays({ ter: "b" }, "a", "b").patch, {});
});
