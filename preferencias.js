// Preferencias de cada visitante (filtro y entregas hechas). Solo en su navegador; si el almacenamiento no está
// disponible (modo privado, bloqueado) la agenda funciona igual, solo que no recuerda nada.

const CLAVE = "agenda-mba-icex:v1";
import { migrarHechas } from "./referencias.js?v=0d5032fccf";
let memoria = {};

function leer() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE));
    return datos && typeof datos === "object" && !Array.isArray(datos) ? datos : memoria;
  } catch {
    return memoria;
  }
}

function guardar(datos) {
  memoria = datos;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

export const filtro = () => leer().filtro ?? "";
export const ponerFiltro = (slug) => guardar({ ...leer(), filtro: slug });

export const hechas = () => new Set(leer().hechas ?? []);
export function actualizarReferencias(aliases) {
  const previas = hechas();
  const actuales = migrarHechas(previas, aliases);
  if (actuales.size !== previas.size || [...actuales].some((id) => !previas.has(id))) {
    guardar({ ...leer(), hechas: [...actuales] });
  }
}
export function marcarHecha(id, hecha) {
  const conjunto = hechas();
  if (hecha) conjunto.add(id);
  else conjunto.delete(id);
  guardar({ ...leer(), hechas: [...conjunto] });
}

// Identidad anónima para proponer y votar: un identificador por navegador (sin cuentas) y un nombre opcional que solo
// ve quien mantiene la agenda. Si no hay almacenamiento, vale para esta visita.
let idVisita = null;
export function yo() {
  const datos = leer();
  if (!datos.yo) {
    idVisita ??= crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    datos.yo = idVisita;
    guardar(datos);
  }
  return { id: datos.yo, nombre: datos.nombre ?? "" };
}
export const ponerNombre = (nombre) => guardar({ ...leer(), nombre });

export const votos = () => leer().votos ?? {};
export function ponerVoto(propuesta, voto) {
  const actuales = votos();
  if (voto) actuales[propuesta] = voto;
  else delete actuales[propuesta];
  guardar({ ...leer(), votos: actuales });
}

export const mias = () => new Set(leer().mias ?? []);
export const anadirMia = (propuesta) => guardar({ ...leer(), mias: [...mias(), propuesta] });

// Plazo de la pestaña Entregas: { tipo: "7" | "14" | "30" | "todo" | "elegir", desde, hasta }
export const rango = () => leer().rango ?? { tipo: "30" };
export const ponerRango = (valor) => guardar({ ...leer(), rango: valor });
