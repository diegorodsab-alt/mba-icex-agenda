// Fechas en hora de Madrid. Todo se compara como texto local ("AAAA-MM-DD" y "AAAA-MM-DDTHH:MM"):
// el horario ya viene en hora de Madrid, así que no hace falta convertir zonas horarias.

const TZ = "Europe/Madrid";
const DIA_MS = 86_400_000;

const fmtAhora = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
// Las claves de día se formatean como UTC para que el día de la semana no dependa del navegador
const fmtLargo = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const fmtCorto = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const fmtDia = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric" });
const fmtMes = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", month: "short" });
const fmtSemana = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "short" });

const utc = (clave) => {
  const [a, m, d] = clave.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

/** "AAAA-MM-DDTHH:MM" de ahora en Madrid. */
export function ahora() {
  const p = Object.fromEntries(fmtAhora.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const hoy = () => ahora().slice(0, 10);
export const sumarDias = (clave, n) => new Date(utc(clave).getTime() + n * DIA_MS).toISOString().slice(0, 10);
export const diasEntre = (desde, hasta) => Math.round((utc(hasta) - utc(desde)) / DIA_MS);
export const lunesDe = (clave) => sumarDias(clave, -((utc(clave).getUTCDay() + 6) % 7));

const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export const diaLargo = (clave) => mayuscula(fmtLargo.format(utc(clave)));
export const diaCorto = (clave) => fmtCorto.format(utc(clave));
export const partesDia = (clave) => ({
  dia: fmtDia.format(utc(clave)), mes: fmtMes.format(utc(clave)).replace(".", ""), semana: fmtSemana.format(utc(clave)).replace(".", ""),
});
export const hora = (iso) => iso.slice(11, 16);

/** "hoy", "mañana", "en 5 días", "ayer", "hace 3 días". */
export function relativo(dias) {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  return dias > 1 ? `en ${dias} días` : `hace ${-dias} días`;
}

/** Rango de una semana: "5 – 11 oct" o "28 sept – 4 oct". */
export function rangoSemana(lunes) {
  const domingo = sumarDias(lunes, 6);
  const a = partesDia(lunes);
  const b = partesDia(domingo);
  return a.mes === b.mes ? `${a.dia} – ${b.dia} ${b.mes}` : `${a.dia} ${a.mes} – ${b.dia} ${b.mes}`;
}

/** "hoy a las 09:12", "ayer a las 09:12" o "el lun, 5 oct a las 09:12" (hora de actualización). */
export function haceCuanto(iso) {
  const local = iso.slice(0, 16);
  const dias = diasEntre(local, ahora());
  if (dias === 0) return `hoy a las ${hora(local)}`;
  if (dias === 1) return `ayer a las ${hora(local)}`;
  return `el ${diaCorto(local)} a las ${hora(local)}`;
}

/** Horas desde la actualización (para avisar si la agenda lleva tiempo sin actualizarse). */
export const horasDesde = (iso) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
