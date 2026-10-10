// Lógica pura de la agenda (sin DOM): node --test web/tests
import assert from "node:assert/strict";
import { test } from "node:test";

import { situacion } from "../comunidad.js";
import * as F from "../fechas.js";

test("sumar días y días entre fechas, también con cambio de hora", () => {
  assert.equal(F.sumarDias("2026-10-24", 2), "2026-10-26");      // fin del horario de verano (25 oct)
  assert.equal(F.sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(F.diasEntre("2026-10-24", "2026-10-26"), 2);
  assert.equal(F.diasEntre("2026-10-26T09:00", "2026-10-24"), -2);
});

test("lunes de la semana", () => {
  assert.equal(F.lunesDe("2026-10-09"), "2026-10-05");   // viernes
  assert.equal(F.lunesDe("2026-10-11"), "2026-10-05");   // domingo
  assert.equal(F.lunesDe("2026-10-05"), "2026-10-05");
});

test("textos relativos y rangos de semana", () => {
  assert.deepEqual([0, 1, -1, 5, -3].map(F.relativo), ["hoy", "mañana", "ayer", "en 5 días", "hace 3 días"]);
  assert.match(F.rangoSemana("2026-10-05"), /^5 – 11 oct/);
  assert.match(F.rangoSemana("2026-09-28"), /^28 sept? – 4 oct/);
  assert.equal(F.partesDia("2026-10-09").dia, "9");
});

test("ahora() en hora de Madrid con el formato que compara la agenda", () => {
  assert.match(F.ahora(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(F.hoy(), F.ahora().slice(0, 10));
});

test("situación de una propuesta según votos y quórum", () => {
  const p = (favor, contra, estado = "pendiente") => ({ favor, contra, estado });
  assert.equal(situacion(p(1, 0), 2), "pendiente");
  assert.equal(situacion(p(2, 0), 2), "verificada");
  assert.equal(situacion(p(3, 2), 2), "pendiente");      // hace falta el doble de ✓ que de ✗
  assert.equal(situacion(p(0, 2), 2), "en duda");
  assert.equal(situacion(p(1, 0, "integrada"), 4), "verificada");
  assert.equal(situacion(p(5, 0, "en duda"), 2), "verificada");   // el pipeline aún no lo ha recogido
});
