import test from "node:test";
import assert from "node:assert/strict";
import { migrarHechas, resolverReferencia, propuestaSinDestino } from "../referencias.js";

test("conserva Hecho y la corrección de una referencia fusionada", () => {
  const aliases = { h1: "h2", h2: "m10" };
  assert.equal(resolverReferencia("h1", aliases), "m10");
  assert.deepEqual([...migrarHechas(new Set(["h1", "h2", "h3"]), aliases)], ["m10", "h3"]);
  assert.equal(resolverReferencia("h3", aliases), "h3");
});

test("un mapa corrupto no cambia la identidad de una tarea", () => {
  assert.equal(resolverReferencia("h1", { h1: "h2", h2: "h1" }), "h1");
  assert.equal(resolverReferencia("h1", { h1: "http://privado" }), "h1");
});

test("una corrección con destino desaparecido permanece visible como propuesta", () => {
  const visibles = new Set(["m10"]);
  assert.equal(propuestaSinDestino({ ref: "h1" }, visibles, { h1: "m10" }), false);
  assert.equal(propuestaSinDestino({ ref: "h2" }, visibles, { h1: "m10" }), true);
  assert.equal(propuestaSinDestino({ ref: "" }, visibles), true);
});
