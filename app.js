// Agenda MBA ICEX: lee datos.json (lo genera pipeline/web_publica.py) y pinta la vista de la URL (#hoy, #entregas…).

import { h, urlSegura } from "./dom.js?v=58007f184b";
import * as F from "./fechas.js?v=58007f184b";
import * as P from "./preferencias.js?v=58007f184b";

const TIPOS = {
  entrega: "Entrega", presentacion: "Presentación", cuestionario: "Cuestionario", lectura: "Lectura",
  examen: "Examen", otro: "Aviso",
};
const ICONOS = { entrega: "📤", presentacion: "🎤", cuestionario: "📝", lectura: "📖", examen: "🎯", otro: "📌" };
const DIAS_HOY = 14;          // horizonte de "Próximos plazos" en la portada
const HORAS_ANTIGUA = 36;     // a partir de aquí se avisa de que la agenda no se ha actualizado

const estado = { datos: null, asignaturas: new Map(), plazos: [], filtro: P.filtro(), semana: null };
const $ = (selector) => document.querySelector(selector);

// ───────────────────────────── datos ─────────────────────────────

async function cargar() {
  try {
    const respuesta = await fetch("datos.json", { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    iniciar(await respuesta.json());
  } catch (error) {
    console.error(error);
    $("#actualizado").textContent = "sin datos";
    pintar(h("div", { class: "aviso aviso--error", role: "alert" },
      h("p", {}, "No se ha podido cargar la agenda. Comprueba la conexión."),
      h("button", { class: "boton", type: "button", onclick: () => location.reload() }, "Reintentar")));
  }
}

function iniciar(datos) {
  estado.datos = datos;
  estado.asignaturas = new Map(datos.asignaturas.map((a) => [a.slug, a]));
  // Entregas, exámenes y otras fechas en una sola lista de "plazos" con la misma forma
  estado.plazos = [
    ...datos.entregas.map((e) => ({ ...e, grupo: "entrega" })),
    ...datos.examenes.map((x) => ({ ...x, tipo: "examen", grupo: "examen", fuente: "Horario" })),
    ...datos.fechas.map((f) => ({ ...f, grupo: "fecha", fuente: "Confirmado" })),
  ].sort(porFecha);

  $("#grupo").textContent = `Grupo ${datos.grupo}`;
  $("#actualizado").textContent = `actualizado ${F.haceCuanto(datos.generado)}`;
  const moodle = urlSegura(datos.moodle);
  if (moodle) $("#enlace-moodle").href = moodle;
  if (F.horasDesde(datos.generado) > HORAS_ANTIGUA) {
    const aviso = $("#aviso");
    aviso.textContent = `La agenda no se actualiza desde ${F.haceCuanto(datos.generado)}. Comprueba las fechas en Moodle.`;
    aviso.hidden = false;
  }
  prepararFiltro();
  window.addEventListener("hashchange", () => mostrar(true));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && mostrar(false));
  mostrar(false);
}

const porFecha = (a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || (a.hora ?? "").localeCompare(b.hora ?? "");
const pasaFiltro = (x) => !estado.filtro || x.asignatura === estado.filtro;
const momento = (x) => `${x.fecha}T${x.hora || "23:59"}`;
const yaPaso = (x) => x.fecha && momento(x) < F.ahora();
// Un plazo de Moodle "a las 00:00" del día 3 vence en realidad la noche del día 2
const diaLimite = (x) => (x.hora === "00:00" ? F.sumarDias(x.fecha, -1) : x.fecha);

function prepararFiltro() {
  const select = $("#filtro");
  const ordenadas = [...estado.asignaturas.values()].sort((a, b) => a.corto.localeCompare(b.corto, "es"));
  select.append(...ordenadas.map((a) => h("option", { value: a.slug }, a.corto)));
  if (!estado.asignaturas.has(estado.filtro)) estado.filtro = "";
  select.value = estado.filtro;
  select.disabled = false;
  select.addEventListener("change", () => {
    estado.filtro = select.value;
    P.ponerFiltro(estado.filtro);
    mostrar(false);
  });
}

// ───────────────────────────── navegación ─────────────────────────────

const VISTAS = { hoy: vistaHoy, entregas: vistaEntregas, examenes: vistaExamenes, horario: vistaHorario, calendario: vistaCalendario };

function mostrar(enfocar) {
  const nombre = location.hash.slice(1) in VISTAS ? location.hash.slice(1) : "hoy";
  for (const enlace of document.querySelectorAll(".pestanas a")) {
    if (enlace.dataset.vista === nombre) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  pintar(nombre !== "calendario" && avisoFiltro(), VISTAS[nombre]());
  document.title = `${$(".pestanas a[aria-current]").lastChild.textContent.trim()} · Agenda MBA ICEX`;
  // Al cambiar de sección con el teclado o un lector de pantalla, el foco va al título de la nueva vista
  if (enfocar) $("#vista h2")?.focus({ preventScroll: true });
}

function pintar(...nodos) {
  const vista = $("#vista");
  vista.replaceChildren(...nodos.filter(Boolean));
  vista.setAttribute("aria-busy", "false");
}

// ───────────────────────────── piezas ─────────────────────────────

/** Recordatorio de que hay un filtro puesto (se guarda entre visitas y si no, confunde). */
function avisoFiltro() {
  if (!estado.filtro) return null;
  const quitar = () => {
    estado.filtro = "";
    $("#filtro").value = "";
    P.ponerFiltro("");
    mostrar(false);
  };
  return h("p", { class: "filtro-activo" }, "Mostrando solo ", h("strong", {}, nombreAsignatura(estado.filtro)), " · ",
    h("button", { class: "enlace-boton", type: "button", onclick: quitar }, "ver todas"));
}

const asignatura = (slug) => estado.asignaturas.get(slug);
const color = (slug) => {
  const a = asignatura(slug);
  return a ? { "--asig-claro": a.color, "--asig-oscuro": a.color_oscuro } : {};
};
const nombreAsignatura = (slug) => asignatura(slug)?.corto ?? "General";

function titulo(texto, sub) {
  return h("div", { class: "titulo-vista" }, h("h2", { tabindex: "-1" }, texto), sub && h("p", { class: "titulo-vista__sub" }, sub));
}

function seccion(texto, ...contenido) {
  return h("section", { class: "seccion" }, h("h3", { class: "seccion__titulo" }, texto), ...contenido);
}

const vacio = (texto) => h("p", { class: "vacio" }, texto);

function etiquetaAsignatura(slug) {
  return h("span", { class: "etiqueta-asig", style: color(slug) }, nombreAsignatura(slug));
}

/** Insignia de cuenta atrás con semáforo: rojo ≤ 3 días, ámbar ≤ 7, verde el resto, gris si ya pasó. */
function cuentaAtras(x) {
  if (!x.fecha) return h("span", { class: "insignia insignia--neutra" }, "sin fecha");
  const dias = F.diasEntre(F.hoy(), diaLimite(x));
  const nivel = yaPaso(x) ? "pasada" : dias <= 3 ? "urgente" : dias <= 7 ? "pronto" : "holgada";
  const texto = yaPaso(x) && dias === 0 ? "cerrada" : F.relativo(dias);
  return h("span", { class: `insignia insignia--${nivel}` }, texto);
}

function cajaFecha(fecha) {
  if (!fecha) return h("div", { class: "caja-fecha caja-fecha--vacia", "aria-hidden": "true" }, "?");
  const p = F.partesDia(fecha);
  return h("div", { class: "caja-fecha", "aria-hidden": "true" },
    h("span", { class: "caja-fecha__semana" }, p.semana), h("span", { class: "caja-fecha__dia" }, p.dia),
    h("span", { class: "caja-fecha__mes" }, p.mes));
}

function plazo(x, { conFecha = true, hechas = P.hechas() } = {}) {
  const hecha = hechas.has(x.id);
  const url = urlSegura(x.url);
  const meta = [
    etiquetaAsignatura(x.asignatura),
    x.grupo !== "examen" && (TIPOS[x.tipo] ?? x.tipo),
    x.hora && x.hora !== "00:00" && `${x.grupo === "entrega" ? "hasta" : "a"} las ${x.hora}`,
    x.hora === "00:00" && `hasta las 00:00 (la noche del ${F.diaCorto(diaLimite(x))})`,
    x.peso && `${x.peso} de la nota`,
    x.voluntario && "voluntaria",
    x.grupo === "entrega" && (x.fuente === "Moodle" ? "en Moodle" : "fecha confirmada"),
  ].filter(Boolean);
  const clases = ["plazo", !conFecha && "plazo--sin-caja", hecha && "es-hecha", yaPaso(x) && "es-pasada"];
  return h("li", { class: clases.filter(Boolean).join(" "), style: color(x.asignatura) },
    conFecha && cajaFecha(x.fecha),
    h("div", { class: "plazo__cuerpo" },
      h("p", { class: "plazo__titulo" }, h("span", { class: "icono", "aria-hidden": "true" }, ICONOS[x.tipo] ?? "📌"), x.titulo),
      h("p", { class: "plazo__meta" }, meta.flatMap((m, i) => (i ? [h("span", { class: "sep", "aria-hidden": "true" }, "·"), m] : [m]))),
      url && h("a", { class: "enlace-ext", href: url, target: "_blank", rel: "noopener" }, "Abrir en Moodle",
        h("span", { class: "sr" }, " (se abre en otra pestaña)"))),
    h("div", { class: "plazo__lado" },
      cuentaAtras(x),
      x.grupo === "entrega" && h("label", { class: "hecha" },
        // Se marca en el sitio, sin repintar: la lista no salta y el foco no se pierde
        h("input", { type: "checkbox", checked: hecha, "aria-label": `Hecha: ${x.titulo}`, onchange: (ev) => {
          P.marcarHecha(x.id, ev.target.checked);
          ev.target.closest(".plazo").classList.toggle("es-hecha", ev.target.checked);
        } }),
        "Hecha")));
}

function listaPlazos(items, opciones = {}) {
  const hechas = P.hechas();
  return h("ul", { class: "lista", role: "list" }, items.map((x) => plazo(x, { hechas, ...opciones })));
}

function clase(c) {
  const ahora = F.ahora();
  const enCurso = c.inicio.slice(0, 16) <= ahora && ahora < c.fin.slice(0, 16);
  const pasada = c.fin.slice(0, 16) <= ahora;
  const nombre = c.asignatura ? nombreAsignatura(c.asignatura) : c.tema || "Evento";
  const detalle = [
    c.tipo === "presentaciones" ? "Presentaciones" : c.tipo === "examen" ? "Examen" : c.sesion ? `Sesión ${c.sesion}` : "",
    c.asignatura && c.tipo === "evento" ? c.tema : "",
    c.profesor, c.aula,
  ].filter(Boolean).join(" · ");
  return h("li", { class: `clase clase--${c.tipo}${enCurso ? " es-ahora" : ""}${pasada ? " es-pasada" : ""}`, style: color(c.asignatura) },
    h("div", { class: "clase__hora" }, h("time", {}, F.hora(c.inicio)), h("time", { class: "clase__fin" }, F.hora(c.fin))),
    h("div", { class: "clase__cuerpo" },
      h("p", { class: "clase__titulo" }, nombre),
      detalle && h("p", { class: "clase__meta" }, detalle)),
    enCurso && h("span", { class: "insignia insignia--ahora" }, "Ahora"));
}

const clasesDe = (dia) => estado.datos.clases.filter((c) => c.inicio.startsWith(dia) && pasaFiltro(c));
const listaClases = (clases) => h("ul", { class: "lista lista--clases", role: "list" }, clases.map(clase));

function cifra(etiqueta, valor, pie, tono) {
  return h("div", { class: `cifra cifra--${tono}` },
    h("p", { class: "cifra__etiqueta" }, etiqueta), h("p", { class: "cifra__valor" }, valor), h("p", { class: "cifra__pie" }, pie));
}

function plegable(texto, n, contenido) {
  return n ? h("details", { class: "plegable" }, h("summary", {}, `${texto} (${n})`), contenido) : null;
}

// ───────────────────────────── vistas ─────────────────────────────

function vistaHoy() {
  const hoy = F.hoy();
  const manana = F.sumarDias(hoy, 1);
  const hechas = P.hechas();
  const pendientes = estado.plazos.filter((x) => pasaFiltro(x) && x.fecha && !yaPaso(x) && !hechas.has(x.id)
    && x.voluntario !== true && F.diasEntre(hoy, x.fecha) <= DIAS_HOY);
  const enSemana = pendientes.filter((x) => F.diasEntre(hoy, x.fecha) <= 7);
  const examen = estado.plazos.find((x) => x.grupo === "examen" && pasaFiltro(x) && x.fecha && !yaPaso(x));
  const clasesHoy = clasesDe(hoy);
  const clasesManana = clasesDe(manana);
  const lectivas = clasesHoy.filter((c) => c.tipo !== "evento");
  const sinFecha = estado.plazos.filter((x) => x.grupo === "entrega" && !x.fecha && pasaFiltro(x) && !hechas.has(x.id)).length;

  const diasExamen = examen && F.diasEntre(hoy, examen.fecha);
  return h("div", {},
    titulo(F.diaLargo(hoy)),
    h("div", { class: "cifras" },
      cifra("Clases hoy", lectivas.length, lectivas.length ? `de ${F.hora(lectivas[0].inicio)} a ${F.hora(lectivas.at(-1).fin)}`
        : clasesHoy.length ? `y ${clasesHoy.length} ${clasesHoy.length === 1 ? "evento" : "eventos"}` : "día libre", "azul"),
      cifra("Plazos en 7 días", enSemana.length, enSemana.length ? `el primero ${F.relativo(F.diasEntre(hoy, enSemana[0].fecha))}` : "nada a la vista", "verde"),
      cifra("Próximo examen", examen ? (diasExamen === 0 ? "hoy" : `${diasExamen} d`) : "—",
        examen ? `${nombreAsignatura(examen.asignatura)} · ${F.diaCorto(examen.fecha)}` : "sin exámenes a la vista", "rojo")),
    h("div", { class: "rejilla" },
      h("div", {},
        seccion("Clases de hoy", clasesHoy.length ? listaClases(clasesHoy) : vacio("Hoy no hay clases.")),
        seccion(`Mañana, ${F.diaCorto(manana)}`, clasesManana.length ? listaClases(clasesManana) : vacio("Mañana no hay clases."))),
      seccion(`Próximos ${DIAS_HOY} días`,
        pendientes.length ? listaPlazos(pendientes) : vacio("Nada pendiente en las próximas dos semanas."),
        sinFecha > 0 && h("p", { class: "nota" }, h("a", { href: "#entregas" }, `${sinFecha} entregas aún sin fecha`), " · revisa la pestaña Entregas."))));
}

function vistaEntregas() {
  const hechas = P.hechas();
  const todas = estado.plazos.filter((x) => x.grupo === "entrega" && pasaFiltro(x));
  const proximas = todas.filter((x) => x.fecha && !yaPaso(x) && !hechas.has(x.id));
  const sinFecha = todas.filter((x) => !x.fecha && !hechas.has(x.id));
  const cerradas = todas.filter((x) => hechas.has(x.id) || yaPaso(x)).sort((a, b) => porFecha(b, a));
  const semana = proximas.filter((x) => F.diasEntre(F.hoy(), x.fecha) <= 7).length;
  return h("div", {},
    titulo("Entregas y presentaciones", `${proximas.length} pendientes · ${semana} en los próximos 7 días`),
    seccion("Próximas", proximas.length ? listaPlazos(proximas) : vacio("No hay entregas pendientes con fecha.")),
    sinFecha.length > 0 && seccion("Sin fecha todavía",
      h("p", { class: "nota" }, "Están en Moodle pero sin fecha límite confirmada."), listaPlazos(sinFecha)),
    plegable("Pasadas y hechas", cerradas.length, listaPlazos(cerradas)));
}

function vistaExamenes() {
  const examenes = estado.plazos.filter((x) => x.grupo === "examen" && pasaFiltro(x));
  const proximos = examenes.filter((x) => !yaPaso(x));
  const pasados = examenes.filter(yaPaso).reverse();
  return h("div", {},
    titulo("Exámenes", proximos.length ? `${proximos.length} por delante` : null),
    seccion("Próximos", proximos.length ? listaPlazos(proximos) : vacio("No quedan exámenes.")),
    plegable("Pasados", pasados.length, listaPlazos(pasados)));
}

/** Lunes de la semana a mostrar por defecto: la actual, o la siguiente si ya es fin de semana. */
function semanaInicial(hoy) {
  const finDeSemana = [0, 6].includes(new Date(`${hoy}T12:00:00Z`).getUTCDay());
  return F.lunesDe(finDeSemana ? F.sumarDias(hoy, 2) : hoy);
}

function vistaHorario() {
  const hoy = F.hoy();
  estado.semana ??= semanaInicial(hoy);
  const lunes = estado.semana;
  const mover = (dias) => () => { estado.semana = dias === null ? null : F.sumarDias(lunes, dias); mostrar(false); };
  const dias = Array.from({ length: 7 }, (_, i) => F.sumarDias(lunes, i));
  const bloques = dias.map((dia) => {
    const clases = clasesDe(dia);
    const plazos = estado.plazos.filter((x) => x.fecha === dia && pasaFiltro(x));
    if (!clases.length && !plazos.length && [5, 6].includes(dias.indexOf(dia))) return null;   // fin de semana vacío
    const esHoy = dia === hoy;
    return h("section", { class: `dia${esHoy ? " dia--hoy" : ""}`, "aria-current": esHoy ? "date" : null },
      h("h3", { class: "dia__titulo" }, F.diaLargo(dia), esHoy && h("span", { class: "insignia insignia--ahora" }, "Hoy")),
      clases.length ? listaClases(clases) : vacio("Sin clases."),
      plazos.length > 0 && listaPlazos(plazos, { conFecha: false }));
  });
  return h("div", {},
    titulo("Horario", `Semana del ${F.rangoSemana(lunes)}`),
    h("div", { class: "navegar-semana", role: "group", "aria-label": "Cambiar de semana" },
      h("button", { class: "boton", type: "button", onclick: mover(-7) }, "‹ Anterior"),
      h("button", { class: "boton", type: "button", onclick: mover(null), disabled: lunes === semanaInicial(hoy),
        "aria-label": "Volver a la semana actual" }, "Hoy"),
      h("button", { class: "boton", type: "button", onclick: mover(7) }, "Siguiente ›")),
    bloques.filter(Boolean));
}

function vistaCalendario() {
  const ics = new URL("calendario.ics", location.href).href;
  const webcal = ics.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const estadoCopia = h("span", { class: "nota", role: "status" });
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(ics);
      estadoCopia.textContent = "Enlace copiado.";
    } catch {
      estadoCopia.textContent = `Cópialo a mano: ${ics}`;
    }
  };
  return h("div", {},
    titulo("Calendario", "Clases, exámenes y entregas en tu calendario, y se actualiza solo."),
    h("div", { class: "tarjeta" },
      h("ol", { class: "pasos" },
        h("li", {}, h("strong", {}, "Google Calendar (Android, web): "), "pulsa el botón y acepta añadir el calendario."),
        h("li", {}, h("strong", {}, "iPhone, Mac u Outlook: "), "pulsa “Apple / Outlook” y confirma la suscripción."),
        h("li", {}, h("strong", {}, "Otra app: "), "copia el enlace y añádelo como calendario por URL.")),
      h("div", { class: "acciones" },
        h("a", { class: "boton boton--primario", href: google, target: "_blank", rel: "noopener" }, "Añadir a Google Calendar"),
        h("a", { class: "boton", href: webcal }, "Apple / Outlook"),
        h("button", { class: "boton", type: "button", onclick: copiar }, "Copiar enlace")),
      estadoCopia),
    h("p", { class: "nota" }, "Incluye todas las asignaturas (el filtro de arriba no se aplica). Google refresca los calendarios suscritos "
      + "cada pocas horas, así que un cambio de fecha puede tardar un poco en llegar."));
}

cargar();
