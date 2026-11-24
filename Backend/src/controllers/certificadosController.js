const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { pool } = require("../config/db");
const { esAdmin } = require("../utils/auth");
const { enviarCertificado } = require("../utils/mailer");
const { manejarError } = require("../utils/errores");

const TIPO_CARTA_A_ID = {
  todos: 1,
  sin_basico: 2,
  con_extras: 3,
};

const ID_A_TIPO_CARTA = {
  1: "todos",
  2: "sin_basico",
  3: "con_extras",
};

const NOMBRE_DOCUMENTO_PDF = {
  CC: "cédula de ciudadanía",
  CE: "cédula de extranjería",
  PPT: "Permiso por Protección Temporal (PPT)",
  PA: "pasaporte",
};

const CARPETA_CERTIFICADOS = path.join(__dirname, "..", "..", "certificados");
if (!fs.existsSync(CARPETA_CERTIFICADOS)) {
  fs.mkdirSync(CARPETA_CERTIFICADOS, { recursive: true });
}

const prohibido = (res) => res.status(403).json({ mensaje: "No tienes permiso para realizar esta acción" });
const MAX_INTENTOS_CONSECUTIVO = 3;

const SELECT_CERTIFICADO_CON_AUDITORIA = `
  SELECT c.*,
    u.nombre AS nombre_empleado,
    COALESCE(u.numero_documento, e.cedula) AS cedula_empleado,
    u.tipo_documento AS tipo_documento_empleado,
    e.cargo AS cargo_empleado,
    tc.nombre_tipo AS tipo_certificado,
    ug.nombre AS generado_por_nombre
  FROM certificados c
  LEFT JOIN empleados e ON e.id_empleado = c.id_empleado
  LEFT JOIN usuarios u ON u.id_usuario = e.id_usuario
  LEFT JOIN tipo_certificados tc ON tc.id_tipo = c.id_tipo
  LEFT JOIN usuarios ug ON ug.id_usuario = c.generado_por
`;

const SELECT_CERTIFICADO_BASE = `
  SELECT c.*,
    u.nombre AS nombre_empleado,
    COALESCE(u.numero_documento, e.cedula) AS cedula_empleado,
    u.tipo_documento AS tipo_documento_empleado,
    e.cargo AS cargo_empleado,
    tc.nombre_tipo AS tipo_certificado
  FROM certificados c
  LEFT JOIN empleados e ON e.id_empleado = c.id_empleado
  LEFT JOIN usuarios u ON u.id_usuario = e.id_usuario
  LEFT JOIN tipo_certificados tc ON tc.id_tipo = c.id_tipo
`;

async function consultarCertificados(filtroSql = "", params = []) {
  try {
    const [rows] = await pool.query(`${SELECT_CERTIFICADO_CON_AUDITORIA} ${filtroSql}`, params);
    return rows;
  } catch (error) {
    if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
    const [rows] = await pool.query(`${SELECT_CERTIFICADO_BASE} ${filtroSql}`, params);
    return rows;
  }
}

async function listarOConsultar(req, res) {
  try {
    const { idEmpleado, page, limit } = req.query;
    if (idEmpleado) {
      // Un empleado solo puede ver el historial de sus propios certificados.
      if (!esAdmin(req)) {
        const [duenio] = await pool.query("SELECT id_usuario FROM empleados WHERE id_empleado = ?", [idEmpleado]);
        if (duenio.length === 0 || duenio[0].id_usuario !== req.usuario.idUsuario) return prohibido(res);
      }
      const rows = await consultarCertificados("WHERE c.id_empleado = ? ORDER BY c.fecha_generacion DESC", [idEmpleado]);
      return res.status(200).json(rows);
    }
    if (!esAdmin(req)) return prohibido(res);

    if (page !== undefined) {
      const pagina = Math.max(1, Number(page) || 1);
      const tam = Math.min(100, Math.max(1, Number(limit) || 25));
      const offset = (pagina - 1) * tam;
      const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM certificados");
      const datos = await consultarCertificados("ORDER BY c.fecha_generacion DESC LIMIT ? OFFSET ?", [tam, offset]);
      return res.status(200).json({ datos, total, page: pagina, limit: tam, totalPaginas: Math.ceil(total / tam) });
    }

    const rows = await consultarCertificados("ORDER BY c.fecha_generacion DESC");
    return res.status(200).json(rows);
  } catch (error) {
    return manejarError(res, error, "GET /api/certificados");
  }
}

function generarCodigoVerificacion() {
  return `VER-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

// Reserva el siguiente consecutivo. La columna tiene restriccion UNIQUE, asi que si dos
// personas generan a la vez y chocan (ER_DUP_ENTRY), se recalcula y se reintenta.
async function registrarCertificado({ empleado, idTipo, incluyeSueldo, canal, generadoPor }) {
  for (let intento = 1; intento <= MAX_INTENTOS_CONSECUTIVO; intento++) {
    const [maxRows] = await pool.query("SELECT MAX(consecutivo) AS maxConsecutivo FROM certificados");
    const consecutivo = (maxRows[0].maxConsecutivo || 0) + 1;
    const consecutivoFormateado = String(consecutivo).padStart(4, "0");
    const nombreArchivo = `CERT-${consecutivoFormateado}-${Date.now()}.pdf`;
    const codigoVerificacion = generarCodigoVerificacion();
    try {
      let result;
      try {
        [result] = await pool.query(
          `INSERT INTO certificados (id_empleado, id_tipo, consecutivo, incluye_sueldo, canal_entrega, archivo_pdf, generado_por, codigo_verificacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [empleado.id_empleado, idTipo, consecutivo, incluyeSueldo, canal, nombreArchivo, generadoPor || null, codigoVerificacion]
        );
      } catch (errCol) {
        if (errCol.code !== "ER_BAD_FIELD_ERROR") throw errCol;
        [result] = await pool.query(
          `INSERT INTO certificados (id_empleado, id_tipo, consecutivo, incluye_sueldo, canal_entrega, archivo_pdf)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [empleado.id_empleado, idTipo, consecutivo, incluyeSueldo, canal, nombreArchivo]
        );
      }
      return { idCertificado: result.insertId, consecutivo, consecutivoFormateado, nombreArchivo, codigoVerificacion };
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY" || intento === MAX_INTENTOS_CONSECUTIVO) throw error;
    }
  }
}

async function generar(req, res) {
  let registro = null;
  let rutaArchivo = null;
  let enviandoCorreo = false;
  try {
    const { idUsuario, idEmpleado, tipoCarta, canal } = req.body;
    if ((!idUsuario && !idEmpleado) || !tipoCarta || !canal) {
      return res.status(400).json({ mensaje: "Faltan campos obligatorios: idUsuario (o idEmpleado), tipoCarta, canal" });
    }
    const idTipo = TIPO_CARTA_A_ID[tipoCarta];
    if (!idTipo) {
      return res.status(400).json({ mensaje: "tipoCarta invalido. Use: todos, sin_basico o con_extras" });
    }
    if (!["pdf", "correo"].includes(canal)) {
      return res.status(400).json({ mensaje: "canal invalido. Use: pdf o correo" });
    }

    // Un empleado solo puede generar SUS propios certificados.
    // El administrador puede generar certificados propios o de cualquier otro empleado.
    if (!esAdmin(req) && idUsuario !== undefined && idUsuario !== null && Number(idUsuario) !== req.usuario.idUsuario) {
      return prohibido(res);
    }

    const consultaPor = idEmpleado ? "e.id_empleado = ?" : "e.id_usuario = ?";
    const parametroConsulta = idEmpleado || idUsuario;
    const [empleados] = await pool.query(
      `SELECT e.*, u.nombre, u.correo, u.tipo_documento, u.numero_documento, u.genero, u.id_estado
       FROM empleados e
       JOIN usuarios u ON u.id_usuario = e.id_usuario
       WHERE ${consultaPor}`,
      [parametroConsulta]
    );
    if (empleados.length === 0) {
      return res.status(404).json({ mensaje: "No se encontro un perfil de empleado para este usuario" });
    }
    const empleado = empleados[0];

    if (!esAdmin(req) && Number(empleado.id_usuario) !== req.usuario.idUsuario) {
      return prohibido(res);
    }
    if (empleado.id_estado !== undefined && empleado.id_estado !== null && Number(empleado.id_estado) !== 1) {
      return res.status(409).json({ mensaje: "No se puede generar un certificado laboral activo para un empleado inactivo" });
    }

    // Tanto "todos" (Completa) como "con_extras" (Con Horas Extras) incluyen el salario básico mensual.
    const incluyeSueldo = tipoCarta === "sin_basico" ? 0 : 1;
    registro = await registrarCertificado({
      empleado,
      idTipo,
      incluyeSueldo,
      canal,
      generadoPor: req.usuario.idUsuario,
    });

    rutaArchivo = path.join(CARPETA_CERTIFICADOS, registro.nombreArchivo);
    await generarPdfCertificado(rutaArchivo, {
      consecutivo: registro.consecutivoFormateado,
      codigoVerificacion: registro.codigoVerificacion,
      empleado,
      tipoCarta,
    });

    if (canal === "correo") {
      enviandoCorreo = true;
      await enviarCertificado({
        para: empleado.correo,
        nombre: empleado.nombre,
        consecutivo: registro.consecutivoFormateado,
        rutaPdf: rutaArchivo,
        nombreArchivo: registro.nombreArchivo,
      });
      return res.status(200).json({
        mensaje: `Certificado N. ${registro.consecutivoFormateado} enviado al correo: ${empleado.correo}`,
        consecutivo: registro.consecutivo,
        codigoVerificacion: registro.codigoVerificacion,
        empleado: {
          idEmpleado: empleado.id_empleado,
          nombre: empleado.nombre,
          correo: empleado.correo,
        },
      });
    }

    return res.download(rutaArchivo, registro.nombreArchivo);
  } catch (error) {
    // Si algo fallo despues de reservar el consecutivo, se deshace para no dejar registros fantasma.
    if (registro) {
      await pool.query("DELETE FROM certificados WHERE id_certificado = ?", [registro.idCertificado]).catch(() => {});
      if (rutaArchivo) fs.unlink(rutaArchivo, () => {});
    }
    if (error.code === "SMTP_NO_CONFIGURADO") {
      return res.status(503).json({
        mensaje: "El envio por correo no esta configurado en el servidor. Descarga el PDF o pide al administrador configurar el correo (SMTP).",
      });
    }
    if (enviandoCorreo) {
      console.error("Error enviando correo:", error.message);
      return res.status(502).json({ mensaje: "No se pudo enviar el correo. Intenta de nuevo o descarga el PDF." });
    }
    return manejarError(res, error, "POST /api/certificados");
  }
}

// GET /api/certificados/:id/descargar
// Permite volver a descargar un certificado del historial; si el archivo local no existe
// (ej. tras reinicio en Render), lo regenera con el mismo consecutivo, fecha y código de verificación.
async function descargarExistente(req, res) {
  try {
    const idCertificado = Number(req.params.id);
    if (!idCertificado) return res.status(400).json({ mensaje: "ID de certificado inválido" });

    const [rows] = await pool.query(
      `SELECT c.*, e.id_usuario, e.cedula, e.cargo, e.area, e.fecha_ingreso, e.salario, e.promedio_horas_extras,
              u.nombre, u.correo, u.tipo_documento, u.numero_documento, u.genero
       FROM certificados c
       JOIN empleados e ON e.id_empleado = c.id_empleado
       JOIN usuarios u ON u.id_usuario = e.id_usuario
       WHERE c.id_certificado = ?`,
      [idCertificado]
    );
    if (rows.length === 0) return res.status(404).json({ mensaje: "Certificado no encontrado" });

    const cert = rows[0];
    if (!esAdmin(req) && Number(cert.id_usuario) !== req.usuario.idUsuario) return prohibido(res);

    const consecutivoFormateado = String(cert.consecutivo).padStart(4, "0");
    const nombreSeguro = path.basename(cert.archivo_pdf || `CERT-${consecutivoFormateado}.pdf`);
    const rutaArchivo = path.join(CARPETA_CERTIFICADOS, nombreSeguro);

    if (!fs.existsSync(rutaArchivo)) {
      const tipoCarta = ID_A_TIPO_CARTA[cert.id_tipo] || (cert.incluye_sueldo ? "todos" : "sin_basico");
      await generarPdfCertificado(rutaArchivo, {
        consecutivo: consecutivoFormateado,
        codigoVerificacion: cert.codigo_verificacion || null,
        fechaExpedicion: cert.fecha_generacion || new Date(),
        empleado: cert,
        tipoCarta,
      });
    }

    return res.download(rutaArchivo, nombreSeguro);
  } catch (error) {
    return manejarError(res, error, "GET /api/certificados/:id/descargar");
  }
}

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Extrae (anio, mes, dia) sin corrimiento de zona horaria cuando viene una fecha ISO "AAAA-MM-DD" o DATE en UTC 00:00.
function partesFechaSegura(fecha) {
  if (typeof fecha === "string") {
    const m = fecha.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
  }
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const esMedianocheUtc =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  if (esMedianocheUtc) {
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
  }
  return { anio: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate() };
}

function formatearFechaLarga(fecha) {
  const p = partesFechaSegura(fecha);
  if (!p) return "";
  return `${p.dia} de ${MESES_ES[p.mes - 1]} de ${p.anio}`;
}

function formatearFechaCorta(fecha) {
  const p = partesFechaSegura(fecha);
  if (!p) return "";
  return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}/${p.anio}`;
}

function formatearMoneda(valor) {
  return `$ ${Number(valor).toLocaleString("es-CO")}`;
}

function textosPorGenero(genero) {
  const g = String(genero || "").trim().toLowerCase();
  if (g === "femenino") {
    return { trato: "la señora", identificado: "identificada", empleado: "la empleada", activo: "activa" };
  }
  if (g === "masculino") {
    return { trato: "el señor", identificado: "identificado", empleado: "el empleado", activo: "activo" };
  }
  return { trato: "el/la señor(a)", identificado: "identificado(a)", empleado: "el/la empleado(a)", activo: "activo(a)" };
}

function textoDocumentoPdf(empleado) {
  const codigo = String(empleado.tipo_documento || "CC").toUpperCase();
  const nombreDoc = NOMBRE_DOCUMENTO_PDF[codigo] || "cédula de ciudadanía";
  const numero = empleado.numero_documento || empleado.cedula || "";
  return `${nombreDoc} N.° ${numero}`;
}

const RUTA_LOGO = path.join(__dirname, "..", "..", "assets", "portal-autogestion.jpg");
const LOGO_BUFFER = fs.existsSync(RUTA_LOGO) ? fs.readFileSync(RUTA_LOGO) : null;
const AZUL = "#0F2F80";
const AZUL_OSCURO = "#0A2266";
const AZUL_CLARO = "#E3ECFF";
const DORADO = "#EF9F27";
const GRIS_TEXTO = "#1A1F2E";
const GRIS_CLARO = "#4A5675";

function generarPdfCertificado(rutaArchivo, { consecutivo, codigoVerificacion = null, fechaExpedicion = new Date(), empleado, tipoCarta }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: "LETTER", info: { Title: `Certificación laboral N.° ${consecutivo}`, Author: "Portal de Autogestión" } });
    const stream = fs.createWriteStream(rutaArchivo);
    doc.pipe(stream);

    const W = doc.page.width;
    const H = doc.page.height;
    const margen = 56;
    const ancho = W - margen * 2;
    const generoTxt = textosPorGenero(empleado.genero);
    const incluyeSalario = tipoCarta === "todos" || tipoCarta === "con_extras";

    // ===== Marca de agua: anillos concéntricos muy tenues =====
    doc.save().opacity(0.045).lineWidth(26).circle(W / 2, H / 2 + 20, 210).stroke(AZUL)
      .lineWidth(8).circle(W / 2, H / 2 + 20, 245).stroke(DORADO).restore();

    // ===== Encabezado azul con logo y título =====
    const altoEnc = 124;
    doc.rect(0, 0, W, altoEnc).fill(AZUL_OSCURO);
    doc.save().rect(0, 0, W, altoEnc).clip().opacity(0.12).circle(W - 40, -10, 120).fill("#FFFFFF").circle(W - 150, altoEnc + 20, 70).fill(DORADO).restore();
    doc.roundedRect(margen - 6, 22, 226, 80, 10).fill("#FFFFFF");
    if (LOGO_BUFFER) {
      doc.image(LOGO_BUFFER, margen - 2, 26, { fit: [218, 72], align: "center", valign: "center" });
    } else {
      doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(14).text("PORTAL DE AUTOGESTIÓN", margen, 54, { width: 214, align: "center" });
    }
    const xTitulo = margen + 240;
    const anchoTitulo = W - margen - xTitulo;
    doc.fillColor(DORADO).font("Helvetica-Bold").fontSize(9).text("DOCUMENTO OFICIAL", xTitulo, 34, { width: anchoTitulo, align: "right", characterSpacing: 2.5 });
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(23).text("CERTIFICACIÓN", xTitulo, 50, { width: anchoTitulo, align: "right" });
    doc.text("LABORAL", xTitulo, 76, { width: anchoTitulo, align: "right" });
    doc.rect(0, altoEnc, W, 5).fill(DORADO);

    // ===== Consecutivo y fecha =====
    let y = altoEnc + 28;
    const etiquetaNum = `N.° ${consecutivo}`;
    doc.font("Helvetica-Bold").fontSize(10);
    const anchoNum = doc.widthOfString(etiquetaNum) + 24;
    doc.roundedRect(margen, y - 4, anchoNum, 22, 11).fill(AZUL_CLARO);
    doc.fillColor(AZUL).text(etiquetaNum, margen, y + 2, { width: anchoNum, align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor(GRIS_CLARO)
      .text(`Bogotá D.C., ${formatearFechaLarga(fechaExpedicion)}`, margen, y + 2, { width: ancho, align: "right" });
    y += 38;

    const subtitulos = { todos: null, sin_basico: "Sin salario básico", con_extras: "Con salario básico y promedio de horas extras" };
    if (subtitulos[tipoCarta]) {
      doc.font("Helvetica-Oblique").fontSize(10).fillColor(GRIS_CLARO).text(subtitulos[tipoCarta], margen, y - 6, { width: ancho, align: "center" });
      y += 12;
    }

    // ===== Saludo y presentación =====
    doc.font("Helvetica-Bold").fontSize(12).fillColor(AZUL).text("A quien pueda interesar:", margen, y, { width: ancho });
    y += 26;
    doc.font("Helvetica").fontSize(11).fillColor(GRIS_TEXTO)
      .text(`El Portal de Autogestión certifica que ${generoTxt.trato}:`, margen, y, { width: ancho });
    y += 34;

    // ===== Nombre destacado =====
    doc.font("Helvetica-Bold").fontSize(21).fillColor(AZUL).text(String(empleado.nombre || "").toUpperCase(), margen, y, { width: ancho, align: "center" });
    y = doc.y + 6;
    doc.rect(W / 2 - 40, y, 80, 3).fill(DORADO);
    y += 14;
    doc.font("Helvetica").fontSize(11).fillColor(GRIS_TEXTO)
      .text(`${generoTxt.identificado} con ${textoDocumentoPdf(empleado)}`, margen, y, { width: ancho, align: "center" });
    y += 36;

    // ===== Datos laborales =====
    const campos = [
      ["Cargo", empleado.cargo],
      ["Área / Departamento", empleado.area],
      ["Fecha de ingreso", formatearFechaCorta(empleado.fecha_ingreso)],
    ];
    if (incluyeSalario) campos.push(["Salario básico mensual", formatearMoneda(empleado.salario)]);
    if (tipoCarta === "con_extras") campos.push(["Promedio horas extras (3 meses)", `${empleado.promedio_horas_extras} horas`]);

    const altoFila = 28;
    const altoCard = campos.length * altoFila;
    doc.roundedRect(margen, y, ancho, altoCard, 8).fill("#F7F9FE");
    campos.forEach(([etiqueta, valor], i) => {
      const yf = y + i * altoFila;
      if (i % 2 === 1) doc.save().rect(margen + 5, yf, ancho - 5, altoFila).fill("#EEF3FF").restore();
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(GRIS_CLARO)
        .text(etiqueta.toUpperCase(), margen + 20, yf + 10, { width: 230, characterSpacing: 0.4 });
      doc.font("Helvetica-Bold").fontSize(11).fillColor(GRIS_TEXTO)
        .text(String(valor), margen + 262, yf + 8.5, { width: ancho - 276 });
    });
    doc.roundedRect(margen, y, 5, altoCard, 2.5).fill(DORADO);
    y += altoCard + 28;

    // ===== Cláusulas =====
    const clausulaSalario = incluyeSalario ? ", devengando el salario básico mensual indicado" : "";
    doc.font("Helvetica").fontSize(11).fillColor(GRIS_TEXTO).text(
      `Se certifica que ${generoTxt.empleado} se encuentra ${generoTxt.activo} en nuestra empresa${clausulaSalario} ` +
      "con todos los beneficios de ley del Código Sustantivo del Trabajo de Colombia.",
      margen, y, { align: "justify", width: ancho, lineGap: 3 }
    );
    doc.moveDown(0.7);
    doc.text("La presente certificación se expide con veracidad y es válida a la fecha indicada.", margen, doc.y, { align: "justify", width: ancho, lineGap: 3 });

    // ===== Firma y sello =====
    const yFirma = H - 170;
    doc.moveTo(margen, yFirma).lineTo(margen + 230, yFirma).lineWidth(1).stroke(AZUL);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(AZUL).text("Recursos Humanos", margen, yFirma + 8, { width: 260 });
    doc.font("Helvetica").fontSize(9.5).fillColor(GRIS_CLARO)
      .text("Portal de Autogestión", margen, yFirma + 23, { width: 260 })
      .text("Firma autorizada / Sello empresa", margen, yFirma + 36, { width: 260 });
    if (codigoVerificacion) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(AZUL)
        .text(`Código de verificación: ${codigoVerificacion}`, margen, yFirma + 52, { width: 260 });
    }

    const cx = W - margen - 48;
    const cy = yFirma - 6;
    doc.lineWidth(3).circle(cx, cy, 46).stroke(DORADO).lineWidth(1).circle(cx, cy, 39).stroke(AZUL);
    doc.circle(cx, cy, 34).fill(AZUL_CLARO);
    doc.lineWidth(3).lineCap("round").lineJoin("round").moveTo(cx - 12, cy - 6).lineTo(cx - 4, cy + 3).lineTo(cx + 12, cy - 15).stroke(DORADO);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(AZUL).text("DOCUMENTO", cx - 34, cy + 9, { width: 68, align: "center", characterSpacing: 1 });
    doc.text("VÁLIDO", cx - 34, cy + 20, { width: 68, align: "center", characterSpacing: 1.5 });

    // ===== Pie de página =====
    const altoPie = 40;
    doc.rect(0, H - altoPie - 4, W, 4).fill(DORADO);
    doc.rect(0, H - altoPie, W, altoPie).fill(AZUL_OSCURO);
    const sufijoCodigo = codigoVerificacion ? `  ·  Código: ${codigoVerificacion}` : "";
    doc.font("Helvetica").fontSize(8).fillColor("#D8E1FA").text(
      `Portal de Autogestión © ${new Date().getFullYear()}  ·  Documento generado electrónicamente  ·  Consecutivo N.° ${consecutivo}${sufijoCodigo}`,
      margen, H - altoPie + 15, { align: "center", width: ancho }
    );

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

module.exports = {
  listarOConsultar,
  generar,
  descargarExistente,
  generarPdfCertificado,
  formatearFechaCorta,
  formatearFechaLarga,
  textosPorGenero,
  textoDocumentoPdf,
};
