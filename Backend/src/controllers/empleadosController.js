const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");
const { esAdmin } = require("../utils/auth");
const { hashear } = require("../utils/passwords");
const {
  validarEmpleado, validarUsuario, validarPersona, validarDocumento, nombreCompleto, dividirNombre,
  normalizarTipoDocumento, normalizarGenero, normalizarFecha, texto, limpiarDocumentoBusqueda, tokensBusqueda,
} = require("../utils/validaciones");
const { leerArchivoEmpleados, parsearNumeroOpcional } = require("../utils/lectorMasivo");
const { manejarError } = require("../utils/errores");

// Consulta base con datos del usuario asociado (nombre, correo) unidos por JOIN
const SELECT_EMPLEADO_COMPLETO = `
  SELECT e.*, u.nombre, u.correo, u.id_rol, u.id_estado, u.tipo_documento, u.numero_documento,
    u.primer_nombre, u.segundo_nombre, u.primer_apellido, u.segundo_apellido, u.genero
  FROM empleados e
  JOIN usuarios u ON u.id_usuario = e.id_usuario
`;

const prohibido = (res) => res.status(403).json({ mensaje: "No tienes permiso para consultar esta información" });

async function listarOConsultar(req, res) {
  try {
    const { id, idUsuario, documento } = req.query;

    // Búsqueda por número de documento (la usa el administrador para editar sin conocer ids).
    if (documento) {
      if (!esAdmin(req)) return prohibido(res);
      const docLimpio = limpiarDocumentoBusqueda(documento);
      if (!docLimpio) return res.status(404).json({ mensaje: "No existe un empleado con ese número de documento" });
      const [rows] = await pool.query(
        `${SELECT_EMPLEADO_COMPLETO}
         WHERE LOWER(REPLACE(REPLACE(REPLACE(e.cedula, '-', ''), '.', ''), ' ', '')) = ?
            OR LOWER(REPLACE(REPLACE(REPLACE(u.numero_documento, '-', ''), '.', ''), ' ', '')) = ?`,
        [docLimpio, docLimpio]
      );
      if (rows.length === 0) return res.status(404).json({ mensaje: "No existe un empleado con ese número de documento" });
      return res.status(200).json(rows[0]);
    }

    if (id) {
      const [rows] = await pool.query(`${SELECT_EMPLEADO_COMPLETO} WHERE e.id_empleado = ?`, [id]);
      if (rows.length === 0) return res.status(404).json({ mensaje: "Empleado no encontrado" });
      if (!esAdmin(req) && rows[0].id_usuario !== req.usuario.idUsuario) return prohibido(res);
      return res.status(200).json(rows[0]);
    }

    if (idUsuario) {
      // Un empleado solo puede consultar su propio perfil.
      if (!esAdmin(req) && Number(idUsuario) !== req.usuario.idUsuario) return prohibido(res);
      const [rows] = await pool.query(`${SELECT_EMPLEADO_COMPLETO} WHERE e.id_usuario = ?`, [idUsuario]);
      if (rows.length === 0) return res.status(404).json({ mensaje: "Este usuario no tiene un perfil de empleado asociado" });
      return res.status(200).json(rows[0]);
    }

    // El listado completo (con cédulas y salarios) es solo para administradores.
    if (!esAdmin(req)) return prohibido(res);

    const { page, limit, q } = req.query;
    if (page !== undefined) {
      const pagina = Math.max(1, Number(page) || 1);
      const tam = Math.min(100, Math.max(1, Number(limit) || 25));
      const offset = (pagina - 1) * tam;
      const tokens = tokensBusqueda(q);
      const whereParts = tokens.map(
        () => "(u.nombre LIKE ? OR REPLACE(REPLACE(REPLACE(u.numero_documento, '-', ''), '.', ''), ' ', '') LIKE ? OR REPLACE(REPLACE(REPLACE(e.cedula, '-', ''), '.', ''), ' ', '') LIKE ? OR e.cargo LIKE ? OR e.area LIKE ? OR u.correo LIKE ?)"
      );
      const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
      const likeParams = tokens.flatMap((t) => Array(6).fill(`%${t}%`));
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM empleados e JOIN usuarios u ON u.id_usuario = e.id_usuario ${whereSql}`,
        likeParams
      );
      const [datos] = await pool.query(
        `${SELECT_EMPLEADO_COMPLETO} ${whereSql} ORDER BY e.id_empleado LIMIT ? OFFSET ?`,
        [...likeParams, tam, offset]
      );
      return res.status(200).json({ datos, total, page: pagina, limit: tam, totalPaginas: Math.ceil(total / tam) });
    }

    const [rows] = await pool.query(`${SELECT_EMPLEADO_COMPLETO} ORDER BY e.id_empleado`);
    return res.status(200).json(rows);
  } catch (error) {
    return manejarError(res, error, "GET /api/empleados");
  }
}

// POST /api/empleados
// body: { numeroDocumento, cargo, area, fechaIngreso, salario?, promedioHorasExtras? }
// La persona se busca por su número de documento entre los usuarios ya creados (incluye CC, CE, PPT y PA).
async function crear(req, res) {
  try {
    const { numeroDocumento, idUsuario, cargo, area, fechaIngreso } = req.body;
    if ((!numeroDocumento && !idUsuario) || !cargo || !area || !fechaIngreso) {
      return res.status(400).json({ mensaje: "Faltan campos obligatorios: numeroDocumento, cargo, area, fechaIngreso" });
    }
    const docLimpio = texto(numeroDocumento);
    if (numeroDocumento && !/^[A-Za-z0-9]{5,20}$/.test(docLimpio)) {
      return res.status(400).json({ mensaje: "El número de documento no tiene un formato válido (entre 5 y 20 caracteres alfanuméricos)" });
    }
    const errorValidacion = validarEmpleado(req.body, { exigirCedula: false });
    if (errorValidacion) return res.status(400).json({ mensaje: errorValidacion });

    const [usuarios] = numeroDocumento
      ? await pool.query("SELECT id_usuario, tipo_documento, numero_documento, id_estado FROM usuarios WHERE numero_documento = ?", [docLimpio])
      : await pool.query("SELECT id_usuario, tipo_documento, numero_documento, id_estado FROM usuarios WHERE id_usuario = ?", [idUsuario]);
    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: "No existe un usuario con ese número de documento. Créalo primero en el módulo Usuarios" });
    }
    const usuario = usuarios[0];
    if (usuario.id_estado !== undefined && usuario.id_estado !== null && Number(usuario.id_estado) !== 1) {
      return res.status(409).json({ mensaje: "No se puede registrar como empleado un usuario inactivo. Actívalo primero en Usuarios" });
    }
    const tipoDoc = usuario.tipo_documento || "CC";
    const cedula = usuario.numero_documento || texto(req.body.cedula);
    const errorDoc = validarDocumento(tipoDoc, cedula);
    if (errorDoc) return res.status(400).json({ mensaje: errorDoc });

    const [yaEmpleado] = await pool.query("SELECT id_empleado FROM empleados WHERE id_usuario = ?", [usuario.id_usuario]);
    if (yaEmpleado.length > 0) return res.status(409).json({ mensaje: "Esta persona ya está registrada como empleado: edítala desde la lista" });

    const [result] = await pool.query(
      `INSERT INTO empleados (id_usuario, cedula, cargo, area, fecha_ingreso, salario, promedio_horas_extras)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [usuario.id_usuario, cedula, texto(cargo), texto(area), normalizarFecha(fechaIngreso), Number(req.body.salario) || 0, Number(req.body.promedioHorasExtras) || 0]
    );
    return res.status(201).json({ mensaje: "Empleado registrado correctamente", idEmpleado: result.insertId });
  } catch (error) {
    return manejarError(res, error, "POST /api/empleados");
  }
}

async function actualizar(req, res) {
  try {
    const { idEmpleado, cargo, area, fechaIngreso, salario, promedioHorasExtras } = req.body;
    if (!idEmpleado) return res.status(400).json({ mensaje: "No se indicó el empleado a actualizar" });
    const errorValidacion = validarEmpleado(req.body, { exigirCedula: false });
    if (errorValidacion) return res.status(400).json({ mensaje: errorValidacion });

    const [existe] = await pool.query("SELECT id_empleado FROM empleados WHERE id_empleado = ?", [idEmpleado]);
    if (existe.length === 0) return res.status(404).json({ mensaje: "Empleado no encontrado" });

    await pool.query(
      `UPDATE empleados
       SET cargo = ?, area = ?, fecha_ingreso = ?, salario = ?, promedio_horas_extras = ?
       WHERE id_empleado = ?`,
      [texto(cargo), texto(area), normalizarFecha(fechaIngreso), Number(salario) || 0, Number(promedioHorasExtras) || 0, idEmpleado]
    );
    return res.status(200).json({ mensaje: "Empleado actualizado correctamente" });
  } catch (error) {
    return manejarError(res, error, "PUT /api/empleados");
  }
}

// PATCH/PUT /api/empleados/estado  (administrador)
// Activa (idEstado=1) o desactiva/retira lógicamente (idEstado=2) al empleado conservando su historial.
async function cambiarEstado(req, res) {
  let conexion = null;
  try {
    const { idEmpleado, idEstado } = req.body;
    if (!idEmpleado || ![1, 2].includes(Number(idEstado))) {
      return res.status(400).json({ mensaje: "Debes indicar idEmpleado e idEstado válido: 1 (Activo) o 2 (Inactivo)" });
    }
    const [rows] = await pool.query("SELECT id_empleado, id_usuario FROM empleados WHERE id_empleado = ?", [idEmpleado]);
    if (rows.length === 0) return res.status(404).json({ mensaje: "Empleado no encontrado" });
    if (Number(rows[0].id_usuario) === req.usuario.idUsuario && Number(idEstado) !== 1) {
      return res.status(400).json({ mensaje: "No puedes desactivar tu propio usuario" });
    }

    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    await conexion.query("UPDATE usuarios SET id_estado = ? WHERE id_usuario = ?", [Number(idEstado), rows[0].id_usuario]);
    try {
      const fechaRetiro = Number(idEstado) === 2 ? new Date().toISOString().substring(0, 10) : null;
      await conexion.query("UPDATE empleados SET fecha_retiro = ? WHERE id_empleado = ?", [fechaRetiro, idEmpleado]);
    } catch (errCol) {
      if (errCol.code !== "ER_BAD_FIELD_ERROR") throw errCol;
    }
    await conexion.commit();
    return res.status(200).json({
      mensaje: Number(idEstado) === 2
        ? "Empleado desactivado correctamente (se conserva su historial laboral)"
        : "Empleado reactivado correctamente",
    });
  } catch (error) {
    if (conexion) await conexion.rollback().catch(() => {});
    return manejarError(res, error, "PATCH /api/empleados/estado");
  } finally {
    if (conexion) conexion.release();
  }
}

async function eliminar(req, res) {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ mensaje: "El parametro id es obligatorio" });
    await pool.query("DELETE FROM empleados WHERE id_empleado = ?", [id]);
    return res.status(200).json({ mensaje: "Empleado eliminado correctamente" });
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        mensaje: "No se puede eliminar este empleado porque tiene certificados o solicitudes asociadas. Usa la opción 'Desactivar' para conservar su historial.",
      });
    }
    return manejarError(res, error, "DELETE /api/empleados");
  }
}

// Divide un arreglo en lotes para consultas SQL IN (...) seguras en cargas grandes.
function dividirEnLotes(lista, tamano = 400) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) {
    lotes.push(lista.slice(i, i + tamano));
  }
  return lotes;
}

// POST /api/empleados/carga-masiva
// Recibe un archivo Excel (.xlsx, .xls) o CSV (.csv) mediante multipart/form-data (campo "archivo").
// Columnas de la plantilla: tipoDocumento, numeroDocumento, primerNombre, segundoNombre,
// primerApellido, segundoApellido, genero, correo, contrasena, cargo, area, fechaIngreso,
// salario, promedioHorasExtras. Por cada fila válida se crea el USUARIO (rol Empleado) y el EMPLEADO.
async function cargaMasiva(req, res) {
  if (!req.file) {
    return res.status(400).json({ mensaje: "Debes adjuntar un archivo Excel (.xlsx, .xls) o CSV (.csv) en el campo 'archivo'" });
  }

  const resultado = { formato: "", totalFilas: 0, insertados: 0, fallidos: 0, errores: [], empleadosCreados: [] };
  let conexion = null;

  try {
    const { formato, filas } = leerArchivoEmpleados(req.file.path, req.file.originalname);
    resultado.formato = formato;
    resultado.totalFilas = filas.length;

    if (filas.length === 0) {
      return res.status(400).json({ mensaje: `El archivo ${formato} no contiene filas de datos` });
    }

    // Fase 1: validación completa en memoria + detección de duplicados dentro del mismo archivo.
    const filasValidas = [];
    const correosEnArchivo = new Map();
    const documentosEnArchivo = new Map();

    for (const { numeroFila, datos: fila } of filas) {
      // Soporta columnas oficiales y compatibilidad con columnas antiguas ("cedula" y "nombre").
      const partes = fila.primerNombre || fila.primerApellido ? {} : dividirNombre(fila.nombre);
      const tipoDocOriginal = texto(fila.tipoDocumento);
      const persona = {
        tipoDocumento: normalizarTipoDocumento(tipoDocOriginal || "CC"),
        numeroDocumento: texto(fila.numeroDocumento || fila.cedula),
        primerNombre: texto(fila.primerNombre) || partes.primerNombre || "",
        segundoNombre: texto(fila.segundoNombre) || partes.segundoNombre || "",
        primerApellido: texto(fila.primerApellido) || partes.primerApellido || "",
        segundoApellido: texto(fila.segundoApellido) || partes.segundoApellido || "",
        genero: normalizarGenero(fila.genero),
      };
      const correo = texto(fila.correo).toLowerCase();
      const contrasenaRaw = texto(fila.contrasena);
      const contrasena = contrasenaRaw || "123456"; // valor por defecto si se deja vacía
      const usaContrasenaTemporal = !contrasenaRaw;
      const cargo = texto(fila.cargo);
      const area = texto(fila.area);
      const fechaIngreso = normalizarFecha(fila.fechaIngreso);
      const cedula = persona.numeroDocumento;

      if (!persona.numeroDocumento || !persona.primerNombre || !persona.primerApellido || !correo || !cargo || !area || !texto(fila.fechaIngreso)) {
        resultado.fallidos++;
        resultado.errores.push(`Fila ${numeroFila}: faltan campos obligatorios (numeroDocumento, primerNombre, primerApellido, correo, cargo, area, fechaIngreso)`);
        continue;
      }

      const salParsed = parsearNumeroOpcional(fila.salario, "El salario");
      const extParsed = parsearNumeroOpcional(fila.promedioHorasExtras, "El promedio de horas extras");

      const errorFila =
        validarPersona(persona) ||
        validarUsuario({ correo, contrasena, idRol: 2, idEstado: 1 }, { exigirContrasena: true }) ||
        salParsed.error ||
        extParsed.error ||
        validarEmpleado(
          { cedula, cargo, area, fechaIngreso, salario: salParsed.valor, promedioHorasExtras: extParsed.valor },
          { exigirCedula: false } // validarPersona ya validó el formato según tipoDocumento (incluyendo PA)
        );
      if (errorFila) {
        resultado.fallidos++;
        resultado.errores.push(`Fila ${numeroFila} (${correo}): ${errorFila}`);
        continue;
      }

      if (correosEnArchivo.has(correo)) {
        resultado.fallidos++;
        resultado.errores.push(`Fila ${numeroFila} (${correo}): correo repetido dentro del archivo (ya aparece en la fila ${correosEnArchivo.get(correo)})`);
        continue;
      }
      if (documentosEnArchivo.has(cedula)) {
        resultado.fallidos++;
        resultado.errores.push(`Fila ${numeroFila} (${correo}): documento '${cedula}' repetido dentro del archivo (ya aparece en la fila ${documentosEnArchivo.get(cedula)})`);
        continue;
      }

      correosEnArchivo.set(correo, numeroFila);
      documentosEnArchivo.set(cedula, numeroFila);
      filasValidas.push({
        numeroFila,
        persona,
        nombre: nombreCompleto(persona),
        correo,
        contrasena,
        usaContrasenaTemporal,
        cedula,
        cargo,
        area,
        fechaIngreso,
        salario: salParsed.valor,
        promedioHorasExtras: extParsed.valor,
      });
    }

    // Fase 2: precarga masiva de duplicados ya existentes en BD + inserción atómica por fila reutilizando 1 conexión.
    if (filasValidas.length > 0) {
      conexion = await pool.getConnection();
      const correosExistentes = new Set();
      const documentosExistentes = new Set();

      const todosCorreos = filasValidas.map((f) => f.correo);
      const todosDocs = filasValidas.map((f) => f.cedula);
      const lotesCorreos = dividirEnLotes(todosCorreos);
      const lotesDocs = dividirEnLotes(todosDocs);

      // Precarga paralela de duplicados (elimina waterfalls de consultas secuenciales).
      await Promise.all([
        ...lotesCorreos.map(async (lote) => {
          const ph = lote.map(() => "?").join(", ");
          const [rows] = await conexion.query(`SELECT LOWER(correo) AS correo FROM usuarios WHERE LOWER(correo) IN (${ph})`, lote);
          for (const r of rows) correosExistentes.add(String(r.correo).toLowerCase());
        }),
        ...lotesDocs.map(async (lote) => {
          const ph = lote.map(() => "?").join(", ");
          const [[rowsU], [rowsE]] = await Promise.all([
            conexion.query(`SELECT numero_documento FROM usuarios WHERE numero_documento IN (${ph})`, lote),
            conexion.query(`SELECT cedula FROM empleados WHERE cedula IN (${ph})`, lote),
          ]);
          for (const r of rowsU) if (r.numero_documento) documentosExistentes.add(String(r.numero_documento));
          for (const r of rowsE) if (r.cedula) documentosExistentes.add(String(r.cedula));
        }),
      ]);

      for (const item of filasValidas) {
        if (correosExistentes.has(item.correo)) {
          resultado.fallidos++;
          resultado.errores.push(`Fila ${item.numeroFila} (${item.correo}): el correo '${item.correo}' ya está registrado`);
          continue;
        }
        if (documentosExistentes.has(item.cedula)) {
          resultado.fallidos++;
          resultado.errores.push(`Fila ${item.numeroFila} (${item.correo}): el documento '${item.cedula}' ya está registrado`);
          continue;
        }

        try {
          await conexion.beginTransaction();

          const hash = await hashear(item.contrasena);
          let resultadoUsuario;
          try {
            [resultadoUsuario] = await conexion.query(
              `INSERT INTO usuarios (tipo_documento, numero_documento, primer_nombre, segundo_nombre, primer_apellido,
                 segundo_apellido, genero, nombre, correo, contrasena, id_rol, id_estado, debe_cambiar_contrasena)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 1, ?)`,
              [
                item.persona.tipoDocumento,
                item.cedula,
                item.persona.primerNombre,
                item.persona.segundoNombre || null,
                item.persona.primerApellido,
                item.persona.segundoApellido || null,
                item.persona.genero,
                item.nombre,
                item.correo,
                hash,
                item.usaContrasenaTemporal ? 1 : 0,
              ]
            );
          } catch (errCol) {
            if (errCol.code !== "ER_BAD_FIELD_ERROR") throw errCol;
            [resultadoUsuario] = await conexion.query(
              `INSERT INTO usuarios (tipo_documento, numero_documento, primer_nombre, segundo_nombre, primer_apellido,
                 segundo_apellido, genero, nombre, correo, contrasena, id_rol, id_estado)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 1)`,
              [
                item.persona.tipoDocumento,
                item.cedula,
                item.persona.primerNombre,
                item.persona.segundoNombre || null,
                item.persona.primerApellido,
                item.persona.segundoApellido || null,
                item.persona.genero,
                item.nombre,
                item.correo,
                hash,
              ]
            );
          }
          const idUsuarioNuevo = resultadoUsuario.insertId;

          await conexion.query(
            `INSERT INTO empleados (id_usuario, cedula, cargo, area, fecha_ingreso, salario, promedio_horas_extras)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [idUsuarioNuevo, item.cedula, item.cargo, item.area, item.fechaIngreso, item.salario, item.promedioHorasExtras]
          );

          await conexion.commit();
          correosExistentes.add(item.correo);
          documentosExistentes.add(item.cedula);
          resultado.insertados++;
          resultado.empleadosCreados.push({
            fila: item.numeroFila,
            documento: `${item.persona.tipoDocumento} ${item.cedula}`,
            nombre: item.nombre,
            correo: item.correo,
            cargo: item.cargo,
            area: item.area,
          });
        } catch (errorTransaccion) {
          await conexion.rollback().catch(() => {});
          resultado.fallidos++;
          let detalle = errorTransaccion.message;
          if (errorTransaccion.code === "ER_DUP_ENTRY") {
            const sqlMsg = String(errorTransaccion.sqlMessage || "");
            if (/correo/i.test(sqlMsg)) detalle = `el correo '${item.correo}' ya está registrado`;
            else if (/numero_documento|cedula/i.test(sqlMsg)) detalle = `el documento '${item.cedula}' ya está registrado`;
            else detalle = "registro duplicado en la base de datos";
          }
          resultado.errores.push(`Fila ${item.numeroFila} (${item.correo || "sin correo"}): ${detalle}`);
        }
      }
    }

    return res.status(200).json({
      mensaje: `Carga masiva (${resultado.formato}) finalizada: ${resultado.insertados} empleados creados, ${resultado.fallidos} con error (de ${resultado.totalFilas} filas).`,
      ...resultado,
    });
  } catch (error) {
    console.error("Error en POST /api/empleados/carga-masiva:", error.message);
    return res.status(400).json({ mensaje: "No se pudo leer el archivo. Verifica que sea un Excel (.xlsx, .xls) o CSV (.csv) válido." });
  } finally {
    if (conexion) conexion.release();
    // Elimina el archivo temporal subido por multer
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
  }
}

// GET /api/empleados/plantilla?formato=xlsx|csv (administrador): descarga la plantilla para carga masiva.
function descargarPlantilla(req, res) {
  const formato = String(req.query.formato || "xlsx").toLowerCase();
  if (formato === "csv") {
    const rutaCsv = path.join(__dirname, "..", "..", "plantilla_carga_empleados.csv");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.download(rutaCsv, "plantilla_carga_empleados.csv");
  }
  return res.download(path.join(__dirname, "..", "..", "plantilla_carga_empleados.xlsx"), "plantilla_carga_empleados.xlsx");
}

module.exports = { listarOConsultar, crear, actualizar, cambiarEstado, eliminar, cargaMasiva, descargarPlantilla };
