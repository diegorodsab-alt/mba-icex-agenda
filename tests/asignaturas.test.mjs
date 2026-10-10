import assert from "node:assert/strict";
import { test } from "node:test";
import { coincideFicha, ordenarSesiones, separarEvaluacion } from "../asignaturas.js";

test("búsqueda sin tildes por material, tarea o lectura sin sesión", () => {
  const f = { slug: "economia", documentos: [{ titulo: "Tema 2", que_es: "Elasticidad y aplicación" }],
    sesiones: [], normas: [], sin_sesion: { lecturas: [{ que: "Leer Mankiw capítulo 5" }], preparar: [] } };
  assert.equal(coincideFicha(f, "aplicacion tema 2"), true);
  assert.equal(coincideFicha(f, "mankiw"), true);
  assert.equal(coincideFicha(f, "contabilidad"), false);
  assert.equal(coincideFicha(f, "  "), true);
});

test("sesiones por fecha, separando las pasadas sin alterar el original", () => {
  const ss = [{ n: 3, fecha: "2026-10-13" }, { n: 1, fecha: "2026-10-05" }, { n: 2, fecha: "2026-10-09" }];
  const { proximas, pasadas } = ordenarSesiones(ss, "2026-10-09");
  assert.deepEqual(proximas.map((s) => s.n), [2, 3]);
  assert.deepEqual(pasadas.map((s) => s.n), [1]);
  assert.deepEqual(ss.map((s) => s.n), [3, 1, 2]);
});

test("no sumar el 100% de segunda convocatoria a los pesos ordinarios", () => {
  const componentes = [{ elemento: "Examen final", peso: "70%" }, { elemento: "Trabajo grupal", peso: "30%" },
    { elemento: "Convocatorias 2ª y siguientes", peso: "100%" }, { elemento: "Examen en segunda convocatoria", peso: "100%" }];
  const { ordinaria, otras } = separarEvaluacion(componentes);
  assert.deepEqual(ordinaria.map((x) => x.peso), ["70%", "30%"]);
  assert.equal(otras.length, 2);
});

test("preferencias funcionan durante la visita si localStorage está bloqueado", async () => {
  globalThis.localStorage = { getItem() { throw Error("bloqueado"); }, setItem() { throw Error("bloqueado"); } };
  const p = await import("../preferencias.js");
  p.marcarHecha("h1", true);
  assert.equal(p.hechas().has("h1"), true);
  p.ponerFiltro("economia");
  assert.equal(p.filtro(), "economia");
  p.marcarHecha("h1", false);
  assert.equal(p.hechas().has("h1"), false);
  delete globalThis.localStorage;
});
