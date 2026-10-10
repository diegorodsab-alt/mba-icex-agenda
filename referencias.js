// Solo fusiones de tareas idénticas publicadas por el backend; los proyectos y subtareas conservan sus ids.
export function resolverReferencia(ref, aliases = {}) {
  const vistos = new Set();
  let actual = ref;
  while (Object.hasOwn(aliases, actual)) {
    if (vistos.has(actual)) return ref;
    vistos.add(actual);
    const siguiente = aliases[actual];
    if (typeof siguiente !== "string" || !/^[mh]\d+$/.test(siguiente)) return ref;
    actual = siguiente;
  }
  return actual;
}

export function migrarHechas(hechas, aliases = {}) {
  return new Set([...hechas].map((id) => resolverReferencia(id, aliases)));
}

export function propuestaSinDestino(propuesta, visibles, aliases = {}) {
  return !propuesta.ref || !visibles.has(resolverReferencia(propuesta.ref, aliases));
}
