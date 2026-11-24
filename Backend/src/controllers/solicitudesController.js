const { pool } = require("../config/db");
const { esAdmin } = require("../utils/auth");
const { validarSolicitud, normalizarFecha, texto } = require("../utils/validaciones");
const { manejarError } = require("../utils/errores");

const ESTADO_PENDIENTE = 3;
const ESTADO_EN_REVISION = 4;
const ESTADO_APROBADO = 5;
const ESTADO_RECHAZADO = 6;
const ESTADOS_SOLICITUD = [ESTADO_PENDIENTE, ESTADO_EN_REVISION, ESTADO_APROBADO, ESTADO_RECHAZADO];
const ESTADOS_FINALES = [ESTADO_APROBADO, ESTADO_RECHAZADO];

const NOMBRE_ESTADO = {
  [ESTADO_PENDIENTE]: "Pendiente",
  [ESTADO_EN_REVISION]: "En revisión",
  [ESTADO_APROBADO]: "Aprobado",
  [ESTADO_RECHAZADO]: "Rechazado",
};

// Máquina de estados: solo se permiten transiciones lógicas hacia adelante.
const TRANSICIONES_VALIDAS = {
  [ESTADO_PENDIENTE]: [ESTADO_EN_REVISION, ESTADO_APROBADO, ESTADO_RECHAZADO],
  [ESTADO_EN_REVISION]: [ESTADO_APROBADO, ESTADO_RECHAZADO],
  [ESTADO_APROBADO]: [],
  [ESTADO_RECHAZADO]: [],
};

const SELECT_SOLICITUD = `
  SELECT s.*,
    (SELECT r.mensaje FROM respuestas r
      WHERE r.id_solicitud = s.id_solicitud
      ORDER BY r.fecha_respuesta DESC, r.id_respuesta DESC LIMIT 1) AS respuesta,
    u.nombre AS nombre_empleado,
    COALESCE(u.numero_documento, e.cedula) AS cedula_empleado,
    e.id_usuario AS id_usuario_empleado
  FROM solicitudes s
  LEFT JOIN empleados e ON e.id_empleado = s.id_empleado
  LEFT JOIN usuarios u ON u.id_usuario = e.id_usuario
`;

const prohibido = (res, mensaje = "No tienes permiso para realizar esta acción") =>
  res.status(403).json({ mensaje });

// Devuelve el id_usuario dueño de un empleado (o null si no existe).
async function usuarioDeEmpleado(idEmpleado) {
  const [rows] = await pool.query("SELECT id_usuario FROM empleados WHERE id_empleado = ?", [idEmpleado]);
  return rows.length ? rows[0].id_usuario : null;
}

// Garantiza que un administrador sin perfil laboral previo pueda radicar sus propias solicitudes.
async function asegurarEmpleadoPropioAdmin(idUsuario) {
  const [existente] = await pool.query("SELECT id_empleado FROM empleados WHERE id_usuario = ?", [idUsuario]);
  if (existente.length > 0) return existente[0].id_empleado;

  const [usuarios] = await pool.query("SELECT numero_documento FROM usuarios WHERE id_usuario = ?", [idUsuario]);
  if (usuarios.length === 0) return null;

  const cedula = texto(usuarios[0].numero_documento) || `ADM${idUsuario}`;
  const hoy = new Date().toISOString().substring(0, 10);
  const [insertado] = await pool.query(
    `INSERT INTO empleados (id_usuario, cedula, cargo, area, fecha_ingreso, salario, promedio_horas_extras)
     VALUES (?, ?, 'Administrador', 'Administración', ?, 0, 0)`,
    [idUsuario, cedula, hoy]
  );
  return insertado.insertId;
}

async function listarOConsultar(req, res) {
  try {
    const { id, empleado } = req.query;
    if (id) {
      const [rows] = await pool.query(`${SELECT_SOLICITUD} WHERE s.id_solicitud = ?`, [id]);
      if (rows.length === 0) return res.status(404).json({ mensaje: "Solicitud no encontrada" });
      if (!esAdmin(req) && (await usuarioDeEmpleado(rows[0].id_empleado)) !== req.usuario.idUsuario) return prohibido(res);
      return res.status(200).json(rows[0]);
    }
    if (empleado) {
      if (!esAdmin(req) && (await usuarioDeEmpleado(empleado)) !== req.usuario.idUsuario) return prohibido(res);
      const [rows] = await pool.query(`${SELECT_SOLICITUD} WHERE s.id_empleado = ? ORDER BY s.fecha_creacion DESC`, [empleado]);
      return res.status(200).json(rows);
    }
    // Todas las solicitudes: solo administradores.
    if (!esAdmin(req)) return prohibido(res);
    const [rows] = await pool.query(`${SELECT_SOLICITUD} ORDER BY s.fecha_creacion DESC`);
    return res.status(200).json(rows);
  } catch (error) {
    return manejarError(res, error, "GET /api/solicitudes");
  }
}

async function crear(req, res) {
  try {
    let { idEmpleado } = req.body;
    const { tipoSolicitud, descripcion, fechaInicio, fechaFin } = req.body;
    if (!tipoSolicitud) {
      return res.status(400).json({ mensaje: "Faltan campos obligatorios: idEmpleado, tipoSolicitud" });
    }
    const errorValidacion = validarSolicitud(req.body);
    if (errorValidacion) return res.status(400).json({ mensaje: errorValidacion });

    if (!idEmpleado) {
      if (!esAdmin(req)) {
        return res.status(400).json({ mensaje: "Faltan campos obligatorios: idEmpleado, tipoSolicitud" });
      }
      idEmpleado = await asegurarEmpleadoPropioAdmin(req.usuario.idUsuario);
      if (!idEmpleado) return res.status(404).json({ mensaje: "Usuario no encontrado" });
    } else {
      // Un empleado solo puede radicar solicitudes a su nombre.
      const duenio = await usuarioDeEmpleado(idEmpleado);
      if (duenio === null) return res.status(404).json({ mensaje: "Empleado no encontrado" });
      if (!esAdmin(req) && duenio !== req.usuario.idUsuario) return prohibido(res);
    }

    const inicioNorm = fechaInicio ? normalizarFecha(fechaInicio) : null;
    const finNorm = fechaFin ? normalizarFecha(fechaFin) : inicioNorm;

    // Si hay fechas, valida que no se solapen con solicitudes activas (Pendiente, En revisión o Aprobado) del empleado.
    if (inicioNorm && finNorm) {
      try {
        const [solapadas] = await pool.query(
          `SELECT id_solicitud, tipo_solicitud FROM solicitudes
           WHERE id_empleado = ?
             AND id_estado IN (?, ?, ?)
             AND fecha_inicio IS NOT NULL
             AND fecha_fin IS NOT NULL
             AND fecha_inicio <= ? AND fecha_fin >= ?`,
          [idEmpleado, ESTADO_PENDIENTE, ESTADO_EN_REVISION, ESTADO_APROBADO, finNorm, inicioNorm]
        );
        if (solapadas.length > 0) {
          return res.status(409).json({
            mensaje: `Ya existe una solicitud (${solapadas[0].tipo_solicitud}) que se cruza con las fechas seleccionadas.`,
          });
        }
      } catch (errCol) {
        if (errCol.code !== "ER_BAD_FIELD_ERROR") throw errCol;
      }
    }

    let result;
    try {
      [result] = await pool.query(
        "INSERT INTO solicitudes (id_empleado, id_estado, tipo_solicitud, descripcion, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, ?, ?)",
        [idEmpleado, ESTADO_PENDIENTE, texto(tipoSolicitud), texto(descripcion) || null, inicioNorm, finNorm]
      );
    } catch (errCol) {
      if (errCol.code !== "ER_BAD_FIELD_ERROR") throw errCol;
      [result] = await pool.query(
        "INSERT INTO solicitudes (id_empleado, id_estado, tipo_solicitud, descripcion) VALUES (?, ?, ?, ?)",
        [idEmpleado, ESTADO_PENDIENTE, texto(tipoSolicitud), texto(descripcion) || null]
      );
    }

    return res.status(201).json({
      mensaje: "Solicitud enviada correctamente. Estado: Pendiente",
      idSolicitud: result.insertId,
    });
  } catch (error) {
    return manejarError(res, error, "POST /api/solicitudes");
  }
}

// PUT /api/solicitudes  (administrador)
// body: { idSolicitud, idEstado, mensaje? } -> aplica máquina de estados y segregación de funciones.
async function actualizar(req, res) {
  try {
    const { idSolicitud } = req.body;
    const nuevoEstado = Number(req.body.idEstado);
    const mensajeUsuario = texto(req.body.mensaje);

    if (!idSolicitud || !req.body.idEstado) {
      return res.status(400).json({ mensaje: "Los campos idSolicitud e idEstado son obligatorios" });
    }
    if (!ESTADOS_SOLICITUD.includes(nuevoEstado)) {
      return res.status(400).json({ mensaje: "Estado inválido. Use 3 (Pendiente), 4 (En revisión), 5 (Aprobado) o 6 (Rechazado)" });
    }
    if (nuevoEstado === ESTADO_RECHAZADO && !mensajeUsuario) {
      return res.status(400).json({ mensaje: "Indica el motivo del rechazo" });
    }
    if (mensajeUsuario.length > 1000) {
      return res.status(400).json({ mensaje: "El mensaje no puede superar 1000 caracteres" });
    }

    const [existe] = await pool.query(
      "SELECT id_solicitud, id_empleado, id_estado FROM solicitudes WHERE id_solicitud = ?",
      [idSolicitud]
    );
    if (existe.length === 0) return res.status(404).json({ mensaje: "Solicitud no encontrada" });

    const actual = existe[0];
    const estadoActual = Number(actual.id_estado);

    if (estadoActual === nuevoEstado) {
      return res.status(409).json({ mensaje: `La solicitud ya se encuentra en estado ${NOMBRE_ESTADO[estadoActual]}` });
    }

    const permitidos = TRANSICIONES_VALIDAS[estadoActual] || [];
    if (!permitidos.includes(nuevoEstado)) {
      return res.status(409).json({
        mensaje: `No se puede cambiar una solicitud de '${NOMBRE_ESTADO[estadoActual] || estadoActual}' a '${NOMBRE_ESTADO[nuevoEstado]}'. Las solicitudes aprobadas o rechazadas son definitivas.`,
      });
    }

    // Segregación de funciones: un administrador no puede resolver su propia solicitud si existe otro administrador activo.
    const duenio = actual.id_empleado ? await usuarioDeEmpleado(actual.id_empleado) : null;
    if (duenio !== null && Number(duenio) === req.usuario.idUsuario) {
      const [otrosAdmins] = await pool.query(
        "SELECT COUNT(*) AS otros FROM usuarios WHERE id_rol = 1 AND id_estado = 1 AND id_usuario <> ?",
        [req.usuario.idUsuario]
      );
      if (Number(otrosAdmins?.[0]?.otros || 0) > 0) {
        return prohibido(res, "No puedes aprobar ni rechazar tu propia solicitud; debe gestionarla otro administrador");
      }
    }

    // Garantiza que la columna Respuesta siempre refleje el estado actual (evita mostrar mensajes antiguos obsoletos).
    const mensajeFinal =
      mensajeUsuario ||
      (nuevoEstado === ESTADO_EN_REVISION
        ? "Solicitud puesta en revisión por Gestión Humana."
        : nuevoEstado === ESTADO_APROBADO
          ? "Solicitud aprobada."
          : "");

    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      await conexion.query("UPDATE solicitudes SET id_estado = ? WHERE id_solicitud = ?", [nuevoEstado, idSolicitud]);
      if (mensajeFinal) {
        await conexion.query(
          "INSERT INTO respuestas (id_solicitud, id_usuario, mensaje) VALUES (?, ?, ?)",
          [idSolicitud, req.usuario.idUsuario, mensajeFinal]
        );
      }
      await conexion.commit();
    } catch (errorTransaccion) {
      await conexion.rollback();
      throw errorTransaccion;
    } finally {
      conexion.release();
    }
    return res.status(200).json({ mensaje: "Estado actualizado correctamente" });
  } catch (error) {
    return manejarError(res, error, "PUT /api/solicitudes");
  }
}

// DELETE /api/solicitudes?id= -> solo se pueden eliminar solicitudes que aún no han sido resueltas
// (Pendiente para empleado; Pendiente o En revisión para administrador) para preservar la auditoría.
async function eliminar(req, res) {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ mensaje: "El parametro id es obligatorio" });

    const [rows] = await pool.query("SELECT id_empleado, id_estado FROM solicitudes WHERE id_solicitud = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ mensaje: "Solicitud no encontrada" });

    const estadoActual = Number(rows[0].id_estado);

    if (!esAdmin(req)) {
      if ((await usuarioDeEmpleado(rows[0].id_empleado)) !== req.usuario.idUsuario) return prohibido(res);
      if (estadoActual !== ESTADO_PENDIENTE) {
        return res.status(409).json({ mensaje: "Solo puedes eliminar solicitudes que aún están pendientes" });
      }
    } else if (ESTADOS_FINALES.includes(estadoActual)) {
      return res.status(409).json({
        mensaje: "No se pueden eliminar solicitudes que ya fueron aprobadas o rechazadas para conservar la trazabilidad.",
      });
    }

    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      await conexion.query("DELETE FROM respuestas WHERE id_solicitud = ?", [id]);
      await conexion.query("DELETE FROM solicitudes WHERE id_solicitud = ?", [id]);
      await conexion.commit();
    } catch (errorTransaccion) {
      await conexion.rollback();
      throw errorTransaccion;
    } finally {
      conexion.release();
    }
    return res.status(200).json({ mensaje: "Solicitud eliminada correctamente" });
  } catch (error) {
    return manejarError(res, error, "DELETE /api/solicitudes");
  }
}

module.exports = { listarOConsultar, crear, actualizar, eliminar };
