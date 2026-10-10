// Diálogo para proponer una entrega nueva o corregir la fecha de una que ya está. Usa <dialog> nativo (foco atrapado,
// Esc para cerrar) y lo mínimo para escribir: atajos de fecha ("próxima clase", "mañana"…) y, mientras escribes, las
// entregas parecidas que ya existen, para confirmarlas en vez de duplicarlas.

import { h } from "./dom.js?v=12b38a024e";
import * as F from "./fechas.js?v=12b38a024e";

const TIPOS = [["entrega", "Entrega"], ["presentacion", "Presentación"], ["lectura", "Lectura"], ["examen", "Examen"], ["otro", "Otro"]];
const CANALES = [["clase", "En clase"], ["correo", "Por correo"], ["moodle", "Moodle está mal"], ["otro", "Otro"]];

const palabras = (texto) => new Set((texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/\w+/g) ?? [])
  .filter((w) => w.length > 3 || /\d/.test(w)));

function parecido(a, b) {
  const pa = palabras(a);
  const pb = palabras(b);
  if (!pa.size || !pb.size) return 0;
  return [...pa].filter((w) => pb.has(w)).length / Math.min(pa.size, pb.size);
}

function grupoRadios(nombre, leyenda, opciones, elegida) {
  return h("fieldset", { class: "segmentado" },
    h("legend", {}, leyenda),
    h("div", { class: "segmentado__opciones" }, opciones.map(([valor, texto]) => h("label", {},
      h("input", { type: "radio", name: nombre, value: valor, checked: valor === elegida, required: true }), h("span", {}, texto)))));
}

/**
 * ctx: { asignaturas (Map slug → {corto}), clases, plazos (con las propuestas), filtro, quorum, yo {id, nombre},
 *        enviar(propuesta) → Promise, confirmar(propuesta) → Promise, corregir(item) }
 * item: entregable a corregir (o null para proponer uno nuevo).
 */
export function abrirPropuesta(ctx, item = null) {
  const origen = document.activeElement;
  const corrigiendo = Boolean(item);
  const poniendo = corrigiendo && !item.fecha;   // entrega sin fecha: se propone la primera
  const textoEnviar = poniendo ? "Proponer fecha" : corrigiendo ? "Proponer cambio" : "Proponer";
  const hoy = F.hoy();
  const ahora = F.ahora();

  const campo = (etiqueta, control, ayuda) => h("label", { class: "campo" }, h("span", { class: "campo__etiqueta" }, etiqueta),
    control, ayuda && h("span", { class: "campo__ayuda" }, ayuda));

  const asignaturas = [...ctx.asignaturas.values()].filter((a) => a.slug !== "general").sort((a, b) => a.corto.localeCompare(b.corto, "es"));
  const selAsignatura = h("select", { name: "asignatura", required: true },
    h("option", { value: "" }, "Elige…"), asignaturas.map((a) => h("option", { value: a.slug }, a.corto)),
    h("option", { value: "general" }, "General / otra"));
  selAsignatura.value = item?.asignatura ?? (ctx.filtro || "");
  const inTitulo = h("input", { name: "titulo", type: "text", required: true, maxlength: "140", autocomplete: "off",
    placeholder: "p. ej. Caso Velora: informe en grupo" });
  const inFecha = h("input", { name: "fecha", type: "date", required: true, min: F.sumarDias(hoy, -1) });
  const inHora = h("input", { name: "hora", type: "time" });
  const inDetalle = h("textarea", { name: "detalle", rows: "3", maxlength: "500", placeholder: "Formato, si es en grupo, dónde se entrega…" });
  const inNombre = h("input", { name: "nombre", type: "text", maxlength: "60", autocomplete: "given-name", value: ctx.yo.nombre });
  const atajos = h("div", { class: "atajos", role: "group", "aria-label": "Atajos de fecha" });
  const sugerencias = h("div", { class: "sugerencias", "aria-live": "polite" });
  const error = h("p", { class: "dialogo__error", role: "alert", hidden: true });
  const botonEnviar = h("button", { class: "boton boton--primario", type: "submit" }, textoEnviar);

  // Atajos: la próxima clase de la asignatura (muchas entregas son "para la próxima clase"), mañana, viernes, en una semana
  function pintarAtajos() {
    const proxima = ctx.clases.find((c) => c.asignatura === (item?.asignatura ?? selAsignatura.value)
      && ["clase", "presentaciones"].includes(c.tipo) && c.inicio.slice(0, 16) > ahora);
    const viernes = F.sumarDias(hoy, ((5 - new Date(`${hoy}T12:00:00Z`).getUTCDay() + 7) % 7) || 7);
    const opciones = [
      proxima && [`Próxima clase · ${F.diaCorto(proxima.inicio)} ${F.hora(proxima.inicio)}`, proxima.inicio.slice(0, 10), F.hora(proxima.inicio)],
      ["Mañana", F.sumarDias(hoy, 1), null],
      [`Viernes ${F.partesDia(viernes).dia}`, viernes, null],
      ["En una semana", F.sumarDias(hoy, 7), null],
    ].filter(Boolean);
    atajos.replaceChildren(...opciones.map(([texto, fecha, hora]) => h("button", { class: "chip", type: "button", onclick: () => {
      inFecha.value = fecha;
      if (hora) inHora.value = hora;
    } }, texto)));
  }

  // Lo que ya existe y se parece: mejor confirmarlo (o corregir su fecha) que duplicarlo
  function pintarSugerencias() {
    const slug = selAsignatura.value;
    const texto = inTitulo.value;
    const parecidas = palabras(texto).size ? ctx.plazos
      .filter((x) => x.asignatura === slug && x.fecha && x.fecha >= hoy && x.grupo !== "examen")
      .map((x) => ({ x, nota: parecido(texto, x.titulo) })).filter((s) => s.nota >= 0.5)
      .sort((a, b) => b.nota - a.nota).slice(0, 3) : [];
    sugerencias.replaceChildren(...(parecidas.length ? [
      h("p", { class: "sugerencias__titulo" }, "¿Es alguna de estas?"),
      h("ul", { role: "list" }, parecidas.map(({ x }) => h("li", {},
        h("span", {}, h("strong", {}, x.titulo), ` · ${F.diaCorto(x.fecha)}${x.hora ? ` ${x.hora}` : ""}`,
          x.propuesta ? " · propuesta de la clase" : ""),
        x.propuesta
          ? h("button", { class: "chip", type: "button", onclick: () => confirmarExistente(x.propuesta) }, "✓ Me consta")
          : h("button", { class: "chip", type: "button", onclick: () => { cerrar(); ctx.corregir(x); } }, "Corregir su fecha")))),
    ] : []));
  }

  async function confirmarExistente(propuesta) {
    try {
      await ctx.confirmar(propuesta);
      cerrar();
    } catch (e) {
      mostrarError(e);
    }
  }

  function mostrarError(e) {
    error.textContent = `No se ha podido enviar: ${e.message}. Inténtalo de nuevo en un momento.`;
    error.hidden = false;
  }

  if (corrigiendo) {
    inFecha.value = item.fecha ?? "";
    inHora.value = item.hora ?? "";
  }
  pintarAtajos();

  const formulario = h("form", { class: "dialogo__form", novalidate: true },
    h("header", { class: "dialogo__cabecera" },
      h("h2", { id: "dialogo-titulo" }, poniendo ? "Poner fecha" : corrigiendo ? "Corregir fecha" : "Proponer una entrega o fecha"),
      h("button", { class: "dialogo__cerrar", type: "button", "aria-label": "Cerrar", onclick: () => cerrar() }, "✕")),
    corrigiendo
      ? h("p", { class: "dialogo__contexto" }, h("strong", {}, item.titulo), h("br"),
        `Ahora: ${item.fecha ? `${F.diaCorto(item.fecha)}${item.hora ? ` · ${item.hora}` : ""}` : "sin fecha"}`)
      : [campo("Asignatura", selAsignatura), campo("¿Qué hay que hacer?", inTitulo), sugerencias,
        grupoRadios("tipo", "Tipo", TIPOS, "entrega")],
    h("div", { class: "campo-doble" },
      campo(corrigiendo && !poniendo ? "Fecha correcta" : "Fecha límite", inFecha),
      campo("Hora", inHora, "Opcional")),
    atajos,
    grupoRadios("canal", "¿Cómo lo sabéis?", CANALES, corrigiendo && !poniendo ? "correo" : "clase"),
    h("details", { class: "dialogo__mas" }, h("summary", {}, "Añadir detalles"), inDetalle),
    !ctx.yo.nombre && campo("Tu nombre", inNombre, "Opcional. Solo lo ve quien mantiene la agenda, no sale publicado."),
    error,
    h("p", { class: "nota" }, `Se ve al momento en la agenda de todos, marcada «por confirmar», y queda verificada cuando la `
      + `confirman ${ctx.quorum} compañeros.`),
    h("footer", { class: "dialogo__pie" },
      h("button", { class: "boton", type: "button", onclick: () => cerrar() }, "Cancelar"), botonEnviar));

  const dialogo = h("dialog", { class: "dialogo", "aria-labelledby": "dialogo-titulo" }, formulario);
  const cerrar = () => dialogo.open && dialogo.close();

  selAsignatura.addEventListener("change", () => { pintarAtajos(); pintarSugerencias(); });
  inTitulo.addEventListener("input", pintarSugerencias);
  dialogo.addEventListener("click", (ev) => ev.target === dialogo && cerrar());   // clic fuera
  dialogo.addEventListener("close", () => {
    dialogo.remove();
    origen?.focus?.();
  });

  formulario.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    error.hidden = true;
    if (!formulario.reportValidity()) return;
    const datos = new FormData(formulario);
    if (corrigiendo && datos.get("fecha") === item.fecha && (datos.get("hora") || null) === (item.hora || null)) {
      error.textContent = "Es la misma fecha que ya tiene.";
      error.hidden = false;
      return;
    }
    const propuesta = {
      ref: corrigiendo ? item.id : "", asignatura: corrigiendo ? item.asignatura : datos.get("asignatura"),
      tipo: corrigiendo ? (item.grupo === "entrega" && item.tipo !== "presentacion" ? "entrega" : item.tipo) : datos.get("tipo"),
      titulo: corrigiendo ? item.titulo : datos.get("titulo").trim(), fecha: datos.get("fecha"), hora: datos.get("hora") || "",
      canal: datos.get("canal"), detalle: (datos.get("detalle") || "").trim(), nombre: (datos.get("nombre") ?? ctx.yo.nombre).trim(),
    };
    botonEnviar.disabled = true;
    botonEnviar.textContent = "Enviando…";
    try {
      await ctx.enviar(propuesta);
      cerrar();
    } catch (e) {
      mostrarError(e);
      botonEnviar.disabled = false;
      botonEnviar.textContent = textoEnviar;
    }
  });

  document.body.append(dialogo);
  dialogo.showModal();
  (corrigiendo ? inFecha : selAsignatura.value ? inTitulo : selAsignatura).focus();
}
