// Propuestas y votos de la clase, en vivo. Los guarda una aplicación web de Apps Script (apps_script/comunidad.gs) y el
// pipeline decide qué queda verificado (pipeline/propuestas.py).

const ESPERA_MS = 10_000;

async function pedir(url, opciones = {}) {
  const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(ESPERA_MS) });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  const datos = await respuesta.json();
  if (datos.ok === false) throw new Error(datos.error || "No se ha podido guardar");
  return datos;
}

export async function leer(url) {
  const conMarca = new URL(url);
  conMarca.searchParams.set("t", Date.now());   // sin caché
  return (await pedir(conMarca)).propuestas ?? [];
}

// Como text/plain el navegador no hace la consulta previa de CORS, que Apps Script no sabe contestar
const enviar = (url, datos) => pedir(url, {
  method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(datos),
});

export const proponer = (url, propuesta) => enviar(url, { accion: "proponer", ...propuesta });
export const votar = (url, propuesta, votante, voto) => enviar(url, { accion: "votar", propuesta, votante, voto });

/** Cómo se ve una propuesta: verificada (por el pipeline o porque ya llega al quórum), en duda o por confirmar. */
export function situacion(p, quorum) {
  if (p.estado === "integrada" || (p.favor >= quorum && p.favor >= 2 * p.contra)) return "verificada";
  if (p.estado === "en duda" || (p.contra >= quorum && p.contra >= p.favor)) return "en duda";
  return "pendiente";
}
