// Agenda MBA ICEX: lee datos.json (lo genera pipeline/web_publica.py) y pinta la vista de la URL (#hoy, #entregas…).

import * as C from "./comunidad.js?v=12b38a024e";
import { h, urlSegura } from "./dom.js?v=12b38a024e";
import * as F from "./fechas.js?v=12b38a024e";
import * as P from "./preferencias.js?v=12b38a024e";
import { coincideFicha, ordenarSesiones, separarEvaluacion } from "./asignaturas.js?v=12b38a024e";
import { abrirPropuesta } from "./proponer.js?v=12b38a024e";
import { resolverReferencia, propuestaSinDestino } from "./referencias.js?v=12b38a024e";

const TIPOS = {
  entrega: "Entrega", presentacion: "Presentación", cuestionario: "Cuestionario", lectura: "Lectura",
  examen: "Examen", otro: "Aviso",
};
const ICONOS = { entrega: "📤", presentacion: "🎤", cuestionario: "📝", lectura: "📖", examen: "🎯", otro: "📌" };
const CANALES = { clase: "lo dijo en clase", correo: "llegó por correo", moodle: "la fecha de Moodle no es la real", otro: "otro canal" };
const HORAS_ANTIGUA = 36;     // a partir de aquí se avisa de que la agenda no se ha actualizado

// plazos: lo publicado · comunidad: propuestas en vivo · todos: ambas cosas, recalculado en cada pintado
const estado = { datos: null, asignaturas: new Map(), plazos: [], comunidad: [], todos: [], filtro: P.filtro(), semana: null,
  rango: P.rango(), busqueda: "", comunidadError: false };
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
  P.actualizarReferencias(datos.referencias ?? {});
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
  $("#pestana-asignaturas").hidden = !datos.fichas?.length;
  window.addEventListener("hashchange", () => mostrar(true));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && cargarComunidad());
  if (comunidad()) {
    const boton = $("#proponer");
    boton.hidden = false;
    boton.addEventListener("click", () => proponer());
  }
  mostrar(false);
  if (comunidad()) cargarComunidad();
}

// ───────────────────────────── propuestas de la clase ─────────────────────────────

const comunidad = () => (urlSegura(estado.datos?.comunidad?.url) ? estado.datos.comunidad : null);

/** Lee las propuestas en vivo; si la aplicación web no responde, la agenda sigue igual (sin ellas). */
async function cargarComunidad() {
  if (!comunidad()) return mostrar(false);
  try {
    estado.comunidad = await C.leer(comunidad().url);
    estado.comunidadError = false;
  } catch (error) {
    console.warn("Propuestas de la clase no disponibles:", error);
    estado.comunidadError = true;
  }
  if (!document.querySelector("dialog[open]")) mostrar(false);
}

/** Abiertas, más las ya integradas que aún no trae el datos.json publicado (para que no desaparezcan entre medias). */
function propuestasVivas() {
  const generado = Date.parse(estado.datos.generado);
  return estado.comunidad.filter((p) => ["pendiente", "en duda"].includes(p.estado)
    || (p.estado === "integrada" && Date.parse(p.cuando) > generado));
}

function todosLosPlazos() {
  const visibles = new Set(estado.plazos.map((x) => x.id));
  const nuevas = propuestasVivas().filter((p) => p.fecha && propuestaSinDestino(p, visibles, estado.datos.referencias)).map((p) => ({
    id: `p${p.id}`, fecha: p.fecha, hora: p.hora || null, asignatura: p.asignatura, titulo: p.titulo, tipo: p.tipo, propuesta: p,
    grupo: p.tipo === "examen" ? "examen" : ["entrega", "presentacion"].includes(p.tipo) ? "entrega" : "fecha",
  }));
  return [...estado.plazos, ...nuevas].sort(porFecha);
}

const correcciones = (id) => propuestasVivas().filter((p) => resolverReferencia(p.ref, estado.datos.referencias) === id);

function aviso(texto) {
  const toast = $("#toast");
  toast.textContent = texto;
  toast.hidden = false;
  clearTimeout(aviso.temporizador);
  aviso.temporizador = setTimeout(() => { toast.hidden = true; }, 5000);
}

async function votar(p, voto) {
  const antes = P.votos()[p.id] ?? 0;
  const aplicar = (de, a) => {
    p.favor += (a === 1) - (de === 1);
    p.contra += (a === -1) - (de === -1);
    P.ponerVoto(p.id, a);
  };
  aplicar(antes, voto);   // al momento; si falla, se deshace
  try {
    await C.votar(comunidad().url, p.id, P.yo().id, voto);
  } catch (error) {
    aplicar(voto, antes);
    aviso(`No se ha podido guardar tu voto: ${error.message}`);
    throw error;
  }
}

function proponer(item = null) {
  const yo = P.yo();
  abrirPropuesta({
    asignaturas: estado.asignaturas, clases: estado.datos.clases, plazos: estado.todos, filtro: estado.filtro,
    quorum: comunidad().quorum, yo, corregir: (x) => proponer(x),
    confirmar: async (p) => {
      if ((P.votos()[p.id] ?? 0) !== 1) await votar(p, 1);
      mostrar(false);
      aviso("Confirmada. ¡Gracias!");
    },
    enviar: async (propuesta) => {
      if (propuesta.nombre !== yo.nombre) P.ponerNombre(propuesta.nombre);
      const r = await C.proponer(comunidad().url, { ...propuesta, autor: yo.id });
      estado.comunidad.push({ ...propuesta, id: r.id, creada: r.creada, estado: "pendiente", cuando: "", favor: 1, contra: 0 });
      P.anadirMia(r.id);
      P.ponerVoto(r.id, 1);
      mostrar(false);
      aviso(`Propuesta enviada: ya la ve toda la clase. Queda verificada cuando la confirmen ${comunidad().quorum} compañeros.`);
    },
  }, item);
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
  const hoy = F.hoy(), hasta = F.sumarDias(hoy, 42);
  const actuales = new Set(estado.datos.clases.filter((c) => c.inicio.slice(0, 10) >= hoy && c.inicio.slice(0, 10) <= hasta).map((c) => c.asignatura));
  for (const [texto, activas] of [["Con clases próximas", true], ["Otras asignaturas", false]]) {
    const opciones = ordenadas.filter((a) => actuales.has(a.slug) === activas);
    if (opciones.length) select.append(h("optgroup", { label: texto }, opciones.map((a) => h("option", { value: a.slug }, a.corto))));
  }
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

const VISTAS = { resumen: vistaResumen, entregas: vistaEntregas, examenes: vistaExamenes, asignaturas: vistaAsignaturas, horario: vistaHorario,
  calendario: vistaCalendario, mas: vistaMas };

function mostrar(enfocar) {
  const pedida = location.hash.slice(1) === "hoy" ? "resumen" : location.hash.slice(1);   // #hoy: enlaces antiguos
  const disponible = pedida in VISTAS && (pedida !== "asignaturas" || estado.datos.fichas?.length);
  const nombre = disponible ? pedida : "resumen";
  for (const enlace of document.querySelectorAll(".pestanas a")) {
    if (enlace.dataset.vista === nombre || (enlace.dataset.vista === "mas" && ["horario", "calendario"].includes(nombre))) enlace.setAttribute("aria-current", "page");
    else enlace.removeAttribute("aria-current");
  }
  estado.todos = todosLosPlazos();
  pintar(!["calendario", "mas"].includes(nombre) && avisoFiltro(),
    estado.comunidadError && h("p", { class: "aviso", role: "status" },
      "Las propuestas de compañeros no están disponibles ahora. Las fechas de la agenda siguen visibles. ",
      h("button", { class: "enlace-boton", type: "button", onclick: () => cargarComunidad() }, "Reintentar")), VISTAS[nombre]());
  document.title = `${$(`.pestanas a[data-vista="${nombre}"]`).textContent.trim()} · Agenda MBA ICEX`;
  // Al cambiar de sección con el teclado o un lector de pantalla, el foco va al título de la nueva vista
  if (enfocar) {
    window.scrollTo(0, 0);
    $("#vista h2")?.focus({ preventScroll: true });
  }
}

function pintar(...nodos) {
  const vista = $("#vista");
  vista.replaceChildren(...nodos.filter(Boolean));
  vista.setAttribute("aria-busy", "false");
}

function vistaMas() {
  return h("div", {}, titulo("Más", "Horario y calendario de la agenda"),
    h("ul", { class: "menu-secciones" },
      h("li", {}, h("a", { href: "#horario" }, h("strong", {}, "Horario"),
        h("span", {}, "Clases y preparación de cada semana"), h("span", { class: "menu-secciones__flecha", "aria-hidden": "true" }, "›"))),
      h("li", {}, h("a", { href: "#calendario" }, h("strong", {}, "Calendario"),
        h("span", {}, "Suscribirte a los plazos y las clases"), h("span", { class: "menu-secciones__flecha", "aria-hidden": "true" }, "›")))));
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

/** "✓ Me consta / ✗ No es así" de una propuesta. Al votar solo se repinta este bloque, así el foco no salta. */
function votacion(p) {
  const caja = h("div", { class: "votacion" });
  const pintarCaja = () => {
    const q = comunidad()?.quorum ?? 2;
    const situacion = C.situacion(p, q);
    const mio = P.votos()[p.id] ?? 0;
    const mia = P.mias().has(p.id);
    const texto = situacion === "verificada"
      ? (p.estado === "integrada" ? "✓ Verificada por la clase" : "✓ Verificada por la clase · llega al calendario en unos minutos")
      : situacion === "en duda" ? "En duda: hay compañeros que dicen que no es así"
        : `Por confirmar · ${Math.min(p.favor, q)} de ${q} confirmaciones${mia ? " · es tuya" : ""}`;
    const boton = (voto, etiqueta, n) => h("button", {
      class: `voto voto--${voto === 1 ? "si" : "no"}`, type: "button", "aria-pressed": String(mio === voto),
      onclick: async () => {
        try {
          await votar(p, mio === voto ? 0 : voto);   // pulsar otra vez quita el voto
        } catch { /* ya avisado */ }
        pintarCaja();
        (caja.querySelector(`.voto--${voto === 1 ? "si" : "no"}`) ?? caja.querySelector(".votacion__estado"))?.focus();
      },
    }, etiqueta, h("span", { class: "voto__n" }, n));
    caja.replaceChildren(
      h("p", { class: `votacion__estado votacion__estado--${situacion.replace(" ", "-")}`, tabindex: "-1" }, texto),
      situacion !== "verificada" && !mia && h("div", { class: "votacion__botones", role: "group", "aria-label": `¿Te consta? ${p.titulo}` },
        boton(1, "✓ Me consta", p.favor), boton(-1, "✗ No es así", p.contra)));
  };
  pintarCaja();
  return caja;
}

function correccion(p) {
  return h("div", { class: "correccion" },
    h("p", {}, "Propuesta de cambio: ", h("strong", {}, `${F.diaCorto(p.fecha)}${p.hora ? ` · ${p.hora}` : ""}`),
      ` (${CANALES[p.canal] ?? p.canal})`),
    p.detalle && h("p", { class: "correccion__detalle" }, p.detalle),
    votacion(p));
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
  const p = x.propuesta;
  const corregir = comunidad() && !p && /^[mh]\d+$/.test(x.id);
  const relacionadas = (estado.datos.relacionados ?? []).filter((g) => g.includes(x.id))
    .flatMap((g) => g).filter((id) => id !== x.id)
    .map((id) => estado.plazos.find((item) => item.id === id)).filter(Boolean);
  const meta = [
    etiquetaAsignatura(x.asignatura),
    x.grupo !== "examen" && x.tipo !== "entrega" && (TIPOS[x.tipo] ?? x.tipo),
    x.hora && x.hora !== "00:00" && `${x.grupo === "entrega" ? "hasta" : "a"} las ${x.hora}`,
    x.hora === "00:00" && `hasta las 00:00 (la noche del ${F.diaCorto(diaLimite(x))})`,
    x.fecha_moodle && h("span", { class: "aviso-moodle" }, `en Moodle pone ${F.diaCorto(x.fecha_moodle)}${
      x.fecha_moodle.slice(11, 16) ? ` ${x.fecha_moodle.slice(11, 16)}` : ""}`),
    x.peso && h("span", { class: "etiqueta-mini" }, `${x.peso} de la nota`),
    x.voluntario && h("span", { class: "etiqueta-mini" }, "voluntaria"),
    p && `${p.ref ? "corrección pendiente de revisión" : "propuesta de la clase"} (${CANALES[p.canal] ?? p.canal})`,
  ].filter(Boolean);
  const clases = ["plazo", !conFecha && "plazo--sin-caja", hecha && "es-hecha", yaPaso(x) && "es-pasada",
    p && `es-propuesta es-propuesta--${C.situacion(p, comunidad()?.quorum ?? 2).replace(" ", "-")}`];
  return h("li", { class: clases.filter(Boolean).join(" "), style: color(x.asignatura) },
    conFecha && cajaFecha(x.fecha),
    h("div", { class: "plazo__cuerpo" },
      h("p", { class: "plazo__titulo" }, h("span", { class: "icono", "aria-hidden": "true" }, ICONOS[x.tipo] ?? "📌"), x.titulo),
      h("p", { class: "plazo__meta" }, meta.flatMap((m, i) => (i ? [h("span", { class: "sep", "aria-hidden": "true" }, "·"), m] : [m]))),
      relacionadas.length > 0 && h("details", { class: "plazo__relacionados" },
        h("summary", {}, "Otra tarea del mismo caso"),
        relacionadas.map((r) => h("p", { class: "nota" },
          `${TIPOS[r.tipo]}: ${r.titulo} · ${r.fecha ? F.diaCorto(r.fecha) : "sin fecha confirmada"}`,
          r.hora && ` ${r.hora}`, hechas.has(r.id) && " · hecha"))),
      (url || corregir) && h("p", { class: "plazo__enlaces" },
        url && h("a", { class: "enlace-ext", href: url, target: "_blank", rel: "noopener" }, "Abrir en Moodle",
          h("span", { class: "sr" }, " (se abre en otra pestaña)")),
        corregir && (x.fecha
          ? h("button", { class: "enlace-boton enlace-boton--suave", type: "button", onclick: () => proponer(x) },
            "📅 Cambiar fecha", h("span", { class: "sr" }, ` Proponer otra fecha para ${x.titulo}`))
          : h("button", { class: "boton boton--pequeno", type: "button", onclick: () => proponer(x) },
            "📅 Poner fecha", h("span", { class: "sr" }, ` a ${x.titulo}`)))),
      p ? (p.detalle && h("p", { class: "correccion__detalle" }, p.detalle)) : null,
      p ? votacion(p) : correcciones(x.id).map(correccion)),
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

/** Reparte los plazos de un día entre sus clases: misma asignatura y, si tienen hora, durante la clase. Las lecturas
 * y tareas "para la sesión" van con su clase; lo demás (p. ej. una entrega a las 23:59) queda suelto. */
function repartir(clases, items) {
  const porClase = new Map(clases.map((c) => [c, []]));
  const sueltos = [];
  for (const x of items) {
    const suyas = clases.filter((c) => c.asignatura && c.asignatura === x.asignatura && c.tipo !== "evento");
    const durante = suyas.find((c) => x.hora && F.hora(c.inicio) <= x.hora && x.hora <= F.hora(c.fin));
    const destino = durante ?? (!x.hora || x.grupo === "fecha" ? suyas[0] : undefined);
    if (destino) porClase.get(destino).push(x);
    else sueltos.push(x);
  }
  return { porClase, sueltos };
}

function preparacion(items, hechas, titulo = "Para esta clase", conHora = false) {
  const verbo = (x) => (x.tipo === "presentacion" ? "Presentas" : x.grupo === "entrega" ? "Entregas"
    : x.tipo === "lectura" ? "Leer" : x.grupo === "examen" ? "Examen" : "Preparar");
  return h("div", { class: "preparacion" },
    h("p", { class: "preparacion__titulo" }, titulo),
    h("ul", { role: "list" }, items.map((x) => {
      const hecha = hechas.has(x.id);
      return h("li", { class: `preparacion__item${hecha ? " es-hecha" : ""}` },
        h("label", {},
          h("input", { type: "checkbox", checked: hecha, "aria-label": `Hecho: ${x.titulo}`, onchange: (ev) => {
            P.marcarHecha(x.id, ev.target.checked);
            ev.target.closest(".preparacion__item").classList.toggle("es-hecha", ev.target.checked);
          } }),
          h("span", { class: "preparacion__contenido" },
            h("span", { class: "preparacion__cabeza" },
              h("span", { class: `preparacion__verbo preparacion__verbo--${x.grupo}` }, verbo(x)),
              conHora && h("span", { class: "preparacion__hora" }, x.hora && x.hora !== "00:00" ? `hasta ${x.hora}` : "sin hora"),
              conHora && etiquetaAsignatura(x.asignatura)),
          // Dentro de su clase sobra el "Sesión 2 (…):" del principio
          h("span", { class: "preparacion__texto" }, x.titulo.replace(/^(antes de (la )?)?sesi[oó]n \d+[^:]{0,60}:\s*/i, "").replace(/^./, (c) => c.toUpperCase()),
            x.propuesta && h("span", { class: "etiqueta-mini" }, "por confirmar")))));
    })));
}

function clase(c, deberes = [], hechas = P.hechas()) {
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
      detalle && h("p", { class: "clase__meta" }, detalle),
      deberes.length > 0 && preparacion(deberes, hechas),
      materialesClase(c)),
    enCurso && h("span", { class: "insignia insignia--ahora" }, "Ahora"));
}

const clasesDe = (dia) => estado.datos.clases.filter((c) => c.inicio.startsWith(dia) && pasaFiltro(c));
const listaClases = (clases, porClase = new Map(), hechas = P.hechas()) =>
  h("ul", { class: "lista lista--clases", role: "list" }, clases.map((c) => clase(c, porClase.get(c) ?? [], hechas)));

function etiquetaDia(dia, hoy) {
  const d = F.diasEntre(hoy, dia);
  return d === 0 ? `Hoy · ${F.diaLargo(dia)}` : d === 1 ? `Mañana · ${F.diaLargo(dia)}` : F.diaLargo(dia);
}

/** Un día: sus clases, cada una con lo que hay que preparar, y debajo lo que vence ese día sin clase asociada.
 * soloPendiente: oculta lo que ya ha terminado (y devuelve null si no queda nada) · omitirVacio: sin "Sin clases." */
function bloqueDia(dia, hoy, { soloPendiente = false, omitirVacio = false } = {}) {
  const hechas = P.hechas();
  const ahora = F.ahora();
  const todas = clasesDe(dia);
  const terminadas = soloPendiente ? todas.filter((c) => c.fin.slice(0, 16) <= ahora) : [];
  const clases = todas.filter((c) => !terminadas.includes(c));
  const examenesHorario = new Set(todas.filter((c) => c.tipo === "examen").map((c) => c.asignatura));
  const items = estado.todos.filter((x) => x.fecha === dia && pasaFiltro(x) && !(soloPendiente && (yaPaso(x) || hechas.has(x.id)))
    && !(x.grupo === "examen" && examenesHorario.has(x.asignatura)));
  const finde = [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
  if (!clases.length && !items.length && (finde || omitirVacio || soloPendiente)) return null;
  const { porClase, sueltos } = repartir(clases, items);
  const esHoy = dia === hoy;
  return h("section", { class: `dia${esHoy ? " dia--hoy" : ""}`, "aria-current": esHoy ? "date" : null },
    h("h3", { class: "dia__titulo" }, etiquetaDia(dia, hoy)),
    terminadas.length > 0 && h("p", { class: "dia__terminadas" }, "Ya han terminado: ",
      terminadas.map((c) => `${F.hora(c.inicio)} ${c.asignatura ? nombreAsignatura(c.asignatura) : c.tema}`).join(" · ")),
    clases.length ? listaClases(clases, porClase, hechas) : !sueltos.length && vacio("Sin clases."),
    sueltos.length > 0 && h("div", { class: "dia__sueltos" },
      preparacion(sueltos.sort(porFecha), hechas, clases.length ? "Además, este día" : "Este día", true)));
}

function cifra(etiqueta, valor, pie, tono) {
  return h("div", { class: `cifra cifra--${tono}` },
    h("p", { class: "cifra__etiqueta" }, etiqueta), h("p", { class: "cifra__valor" }, valor), h("p", { class: "cifra__pie" }, pie));
}

function plegable(texto, n, contenido) {
  return n ? h("details", { class: "plegable" }, h("summary", {}, `${texto} (${n})`), contenido) : null;
}

// ───────────────────────────── vistas ─────────────────────────────

function vistaResumen() {
  const hoy = F.hoy();
  const ahora = F.ahora();
  const hechas = P.hechas();
  const lunes = F.lunesDe(hoy);
  const lunesSiguiente = F.sumarDias(lunes, 7);
  const dowHoy = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7;   // 0 = lunes

  const proxima = estado.datos.clases.find((c) => c.tipo !== "evento" && pasaFiltro(c) && c.fin.slice(0, 16) > ahora);
  const entregas = estado.todos.filter((x) => x.grupo === "entrega" && pasaFiltro(x) && x.fecha && !yaPaso(x)
    && !hechas.has(x.id) && x.voluntario !== true);
  const en7 = entregas.filter((x) => F.diasEntre(hoy, x.fecha) <= 7);
  const examen = estado.todos.find((x) => !x.propuesta && x.grupo === "examen" && pasaFiltro(x) && x.fecha && !yaPaso(x));
  const diasExamen = examen && F.diasEntre(hoy, examen.fecha);

  let cuandoProxima = "—";
  if (proxima) {
    const d = F.diasEntre(hoy, proxima.inicio.slice(0, 10));
    cuandoProxima = proxima.inicio.slice(0, 16) <= ahora ? "ahora" : d === 0 ? F.hora(proxima.inicio)
      : d === 1 ? `mañana ${F.hora(proxima.inicio)}` : `${F.partesDia(proxima.inicio).semana} ${F.hora(proxima.inicio)}`;
  }

  const dias = (desde, n) => Array.from({ length: n }, (_, i) => F.sumarDias(desde, i));
  // Esta semana: lo que queda de hoy y los días que faltan hasta el domingo, solo con contenido
  const estaSemana = [bloqueDia(hoy, hoy, { soloPendiente: true }),
    ...dias(F.sumarDias(hoy, 1), 6 - dowHoy).map((d) => bloqueDia(d, hoy, { omitirVacio: true }))].filter(Boolean);
  const siguiente = dias(lunesSiguiente, 7).map((d) => bloqueDia(d, hoy)).filter(Boolean);
  const clasesSiguiente = dias(lunesSiguiente, 7).reduce((n, d) => n + clasesDe(d).filter((c) => c.tipo !== "evento").length, 0);
  const entregasSiguiente = entregas.filter((x) => x.fecha >= lunesSiguiente && x.fecha <= F.sumarDias(lunesSiguiente, 6)).length;
  const resumenSiguiente = `${clasesSiguiente} ${clasesSiguiente === 1 ? "clase" : "clases"} · ${entregasSiguiente} `
    + `${entregasSiguiente === 1 ? "entrega" : "entregas"}`;

  return h("div", {},
    titulo(F.diaLargo(hoy)),
    h("div", { class: "cifras" },
      cifra("Próxima clase", cuandoProxima,
        proxima ? [proxima.asignatura ? nombreAsignatura(proxima.asignatura) : proxima.tema, proxima.sesion && `S${proxima.sesion}`,
          proxima.aula].filter(Boolean).join(" · ") : "no quedan clases", "azul"),
      cifra("Entregas · 7 días", en7.length,
        en7.length ? `la primera ${F.relativo(F.diasEntre(hoy, en7[0].fecha))}` : "ninguna pendiente", "verde"),
      cifra("Próximo examen", examen ? (diasExamen === 0 ? "hoy" : `${diasExamen} d`) : "—",
        examen ? `${nombreAsignatura(examen.asignatura)} · ${F.diaCorto(examen.fecha)}` : "sin exámenes a la vista", "rojo")),
    h("div", { class: "rejilla" },
      h("div", {},
        h("section", { class: "seccion" },
          h("h3", { class: "seccion__titulo seccion__titulo--grande" }, "Esta semana"),
          estaSemana.length ? estaSemana : h("div", { class: "tarjeta tarjeta--suave" },
            h("p", {}, h("strong", {}, "Esta semana ya no queda nada pendiente. "),
              `La semana que viene tienes ${resumenSiguiente}.`))),
        h("details", { class: "plegable plegable--semana", open: dowHoy >= 3 || !estaSemana.length },
          h("summary", {}, `La semana que viene · ${F.rangoSemana(lunesSiguiente)}`,
            h("span", { class: "plegable__resumen" }, resumenSiguiente)),
          siguiente.length ? siguiente : vacio("Sin clases."))),
      h("aside", { class: "lateral", "aria-label": "Próximas entregas" },
        seccion("Próximas entregas",
          entregas.length ? listaPlazos(entregas.slice(0, 6)) : vacio("Nada pendiente."),
          entregas.length > 6 && h("p", { class: "nota" }, h("a", { href: "#entregas" }, `Ver las ${entregas.length} entregas pendientes`)),
          comunidad() && h("p", { class: "nota" }, "¿Falta algo? ",
            h("button", { class: "enlace-boton", type: "button", onclick: () => proponer() }, "Propón una entrega o fecha"))))));
}

const RANGOS = [["7", "7 días"], ["14", "14 días"], ["30", "30 días"], ["todo", "Todo"], ["elegir", "Elegir fechas"]];

function limitesRango(r, hoy) {
  if (r.tipo === "todo") return [hoy, "9999-12-31"];
  if (r.tipo === "elegir") return [r.desde || hoy, r.hasta || "9999-12-31"];
  return [hoy, F.sumarDias(hoy, Number(r.tipo))];
}

function textoRango(r, hoy) {
  if (r.tipo === "todo") return "Todas las pendientes";
  if (r.tipo === "elegir") {
    const [desde, hasta] = limitesRango(r, hoy);
    return hasta.startsWith("9999") ? `Desde el ${F.diaCorto(desde)}` : `Del ${F.diaCorto(desde)} al ${F.diaCorto(hasta)}`;
  }
  return `Próximos ${r.tipo} días`;
}

/** Botones de plazo (7/14/30 días, todo o fechas a elegir); la elección se recuerda entre visitas. */
function barraRango() {
  const r = estado.rango;
  const cambiar = (nuevo, enfocar) => {
    estado.rango = nuevo;
    P.ponerRango(nuevo);
    mostrar(false);
    document.querySelector(enfocar)?.focus();
  };
  return h("div", { class: "barra-rango" },
    h("div", { class: "barra-rango__opciones", role: "group", "aria-label": "Qué plazos mostrar" },
      RANGOS.map(([tipo, texto]) => h("button", {
        class: "chip", type: "button", "aria-pressed": String(r.tipo === tipo), "data-rango": tipo,
        onclick: () => cambiar({ ...r, tipo }, `[data-rango="${tipo}"]`),
      }, texto))),
    r.tipo === "elegir" && h("div", { class: "barra-rango__fechas" },
      h("label", {}, "Desde", h("input", { type: "date", value: r.desde || F.hoy(), "data-campo": "desde",
        onchange: (ev) => cambiar({ ...r, desde: ev.target.value }, '[data-campo="desde"]') })),
      h("label", {}, "Hasta", h("input", { type: "date", value: r.hasta || "", min: r.desde || F.hoy(), "data-campo": "hasta",
        onchange: (ev) => cambiar({ ...r, hasta: ev.target.value }, '[data-campo="hasta"]') }))));
}

function vistaEntregas() {
  const hoy = F.hoy();
  const hechas = P.hechas();
  const todas = estado.todos.filter((x) => x.grupo === "entrega" && pasaFiltro(x));
  const pendientes = todas.filter((x) => x.fecha && !yaPaso(x) && !hechas.has(x.id));
  const [desde, hasta] = limitesRango(estado.rango, hoy);
  // Con fechas elegidas a mano también puede mirarse atrás (lo ya pasado sin marcar como hecho)
  const enRango = todas.filter((x) => x.fecha && x.fecha >= desde && x.fecha <= hasta && !hechas.has(x.id)
    && (estado.rango.tipo === "elegir" || !yaPaso(x)));
  const despues = pendientes.filter((x) => x.fecha > hasta);
  const sinFecha = todas.filter((x) => !x.fecha && !hechas.has(x.id));
  const cerradas = todas.filter((x) => hechas.has(x.id) || yaPaso(x)).sort((a, b) => porFecha(b, a));
  const domingo = F.sumarDias(F.lunesDe(hoy), 6);
  const domingoSiguiente = F.sumarDias(domingo, 7);
  const tramos = [
    ["Pasadas", enRango.filter((x) => yaPaso(x))],
    ["Esta semana", enRango.filter((x) => !yaPaso(x) && x.fecha <= domingo)],
    [`La semana que viene · ${F.rangoSemana(F.sumarDias(domingo, 1))}`, enRango.filter((x) => x.fecha > domingo && x.fecha <= domingoSiguiente)],
    ["Más adelante", enRango.filter((x) => x.fecha > domingoSiguiente)],
  ].filter(([, items]) => items.length);
  const siguienteFuera = despues[0];

  return h("div", {},
    titulo("Entregas y presentaciones", [`${todas.length} tareas en total`, `${pendientes.length} pendientes`, sinFecha.length && `${sinFecha.length} sin fecha`]
      .filter(Boolean).join(" · ")),
    comunidad() && h("details", { class: "ayuda-plazos" },
      h("summary", {}, "¿Falta una entrega o un plazo está mal?"),
      h("p", {}, "Usa «Proponer» para añadir una tarea o «Cambiar fecha» en la entrega. "
        + "Puedes indicar lo que dijo el profesor en clase, por correo o una corrección a Moodle. "
        + "La propuesta se ve al momento y se verifica cuando la confirman otros compañeros.")),
    barraRango(),
    h("p", { class: "resumen-rango", "aria-live": "polite" },
      h("strong", {}, textoRango(estado.rango, hoy)), `: ${enRango.length} ${enRango.length === 1 ? "entrega" : "entregas"}`),
    tramos.length ? tramos.map(([nombre, items]) =>
      seccion(h("span", {}, nombre, h("span", { class: "contador" }, items.length)), listaPlazos(items)))
      : h("div", { class: "tarjeta tarjeta--suave" },
        h("p", {}, "No hay entregas pendientes en este plazo.",
          siguienteFuera && ` La siguiente es «${siguienteFuera.titulo}», ${F.relativo(F.diasEntre(hoy, siguienteFuera.fecha))} (${F.diaCorto(siguienteFuera.fecha)}).`),
        siguienteFuera && h("button", { class: "boton boton--pequeno", type: "button",
          onclick: () => { estado.rango = { tipo: "todo" }; P.ponerRango(estado.rango); mostrar(false); } }, "Ver todas")),
    despues.length > 0 && tramos.length > 0 && h("p", { class: "nota" }, `Y ${despues.length} más adelante. `,
      h("button", { class: "enlace-boton", type: "button",
        onclick: () => { estado.rango = { tipo: "todo" }; P.ponerRango(estado.rango); mostrar(false); } }, "Ver todas")),
    sinFecha.length > 0 && seccion(h("span", {}, "Sin fecha todavía", h("span", { class: "contador" }, sinFecha.length)),
      h("p", { class: "nota" }, comunidad()
        ? "Entregas documentadas con fecha pendiente de confirmar. Si conoces el plazo real, pulsa «Poner fecha»: lo verá toda la clase."
        : "Entregas documentadas con fecha pendiente de confirmar."),
      listaPlazos(sinFecha)),
    plegable("Pasadas y hechas", cerradas.length, listaPlazos(cerradas)));
}

function vistaExamenes() {
  const examenes = estado.todos.filter((x) => x.grupo === "examen" && pasaFiltro(x));
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
  const bloques = dias.map((dia) => bloqueDia(dia, hoy));
  return h("div", {},
    titulo("Horario", `Semana del ${F.rangoSemana(lunes)}`),
    h("div", { class: "navegar-semana", role: "group", "aria-label": "Cambiar de semana" },
      h("button", { class: "boton", type: "button", onclick: mover(-7) }, "‹ Anterior"),
      h("button", { class: "boton", type: "button", onclick: mover(null), disabled: lunes === semanaInicial(hoy),
        "aria-label": "Volver a la semana actual" }, "Hoy"),
      h("button", { class: "boton", type: "button", onclick: mover(7) }, "Siguiente ›")),
    bloques.filter(Boolean));
}

// ───────────────────────────── asignaturas (fichas de los documentos de Moodle y la guía) ─────────────────────────────

const IMPORTANCIAS = [["imprescindible", "Imprescindibles"], ["examen", "Para el examen"], ["consulta", "De consulta"]];

function enlaceDocumento(d) {
  const url = urlSegura(d.url);
  return url ? h("a", { href: url, target: "_blank", rel: "noopener" }, d.titulo, h("span", { class: "sr" }, " (Moodle, se abre en otra pestaña)"))
    : h("span", {}, d.titulo);
}

function materialesClase(c) {
  const f = estado.datos.fichas?.find((x) => x.slug === c.asignatura);
  const sesion = f?.sesiones.find((x) => x.n === c.sesion);
  if (!sesion || c.tipo !== "clase") return null;
  const docs = sesion.documentos.map((i) => f.documentos[i]).filter(Boolean).slice(0, 3);
  return h("div", { class: "materiales-clase" },
    docs.length > 0 && h("p", {}, "Material: ", docs.map((d, i) => [i ? " · " : "", enlaceDocumento(d)])),
    h("a", { href: "#asignaturas", onclick: () => {
      estado.filtro = c.asignatura;
      $("#filtro").value = c.asignatura;
      estado.busqueda = "";
    } }, "Ver preparación y ficha"));
}

function evaluacion(f) {
  const ev = f.evaluacion;
  const { ordinaria, otras } = separarEvaluacion(ev.componentes);
  const tabla = (componentes) => h("table", { class: "tabla-ev" },
    h("caption", { class: "sr" }, `Evaluación de ${nombreAsignatura(f.slug)}`),
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Qué"), h("th", { scope: "col" }, "Peso"), h("th", { scope: "col" }, "Detalle"))),
    h("tbody", {}, componentes.map((c) => h("tr", {}, h("td", {}, c.elemento), h("td", {}, c.peso || "—"), h("td", {}, c.detalle)))));
  return h("div", {},
    ordinaria.length ? tabla(ordinaria)
      : h("p", { class: "nota" }, "Evaluación pendiente de identificar. Consulta el syllabus en Moodle."),
    otras.length > 0 && h("details", { class: "plegable" }, h("summary", {}, "Otras convocatorias"), tabla(otras)),
    ev.fuente && h("p", { class: "nota" }, `Según ${ev.fuente}.`),
    ev.avisos.map((a) => h("p", { class: "aviso-ev" }, `⚠ ${a}`)),
    f.criterios.map((c) => h("p", { class: "nota" }, "Cómo se corrige ", c.url ? enlaceDocumento({ titulo: c.documento, url: c.url }) : c.documento,
      `: ${c.criterios.join(" · ")}`)));
}

function sesionAsignatura(f, s, hoy) {
  const docs = s.documentos.map((i) => f.documentos[i]).filter(Boolean);
  const tareas = [
    ...s.lecturas.map((x) => [x.obligatoria ? "📖 Leer" : "📖 Recomendado", x.que, false]),
    ...s.preparar.map((x) => [x.entregable ? "📤 Entregar" : "✏️ Preparar", x.que, x.grupo]),
  ];
  return h("li", { class: `sesion-asig${s.fecha === hoy ? " es-hoy" : ""}` },
    h("p", { class: "sesion-asig__cabeza" }, h("strong", {}, `S${s.n}`), ` · ${F.diaCorto(s.fecha)}`,
      s.fecha === hoy && h("span", { class: "insignia insignia--ahora" }, "Hoy")),
    s.contenido && h("p", { class: "sesion-asig__contenido" }, s.contenido),
    tareas.length > 0 && h("ul", { class: "sesion-asig__tareas", role: "list" }, tareas.map(([verbo, que, grupo]) =>
      h("li", {}, h("span", { class: "sesion-asig__verbo" }, verbo), ` ${que}`, grupo ? " (en grupo)" : ""))),
    docs.length > 0 && h("p", { class: "sesion-asig__docs" }, "📄 ", docs.map((d, i) => [i ? " · " : "", enlaceDocumento(d)])));
}

function fichaAsignatura(f, hoy, abierta) {
  const examen = estado.datos.examenes.find((x) => x.asignatura === f.slug && x.fecha >= hoy);
  const pesos = separarEvaluacion(f.evaluacion.componentes).ordinaria.filter((c) => c.peso).slice(0, 3).map((c) => `${c.elemento} ${c.peso}`);
  const { proximas, pasadas } = ordenarSesiones(f.sesiones, hoy);
  const sesiones = (lista) => h("ol", { class: "lista-sesiones", role: "list" }, lista.map((s) => sesionAsignatura(f, s, hoy)));
  return h("details", { class: "asig", "data-asignatura": f.slug, style: color(f.slug), open: abierta },
    h("summary", { class: "asig__cabeza" },
      h("span", { class: "asig__nombre" }, nombreAsignatura(f.slug)),
      h("span", { class: "asig__resumen" }, [examen && `${examen.titulo} ${F.diaCorto(examen.fecha)}`, ...pesos].filter(Boolean).join(" · ")
        || "Sin detalles de evaluación")),
    h("div", { class: "asig__cuerpo" },
      f.cobertura?.pendientes > 0 && h("p", { class: "aviso cobertura", role: "status" },
        `Ficha en preparación: ${f.cobertura.leidas} de ${f.cobertura.total} fuentes leídas. Faltan ${f.cobertura.pendientes}; algunos apartados pueden estar incompletos.`),
      seccion("Cómo se evalúa", evaluacion(f)),
      seccion("Próximas sesiones", proximas.length ? sesiones(proximas.slice(0, 3)) : vacio("No quedan sesiones."),
        plegable("Más sesiones", Math.max(0, proximas.length - 3), sesiones(proximas.slice(3))),
        plegable("Sesiones pasadas", pasadas.length, sesiones(pasadas))),
      (f.sin_sesion?.lecturas.length > 0 || f.sin_sesion?.preparar.length > 0) && seccion("Preparación sin sesión asignada",
        h("ul", { class: "puntos" }, [...f.sin_sesion.lecturas, ...f.sin_sesion.preparar].map((x) => h("li", {}, x.que)))),
      seccion("Documentos", IMPORTANCIAS.map(([clave, nombre]) => {
        const docs = f.documentos.filter((d) => d.importancia === clave);
        return docs.length > 0 && h("div", { class: "grupo-docs" }, h("h4", { class: "grupo-docs__titulo" }, nombre),
          h("ul", { class: "lista-docs", role: "list" }, docs.map((d) => h("li", {},
            h("p", { class: "lista-docs__titulo" }, enlaceDocumento(d)),
            h("p", { class: "lista-docs__que" }, d.que_es),
            (d.sesiones.length > 0 || d.idioma === "en") && h("p", { class: "lista-docs__meta" },
              [d.sesiones.length && `Sesión ${d.sesiones.join(", ")}`, d.idioma === "en" && "en inglés"].filter(Boolean).join(" · "))))));
      })),
      f.normas.length > 0 && seccion("Normas", h("ul", { class: "puntos" }, f.normas.map((n) => h("li", {}, n))))));
}

function vistaAsignaturas() {
  const hoy = F.hoy();
  const fichas = estado.datos.fichas.filter((f) => !estado.filtro || f.slug === estado.filtro);
  const tarjetas = h("div", { class: "asignaturas" }, fichas.map((f) => fichaAsignatura(f, hoy, fichas.length === 1)));
  const vacia = h("p", { class: "vacio", role: "status", hidden: true }, "No hay coincidencias. Prueba otro término o quita el filtro.");
  const recuento = h("p", { class: "nota", "aria-live": "polite" });
  const buscar = (texto) => {
    estado.busqueda = texto;
    let n = 0;
    for (const tarjeta of tarjetas.children) {
      const f = fichas.find((x) => x.slug === tarjeta.dataset.asignatura);
      tarjeta.hidden = !coincideFicha(f, texto, nombreAsignatura(f.slug));
      if (!tarjeta.hidden) {
        n += 1;
        if (texto.trim()) tarjeta.open = true;
      }
    }
    vacia.hidden = n > 0;
    recuento.textContent = `${n} ${n === 1 ? "asignatura" : "asignaturas"} · busca un documento, caso, lectura o tema`;
  };
  const input = h("input", { type: "search", id: "buscar-material", value: estado.busqueda, placeholder: "Ej. caso, elasticidad, Tema 2…",
    oninput: (e) => buscar(e.target.value) });
  buscar(estado.busqueda);
  return h("div", {},
    titulo("Asignaturas", "Evaluación, preparación de las próximas clases y materiales de Moodle."),
    h("label", { class: "buscador", for: "buscar-material" }, "Buscar en los materiales", input), recuento,
    fichas.length ? [tarjetas, vacia] : vacio("No hay ficha de esta asignatura todavía."),
    h("p", { class: "nota" }, "Fuentes: documentos de Moodle y guía del máster. Los enlaces piden iniciar sesión en Moodle."));
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
    h("p", { class: "nota" }, "Incluye todas las asignaturas (el filtro de arriba no se aplica). Lo marcado con ❓ lo ha propuesto "
      + "un compañero y aún no está verificado. Google refresca los calendarios suscritos cada pocas horas, así que un cambio "
      + "de fecha puede tardar un poco en llegar."));
}

cargar();
