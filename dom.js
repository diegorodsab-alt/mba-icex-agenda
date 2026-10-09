// Mini ayudante para crear DOM. Los textos entran siempre como nodos de texto (nunca innerHTML), así que lo
// que venga en los datos no puede inyectar HTML.

export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props ?? {})) {
    if (valor == null || valor === false) continue;
    if (clave === "class") el.className = valor;
    else if (clave === "style") for (const [p, v] of Object.entries(valor)) el.style.setProperty(p, v);
    else if (clave.startsWith("on")) el.addEventListener(clave.slice(2), valor);
    else if (clave === "checked" || clave === "open") el[clave] = Boolean(valor);
    else el.setAttribute(clave, valor === true ? "" : valor);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo != null && hijo !== false) el.append(hijo instanceof Node ? hijo : String(hijo));
  }
  return el;
}

/** Solo enlaces https: un dato mal formado no puede convertirse en un enlace javascript:. */
export const urlSegura = (url) => (typeof url === "string" && /^https:\/\//.test(url) ? url : null);
