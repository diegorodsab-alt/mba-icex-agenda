// Preferencias de cada visitante (filtro y entregas hechas). Solo en su navegador; si el almacenamiento no está
// disponible (modo privado, bloqueado) la agenda funciona igual, solo que no recuerda nada.

const CLAVE = "agenda-mba-icex:v1";

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) ?? {};
  } catch {
    return {};
  }
}

function guardar(datos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

export const filtro = () => leer().filtro ?? "";
export const ponerFiltro = (slug) => guardar({ ...leer(), filtro: slug });

export const hechas = () => new Set(leer().hechas ?? []);
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
