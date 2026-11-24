// Autenticación con JWT y control de acceso por rol con validación vigente en BD.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const ID_ROL_ADMIN = 1;

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  // Sin JWT_SECRET en el .env se usa una clave aleatoria: funciona, pero las sesiones
  // se invalidan cada vez que se reinicia el servidor. Defínela en el .env para producción.
  SECRET = crypto.randomBytes(32).toString("hex");
  if (process.env.NODE_ENV !== "test") {
    console.warn("[auth] JWT_SECRET no está definido en .env: se usa una clave temporal.");
  }
}
const EXPIRA = process.env.JWT_EXPIRES_IN || "8h";

function firmarToken(usuario) {
  return jwt.sign(
    { idUsuario: usuario.id_usuario, idRol: usuario.id_rol, nombre: usuario.nombre },
    SECRET,
    { expiresIn: EXPIRA }
  );
}

// Exige un token válido en el encabezado "Authorization: Bearer <token>" y valida que
// la cuenta siga activa y con el rol vigente en base de datos.
async function autenticar(req, res, next) {
  const cabecera = req.headers.authorization || "";
  const [esquema, token] = cabecera.split(" ");
  if (esquema !== "Bearer" || !token) {
    return res.status(401).json({ mensaje: "No autenticado: inicia sesión para continuar" });
  }

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (error) {
    const expirado = error.name === "TokenExpiredError";
    return res.status(401).json({ mensaje: expirado ? "Tu sesión expiró: inicia sesión nuevamente" : "Token inválido" });
  }

  req.usuario = { ...payload };

  const verificarEnBD = process.env.NODE_ENV !== "test" || process.env.AUTH_CHECK_DB === "true";
  if (verificarEnBD) {
    try {
      const [rows] = await pool.query(
        "SELECT id_rol, id_estado, nombre FROM usuarios WHERE id_usuario = ? /* auth_check */",
        [payload.idUsuario]
      );
      if (!rows || rows.length === 0) {
        return res.status(401).json({ mensaje: "Tu sesión ya no es válida: inicia sesión nuevamente" });
      }
      if (Number(rows[0].id_estado) !== 1) {
        return res.status(403).json({ mensaje: "Tu cuenta se encuentra inactiva. Contacta al administrador" });
      }
      // Refresca el rol y nombre vigentes (si se revocó el rol Admin, aplica de inmediato).
      req.usuario.idRol = Number(rows[0].id_rol);
      req.usuario.nombre = rows[0].nombre || req.usuario.nombre;
    } catch (error) {
      console.error("Error verificando sesión vigente:", error.message);
      return res.status(500).json({ mensaje: "Error interno del servidor" });
    }
  }

  return next();
}

const esAdmin = (req) => req.usuario?.idRol === ID_ROL_ADMIN;

function soloAdmin(req, res, next) {
  if (!esAdmin(req)) {
    return res.status(403).json({ mensaje: "No tienes permiso para realizar esta acción" });
  }
  return next();
}

module.exports = { firmarToken, autenticar, soloAdmin, esAdmin, ID_ROL_ADMIN };
