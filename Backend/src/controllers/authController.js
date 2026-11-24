const crypto = require("crypto");
const { pool } = require("../config/db");
const { firmarToken } = require("../utils/auth");
const { hashear, verificar } = require("../utils/passwords");
const { validarContrasena, validarCorreo, texto } = require("../utils/validaciones");
const { enviarRecuperacionContrasena } = require("../utils/mailer");
const { manejarError } = require("../utils/errores");
const limitador = require("../utils/limitador");

const MINUTOS_EXPIRACION_RESET = 30;
const MENSAJE_RECUPERACION_GENERICO =
  "Si el correo está registrado y activo, enviaremos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada o correo no deseado.";

let tablaRecuperacionVerificada = false;

async function asegurarTablaRecuperacion() {
  if (tablaRecuperacionVerificada || process.env.NODE_ENV === "test") return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recuperacion_contrasena (
      id_recuperacion INT(11)     NOT NULL AUTO_INCREMENT,
      id_usuario      INT(11)     NOT NULL,
      token_hash      CHAR(64)    NOT NULL,
      expira_en       DATETIME    NOT NULL,
      usado           TINYINT(1)  NOT NULL DEFAULT 0,
      creado_en       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_recuperacion),
      UNIQUE KEY uq_recuperacion_token (token_hash),
      KEY idx_recuperacion_usuario (id_usuario),
      CONSTRAINT fk_recuperacion_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tablaRecuperacionVerificada = true;
}

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

function enmascararCorreo(correo) {
  const [local, dominio] = String(correo || "").split("@");
  if (!local || !dominio) return "";
  const visible = local.length <= 2 ? local[0] || "" : local.slice(0, 2);
  return `${visible}***@${dominio}`;
}

function obtenerUrlFrontend() {
  const base =
    process.env.FRONTEND_URL ||
    (process.env.CORS_ORIGIN || "http://localhost:4200").split(",")[0] ||
    "http://localhost:4200";
  return base.trim().replace(/\/$/, "");
}

// POST /api/login
// body: { correo, contrasena }
// Responde { mensaje, token, usuario }. El token se envía en las demás peticiones
// con el encabezado "Authorization: Bearer <token>".
async function login(req, res) {
  try {
    const correoLimpio = texto(req.body.correo).toLowerCase();
    const { contrasena } = req.body;

    if (!correoLimpio || !contrasena) {
      return res.status(400).json({ mensaje: "Correo y contrasena son obligatorios" });
    }

    if (limitador.bloqueado(req, correoLimpio)) {
      return res.status(429).json({ mensaje: "Demasiados intentos fallidos. Intenta de nuevo en 10 minutos" });
    }

    // ultimo_acceso y debe_cambiar_contrasena se agregan con migraciones; si alguna columna
    // aún no existe, el login sigue funcionando sin ella.
    let rows;
    let tieneUltimoAcceso = true;
    let tieneDebeCambiar = true;
    try {
      [rows] = await pool.query(
        `SELECT u.id_usuario, u.nombre, u.correo, u.contrasena, u.id_rol, r.nombre_rol, u.id_estado, u.ultimo_acceso, u.debe_cambiar_contrasena
         FROM usuarios u
         JOIN roles r ON r.id_rol = u.id_rol
         WHERE LOWER(u.correo) = LOWER(?)`,
        [correoLimpio]
      );
    } catch (error) {
      if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
      tieneDebeCambiar = false;
      try {
        [rows] = await pool.query(
          `SELECT u.id_usuario, u.nombre, u.correo, u.contrasena, u.id_rol, r.nombre_rol, u.id_estado, u.ultimo_acceso
           FROM usuarios u
           JOIN roles r ON r.id_rol = u.id_rol
           WHERE LOWER(u.correo) = LOWER(?)`,
          [correoLimpio]
        );
      } catch (error2) {
        if (error2.code !== "ER_BAD_FIELD_ERROR") throw error2;
        tieneUltimoAcceso = false;
        [rows] = await pool.query(
          `SELECT u.id_usuario, u.nombre, u.correo, u.contrasena, u.id_rol, r.nombre_rol, u.id_estado
           FROM usuarios u
           JOIN roles r ON r.id_rol = u.id_rol
           WHERE LOWER(u.correo) = LOWER(?)`,
          [correoLimpio]
        );
      }
    }

    if (rows.length === 0) {
      limitador.registrarFallo(req, correoLimpio);
      return res.status(401).json({ mensaje: "Credenciales invalidas" });
    }

    const usuario = rows[0];
    const { ok, migrar } = await verificar(contrasena, usuario.contrasena);
    if (!ok) {
      limitador.registrarFallo(req, correoLimpio);
      return res.status(401).json({ mensaje: "Credenciales invalidas" });
    }
    limitador.limpiar(req, correoLimpio);

    if (usuario.id_estado !== 1) {
      return res.status(403).json({ mensaje: "El usuario se encuentra inactivo" });
    }

    // Si la contraseña seguía en texto plano, se convierte a hash en este primer ingreso.
    if (migrar) {
      await pool.query("UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?", [await hashear(contrasena), usuario.id_usuario]);
    }

    // Se devuelve el ingreso ANTERIOR (null si es el primero) y luego se registra el actual.
    const ultimoAcceso = tieneUltimoAcceso ? usuario.ultimo_acceso : null;
    if (tieneUltimoAcceso) {
      await pool.query("UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?", [usuario.id_usuario]);
    }

    return res.status(200).json({
      mensaje: "Inicio de sesion exitoso",
      token: firmarToken(usuario),
      usuario: {
        idUsuario: usuario.id_usuario,
        nombre: usuario.nombre,
        correo: usuario.correo,
        idRol: usuario.id_rol,
        rolNombre: usuario.nombre_rol,
        ultimoAcceso,
        debeCambiarContrasena: tieneDebeCambiar ? Boolean(usuario.debe_cambiar_contrasena) : false,
      },
    });
  } catch (error) {
    return manejarError(res, error, "POST /api/login");
  }
}

// PUT /api/login/contrasena  (requiere sesión)
// body: { actual, nueva }
async function cambiarContrasena(req, res) {
  try {
    const { actual, nueva } = req.body;
    if (!actual || !nueva) {
      return res.status(400).json({ mensaje: "Debes indicar la contraseña actual y la nueva" });
    }
    const errorNueva = validarContrasena(nueva);
    if (errorNueva) return res.status(400).json({ mensaje: errorNueva });
    if (actual === nueva) {
      return res.status(400).json({ mensaje: "La nueva contraseña debe ser diferente a la actual" });
    }

    const [rows] = await pool.query("SELECT contrasena FROM usuarios WHERE id_usuario = ?", [req.usuario.idUsuario]);
    if (rows.length === 0) return res.status(404).json({ mensaje: "Usuario no encontrado" });

    const { ok } = await verificar(actual, rows[0].contrasena);
    if (!ok) return res.status(400).json({ mensaje: "La contraseña actual no es correcta" });

    const nuevoHash = await hashear(nueva);
    try {
      await pool.query("UPDATE usuarios SET contrasena = ?, debe_cambiar_contrasena = 0 WHERE id_usuario = ?", [nuevoHash, req.usuario.idUsuario]);
    } catch (error) {
      if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
      await pool.query("UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?", [nuevoHash, req.usuario.idUsuario]);
    }
    return res.status(200).json({ mensaje: "Contraseña actualizada correctamente" });
  } catch (error) {
    return manejarError(res, error, "PUT /api/login/contrasena");
  }
}

// POST /api/login/olvide-contrasena (público)
// body: { correo }
async function solicitarRecuperacion(req, res) {
  let tokenHashGuardado = null;
  let enviandoCorreo = false;
  try {
    const correoLimpio = texto(req.body.correo).toLowerCase();
    const errorCorreo = validarCorreo(correoLimpio);
    if (errorCorreo) return res.status(400).json({ mensaje: errorCorreo });

    const claveLimite = `reset:${correoLimpio}`;
    if (limitador.bloqueado(req, claveLimite)) {
      return res.status(429).json({
        mensaje: "Has solicitado demasiados correos de recuperación. Espera 10 minutos e intenta nuevamente.",
      });
    }
    limitador.registrarFallo(req, claveLimite);

    const [rows] = await pool.query(
      "SELECT id_usuario, nombre, correo, id_estado FROM usuarios WHERE LOWER(correo) = LOWER(?)",
      [correoLimpio]
    );
    if (rows.length === 0 || Number(rows[0].id_estado) !== 1) {
      return res.status(200).json({ mensaje: MENSAJE_RECUPERACION_GENERICO });
    }

    const usuario = rows[0];
    await asegurarTablaRecuperacion();

    const tokenPlano = crypto.randomBytes(32).toString("hex");
    tokenHashGuardado = hashToken(tokenPlano);

    await pool.query("UPDATE recuperacion_contrasena SET usado = 1 WHERE id_usuario = ? AND usado = 0", [usuario.id_usuario]);
    await pool.query(
      `INSERT INTO recuperacion_contrasena (id_usuario, token_hash, expira_en)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [usuario.id_usuario, tokenHashGuardado, MINUTOS_EXPIRACION_RESET]
    );

    const enlace = `${obtenerUrlFrontend()}/restablecer-contrasena?token=${tokenPlano}`;
    enviandoCorreo = true;
    await enviarRecuperacionContrasena({
      para: usuario.correo,
      nombre: usuario.nombre,
      enlace,
      minutos: MINUTOS_EXPIRACION_RESET,
    });

    return res.status(200).json({ mensaje: MENSAJE_RECUPERACION_GENERICO });
  } catch (error) {
    if (tokenHashGuardado) {
      await pool.query("DELETE FROM recuperacion_contrasena WHERE token_hash = ?", [tokenHashGuardado]).catch(() => {});
    }
    if (error.code === "SMTP_NO_CONFIGURADO") {
      return res.status(503).json({
        mensaje: "El envío de correos no está configurado en el servidor (SMTP). Contacta al administrador.",
      });
    }
    if (enviandoCorreo) {
      console.error("Error enviando correo de recuperación:", error.message);
      return res.status(502).json({
        mensaje: "No se pudo enviar el correo de recuperación. Intenta nuevamente en unos minutos.",
      });
    }
    return manejarError(res, error, "POST /api/login/olvide-contrasena");
  }
}

// GET /api/login/validar-token-recuperacion?token=... (público)
async function validarTokenRecuperacion(req, res) {
  try {
    const tokenPlano = texto(req.query.token);
    if (!tokenPlano || tokenPlano.length < 16) {
      return res.status(400).json({ valido: false, mensaje: "El enlace de recuperación no es válido." });
    }
    await asegurarTablaRecuperacion();
    const [rows] = await pool.query(
      `SELECT r.id_recuperacion, u.correo
       FROM recuperacion_contrasena r
       JOIN usuarios u ON u.id_usuario = r.id_usuario
       WHERE r.token_hash = ? AND r.usado = 0 AND r.expira_en > NOW() AND u.id_estado = 1`,
      [hashToken(tokenPlano)]
    );
    if (rows.length === 0) {
      return res.status(400).json({
        valido: false,
        mensaje: "El enlace de recuperación es inválido o ya expiró. Solicita uno nuevo.",
      });
    }
    return res.status(200).json({
      valido: true,
      correoEnmascarado: enmascararCorreo(rows[0].correo),
    });
  } catch (error) {
    return manejarError(res, error, "GET /api/login/validar-token-recuperacion");
  }
}

// POST /api/login/restablecer-contrasena (público)
// body: { token, nueva }
async function restablecerContrasena(req, res) {
  try {
    const tokenPlano = texto(req.body.token);
    const { nueva } = req.body;
    if (!tokenPlano || tokenPlano.length < 16) {
      return res.status(400).json({ mensaje: "El enlace de recuperación no es válido." });
    }
    const errorNueva = validarContrasena(nueva);
    if (errorNueva) return res.status(400).json({ mensaje: errorNueva });

    await asegurarTablaRecuperacion();
    const [rows] = await pool.query(
      `SELECT r.id_recuperacion, r.id_usuario, u.correo
       FROM recuperacion_contrasena r
       JOIN usuarios u ON u.id_usuario = r.id_usuario
       WHERE r.token_hash = ? AND r.usado = 0 AND r.expira_en > NOW() AND u.id_estado = 1`,
      [hashToken(tokenPlano)]
    );
    if (rows.length === 0) {
      return res.status(400).json({
        mensaje: "El enlace de recuperación es inválido o ya expiró. Solicita uno nuevo.",
      });
    }

    const registro = rows[0];
    const nuevoHash = await hashear(nueva);
    try {
      await pool.query("UPDATE usuarios SET contrasena = ?, debe_cambiar_contrasena = 0 WHERE id_usuario = ?", [
        nuevoHash,
        registro.id_usuario,
      ]);
    } catch (error) {
      if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
      await pool.query("UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?", [nuevoHash, registro.id_usuario]);
    }

    await pool.query("UPDATE recuperacion_contrasena SET usado = 1 WHERE id_usuario = ? AND usado = 0", [
      registro.id_usuario,
    ]);
    limitador.limpiar(req, texto(registro.correo).toLowerCase());

    return res.status(200).json({ mensaje: "Contraseña restablecida correctamente. Ya puedes iniciar sesión." });
  } catch (error) {
    return manejarError(res, error, "POST /api/login/restablecer-contrasena");
  }
}

module.exports = {
  login,
  cambiarContrasena,
  solicitarRecuperacion,
  validarTokenRecuperacion,
  restablecerContrasena,
};
