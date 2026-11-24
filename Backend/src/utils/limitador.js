// Limita los intentos fallidos de inicio de sesión (en memoria) para frenar la fuerza bruta,
// con purga automática de entradas vencidas para evitar fugas de memoria.
const MAX_FALLOS = 5;
const VENTANA_MS = 10 * 60 * 1000;
const LIMITE_PURGA = 200;
const fallos = new Map(); // clave -> { cantidad, desde }

const clave = (req, correo) => `${req.ip}|${String(correo).toLowerCase()}`;

function limpiarVencidos(ahora = Date.now()) {
  for (const [k, f] of fallos.entries()) {
    if (ahora - f.desde > VENTANA_MS) fallos.delete(k);
  }
}

// Limpieza periódica sin impedir el cierre limpio del proceso (.unref()).
const intervalo = setInterval(limpiarVencidos, VENTANA_MS);
if (typeof intervalo.unref === "function") intervalo.unref();

function bloqueado(req, correo) {
  const f = fallos.get(clave(req, correo));
  if (!f) return false;
  if (Date.now() - f.desde > VENTANA_MS) {
    fallos.delete(clave(req, correo));
    return false;
  }
  return f.cantidad >= MAX_FALLOS;
}

function registrarFallo(req, correo) {
  const ahora = Date.now();
  if (fallos.size >= LIMITE_PURGA) limpiarVencidos(ahora);
  const k = clave(req, correo);
  const f = fallos.get(k);
  if (!f || ahora - f.desde > VENTANA_MS) fallos.set(k, { cantidad: 1, desde: ahora });
  else f.cantidad++;
}

const limpiar = (req, correo) => fallos.delete(clave(req, correo));
const reiniciarTodo = () => fallos.clear();

module.exports = { bloqueado, registrarFallo, limpiar, limpiarVencidos, reiniciarTodo };
