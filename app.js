// Agenda MBA ICEX: lee datos.json (lo genera pipeline/web_publica.py) y pinta la vista de la URL (#hoy, #entregas…).

import * as C from "./comunidad.js?v=4a41ae9cdf";
import { h, urlSegura } from "./dom.js?v=4a41ae9cdf";
import * as F from "./fechas.js?v=4a41ae9cdf";
import * as P from "./preferencias.js?v=4a41ae9cdf";
import { abrirPropuesta } from "./proponer.js?v=4a41ae9cdf";

const TIPOS = {
  entrega: "Entrega", presentacion: "Presentación", cuestionario: "Cuestionario", lectura: "Lectura",
  examen: "Examen", otro: "Aviso",
};
const ICONOS = { entrega: "📤", presentacion: "🎤", cuestionario: "📝", lectura: "📖", examen: "🎯", otro: "📌" };
const CANALES = { clase: "lo dijo en clase", correo: "llegó por correo", moodle: "la fecha de Moodle no es la real", otro: "otro canal" };
const HORAS_ANTIGUA = 36;     // a partir de aquí se avisa de que la agenda no se ha actualizado

// plazos: lo publicado · comunidad: propuestas en vivo · todos: ambas cosas, recalculado en cada pintado
const estado = { datos: null, asignaturas: new Map(), plazos: [], comunidad: [], todos: [], filtro: P.filtro(), semana: null };
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
  } catch (error) {
    console.warn("Propuestas de la clase no disponibles:", error);
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
  const nuevas = propuestasVivas().filter((p) => !p.ref && p.fecha).map((p) => ({
    id: `p${p.id}`, fecha: p.fecha, hora: p.hora || null, asignatura: p.asignatura, titulo: p.titulo, tipo: p.tipo, propuesta: p,
    grupo: p.tipo === "examen" ? "examen" : ["entrega", "presentacion"].includes(p.tipo) ? "entrega" : "fecha",
  }));
  return [...estado.plazos, ...nuevas].sort(porFecha);
}

const correcciones = (id) => propuestasVivas().filter((p) => p.ref === id);

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
  estado.todos = todosLosPlazos();
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
  const corregir = comunidad() && !p && !yaPaso(x) && /^[mh]\d+$/.test(x.id);
  const meta = [
    etiquetaAsignatura(x.asignatura),
    x.grupo !== "examen" && x.tipo !== "entrega" && (TIPOS[x.tipo] ?? x.tipo),
    x.hora && x.hora !== "00:00" && `${x.grupo === "entrega" ? "hasta" : "a"} las ${x.hora}`,
    x.hora === "00:00" && `hasta las 00:00 (la noche del ${F.diaCorto(diaLimite(x))})`,
    x.fecha_moodle && h("span", { class: "aviso-moodle" }, `en Moodle pone ${F.diaCorto(x.fecha_moodle)}${
      x.fecha_moodle.slice(11, 16) ? ` ${x.fecha_moodle.slice(11, 16)}` : ""}`),
    x.peso && h("span", { class: "etiqueta-mini" }, `${x.peso} de la nota`),
    x.voluntario && h("span", { class: "etiqueta-mini" }, "voluntaria"),
    p && `propuesta de la clase (${CANALES[p.canal] ?? p.canal})`,
  ].filter(Boolean);
  const clases = ["plazo", !conFecha && "plazo--sin-caja", hecha && "es-hecha", yaPaso(x) && "es-pasada",
    p && `es-propuesta es-propuesta--${C.situacion(p, comunidad()?.quorum ?? 2).replace(" ", "-")}`];
  return h("li", { class: clases.filter(Boolean).join(" "), style: color(x.asignatura) },
    conFecha && cajaFecha(x.fecha),
    h("div", { class: "plazo__cuerpo" },
      h("p", { class: "plazo__titulo" }, h("span", { class: "icono", "aria-hidden": "true" }, ICONOS[x.tipo] ?? "📌"), x.titulo),
      h("p", { class: "plazo__meta" }, meta.flatMap((m, i) => (i ? [h("span", { class: "sep", "aria-hidden": "true" }, "·"), m] : [m]))),
      (url || corregir) && h("p", { class: "plazo__enlaces" },
        url && h("a", { class: "enlace-ext", href: url, target: "_blank", rel: "noopener" }, "Abrir en Moodle",
          h("span", { class: "sr" }, " (se abre en otra pestaña)")),
        corregir && h("button", { class: "enlace-boton enlace-boton--suave", type: "button", onclick: () => proponer(x) },
          x.fecha ? "¿Fecha incorrecta?" : "¿Sabes la fecha?", h("span", { class: "sr" }, ` Proponer corrección de ${x.titulo}`))),
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

function preparacion(items, hechas) {
  const verbo = (x) => (x.tipo === "presentacion" ? "Presentas" : x.grupo === "entrega" ? "Entregas"
    : x.tipo === "lectura" ? "Leer" : x.grupo === "examen" ? "Examen" : "Preparar");
  return h("div", { class: "preparacion" },
    h("p", { class: "preparacion__titulo" }, "Para esta clase"),
    h("ul", { role: "list" }, items.map((x) => {
      const hecha = hechas.has(x.id);
      return h("li", { class: `preparacion__item${hecha ? " es-hecha" : ""}` },
        h("label", {},
          h("input", { type: "checkbox", checked: hecha, "aria-label": `Hecho: ${x.titulo}`, onchange: (ev) => {
            P.marcarHecha(x.id, ev.target.checked);
            ev.target.closest(".preparacion__item").classList.toggle("es-hecha", ev.target.checked);
          } }),
          h("span", { class: `preparacion__verbo preparacion__verbo--${x.grupo}` }, verbo(x)),
          // Dentro de su clase sobra el "Sesión 2 (…):" del principio
          h("span", { class: "preparacion__texto" }, x.titulo.replace(/^(antes de (la )?)?sesi[oó]n \d+[^:]{0,60}:\s*/i, "").replace(/^./, (c) => c.toUpperCase()),
            x.propuesta && h("span", { class: "etiqueta-mini" }, "por confirmar"))));
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
      deberes.length > 0 && preparacion(deberes, hechas)),
    enCurso && h("span", { class: "insignia insignia--ahora" }, "Ahora"));
}

const clasesDe = (dia) => estado.datos.clases.filter((c) => c.inicio.startsWith(dia) && pasaFiltro(c));
const listaClases = (clases, porClase = new Map(), hechas = P.hechas()) =>
  h("ul", { class: "lista lista--clases", role: "list" }, clases.map((c) => clase(c, porClase.get(c) ?? [], hechas)));

function etiquetaDia(dia, hoy) {
  const d = F.diasEntre(hoy, dia);
  return d === 0 ? `Hoy · ${F.diaLargo(dia)}` : d === 1 ? `Mañana · ${F.diaLargo(dia)}` : F.diaLargo(dia);
}

/** Un día: sus clases, cada una con lo que hay que preparar, y debajo lo que vence ese día sin clase asociada. */
function bloqueDia(dia, hoy, { vacioFinde = true } = {}) {
  const hechas = P.hechas();
  const clases = clasesDe(dia);
  const examenesHorario = new Set(clases.filter((c) => c.tipo === "examen").map((c) => c.asignatura));
  const items = estado.todos.filter((x) => x.fecha === dia && pasaFiltro(x) && !(x.grupo === "examen" && examenesHorario.has(x.asignatura)));
  const finde = [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
  if (!clases.length && !items.length && (finde || !vacioFinde)) return null;
  const { porClase, sueltos } = repartir(clases, items);
  const esHoy = dia === hoy;
  return h("section", { class: `dia${esHoy ? " dia--hoy" : ""}`, "aria-current": esHoy ? "date" : null },
    h("h3", { class: "dia__titulo" }, etiquetaDia(dia, hoy)),
    clases.length ? listaClases(clases, porClase, hechas) : vacio("Sin clases."),
    sueltos.length > 0 && h("div", { class: "dia__sueltos" },
      h("p", { class: "preparacion__titulo" }, clases.length ? "Además, este día" : "Este día"),
      listaPlazos(sueltos, { conFecha: false })));
}

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
  const ahora = F.ahora();
  const hechas = P.hechas();
  const lunes = F.lunesDe(hoy);
  const domingo = F.sumarDias(lunes, 6);
  const dowHoy = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7;   // 0 = lunes

  const proxima = estado.datos.clases.find((c) => c.tipo !== "evento" && pasaFiltro(c) && c.fin.slice(0, 16) > ahora);
  const entregas = estado.todos.filter((x) => x.grupo === "entrega" && pasaFiltro(x) && x.fecha && !yaPaso(x)
    && !hechas.has(x.id) && x.voluntario !== true);
  const estaSemana = entregas.filter((x) => x.fecha <= domingo);
  const examen = estado.todos.find((x) => !x.propuesta && x.grupo === "examen" && pasaFiltro(x) && x.fecha && !yaPaso(x));
  const diasExamen = examen && F.diasEntre(hoy, examen.fecha);

  let cuandoProxima = "—";
  if (proxima) {
    const enCurso = proxima.inicio.slice(0, 16) <= ahora;
    const d = F.diasEntre(hoy, proxima.inicio.slice(0, 10));
    cuandoProxima = enCurso ? "ahora" : d === 0 ? F.hora(proxima.inicio) : d === 1 ? `mañana ${F.hora(proxima.inicio)}`
      : `${F.partesDia(proxima.inicio).semana} ${F.hora(proxima.inicio)}`;
  }
  const dias = (desde, n) => Array.from({ length: n }, (_, i) => F.sumarDias(desde, i));
  const semanaActual = dias(hoy, 7 - dowHoy).map((d) => bloqueDia(d, hoy)).filter(Boolean);
  const siguiente = dias(F.sumarDias(lunes, 7), 7).map((d) => bloqueDia(d, hoy)).filter(Boolean);
  const clasesSiguiente = dias(F.sumarDias(lunes, 7), 7).reduce((n, d) => n + clasesDe(d).filter((c) => c.tipo !== "evento").length, 0);

  return h("div", {},
    titulo(F.diaLargo(hoy)),
    h("div", { class: "cifras" },
      cifra("Próxima clase", cuandoProxima,
        proxima ? [proxima.asignatura ? nombreAsignatura(proxima.asignatura) : proxima.tema, proxima.sesion && `S${proxima.sesion}`,
          proxima.aula].filter(Boolean).join(" · ") : "no quedan clases", "azul"),
      cifra("Entregas esta semana", estaSemana.length,
        estaSemana.length ? `la primera ${F.relativo(F.diasEntre(hoy, estaSemana[0].fecha))}` : "ninguna pendiente", "verde"),
      cifra("Próximo examen", examen ? (diasExamen === 0 ? "hoy" : `${diasExamen} d`) : "—",
        examen ? `${nombreAsignatura(examen.asignatura)} · ${F.diaCorto(examen.fecha)}` : "sin exámenes a la vista", "rojo")),
    h("div", { class: "rejilla" },
      h("div", {},
        h("section", { class: "seccion" },
          h("h3", { class: "seccion__titulo seccion__titulo--grande" }, "Lo que queda de semana"),
          semanaActual.length ? semanaActual : vacio("No queda nada esta semana.")),
        h("details", { class: "plegable plegable--semana", open: dowHoy >= 3 || !semanaActual.length },
          h("summary", {}, `Semana que viene · ${F.rangoSemana(F.sumarDias(lunes, 7))}`,
            h("span", { class: "plegable__resumen" }, ` ${clasesSiguiente} clases`)),
          siguiente.length ? siguiente : vacio("Sin clases."))),
      h("aside", { class: "lateral", "aria-label": "Próximas entregas" },
        seccion("Próximas entregas",
          entregas.length ? listaPlazos(entregas.slice(0, 6)) : vacio("Nada pendiente."),
          entregas.length > 6 && h("p", { class: "nota" }, h("a", { href: "#entregas" }, `Ver las ${entregas.length} entregas pendientes`)),
          comunidad() && h("p", { class: "nota" }, "¿Falta algo? ",
            h("button", { class: "enlace-boton", type: "button", onclick: () => proponer() }, "Propón una entrega o fecha"))))));
}

function vistaEntregas() {
  const hechas = P.hechas();
  const todas = estado.todos.filter((x) => x.grupo === "entrega" && pasaFiltro(x));
  const proximas = todas.filter((x) => x.fecha && !yaPaso(x) && !hechas.has(x.id));
  const sinFecha = todas.filter((x) => !x.fecha && !hechas.has(x.id));
  const cerradas = todas.filter((x) => hechas.has(x.id) || yaPaso(x)).sort((a, b) => porFecha(b, a));
  const domingo = F.sumarDias(F.lunesDe(F.hoy()), 6);
  const domingoSiguiente = F.sumarDias(domingo, 7);
  const tramos = [
    ["Esta semana", proximas.filter((x) => x.fecha <= domingo)],
    [`La semana que viene · ${F.rangoSemana(F.sumarDias(domingo, 1))}`, proximas.filter((x) => x.fecha > domingo && x.fecha <= domingoSiguiente)],
    ["Más adelante", proximas.filter((x) => x.fecha > domingoSiguiente)],
  ];
  return h("div", {},
    titulo("Entregas y presentaciones", [`${tramos[0][1].length} esta semana`, `${proximas.length} pendientes`,
      sinFecha.length && `${sinFecha.length} sin fecha`].filter(Boolean).join(" · ")),
    comunidad() && h("div", { class: "tarjeta tarjeta--proponer" },
      h("p", {}, h("strong", {}, "¿Falta algo o una fecha está mal? "),
        "Si lo dijo el profesor en clase, llegó por correo o la fecha de Moodle no es la real, propónlo: lo ve toda la clase "
        + "al momento y queda verificado cuando lo confirman otros compañeros."),
      h("button", { class: "boton boton--primario", type: "button", onclick: () => proponer() }, "＋ Proponer")),
    proximas.length ? tramos.filter(([, items]) => items.length).map(([nombre, items]) =>
      seccion(h("span", {}, nombre, h("span", { class: "contador" }, items.length)), listaPlazos(items)))
      : vacio("No hay entregas pendientes con fecha."),
    sinFecha.length > 0 && seccion("Sin fecha todavía",
      h("p", { class: "nota" }, "Están en Moodle pero sin fecha límite confirmada. Si sabes la fecha, pulsa «¿Sabes la fecha?»."),
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
