// Búsqueda y orden del material, sin DOM ni dependencias.
const normal = (x) => String(x ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");

export function coincideFicha(f, consulta, nombre = "") {
  const textos = [nombre, f.slug, ...f.documentos.flatMap((d) => [d.titulo, d.que_es]),
    ...f.sesiones.flatMap((s) => [s.contenido, ...s.lecturas.map((x) => x.que), ...s.preparar.map((x) => x.que)]),
    ...(f.sin_sesion?.lecturas ?? []).map((x) => x.que), ...(f.sin_sesion?.preparar ?? []).map((x) => x.que), ...f.normas];
  const texto = normal(textos.join(" "));
  return normal(consulta).trim().split(/\s+/).every((palabra) => texto.includes(palabra));
}

export function ordenarSesiones(sesiones, hoy) {
  const orden = (a, b) => a.fecha.localeCompare(b.fecha) || a.n - b.n;
  return { proximas: sesiones.filter((s) => s.fecha >= hoy).sort(orden),
    pasadas: sesiones.filter((s) => s.fecha < hoy).sort(orden).reverse() };
}

// Un 100% de recuperación no se suma a la evaluación de la convocatoria ordinaria.
export function separarEvaluacion(componentes) {
  const esRecuperacion = (c) => /segunda|segundas|2\s*[.ªºa]|siguientes|extraordinaria|recuperacion/.test(normal(c.elemento));
  return { ordinaria: componentes.filter((c) => !esRecuperacion(c)),
    otras: componentes.filter(esRecuperacion) };
}
