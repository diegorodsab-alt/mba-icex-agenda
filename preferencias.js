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
