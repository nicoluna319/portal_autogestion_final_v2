const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const sinTildes = (v) =>
  String(v ?? "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const ALIAS_COLUMNAS = {
  tipodocumento: "tipoDocumento",
  tipodoc: "tipoDocumento",
  numerodocumento: "numeroDocumento",
  numdocumento: "numeroDocumento",
  documento: "numeroDocumento",
  identificacion: "numeroDocumento",
  cedula: "cedula",
  primernombre: "primerNombre",
  segundonombre: "segundoNombre",
  primerapellido: "primerApellido",
  segundoapellido: "segundoApellido",
  nombre: "nombre",
  nombrecompleto: "nombre",
  genero: "genero",
  sexo: "genero",
  correo: "correo",
  email: "correo",
  correoelectronico: "correo",
  contrasena: "contrasena",
  clave: "contrasena",
  password: "contrasena",
  cargo: "cargo",
  area: "area",
  dependencia: "area",
  departamento: "area",
  fechaingreso: "fechaIngreso",
  salario: "salario",
  salariobasico: "salario",
  promediohorasextras: "promedioHorasExtras",
  horasextras: "promedioHorasExtras",
};

function normalizarEncabezado(raw) {
  const clave = sinTildes(raw);
  return ALIAS_COLUMNAS[clave] || String(raw ?? "").replace(/^\uFEFF/, "").trim();
}

function decodificarTextoCsv(buffer) {
  let texto;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Archivos guardados en Excel (Windows) con codificación ANSI / Windows-1252.
    texto = new TextDecoder("windows-1252").decode(buffer);
  }
  return texto.replace(/^\uFEFF/, "");
}

function detectarDelimitador(texto) {
  const primeraLinea = texto.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const conteo = { ",": 0, ";": 0, "\t": 0 };
  let enComillas = false;
  for (let i = 0; i < primeraLinea.length; i++) {
    const c = primeraLinea[i];
    if (c === '"') {
      if (enComillas && primeraLinea[i + 1] === '"') i++;
      else enComillas = !enComillas;
    } else if (!enComillas && c in conteo) {
      conteo[c]++;
    }
  }
  if (conteo[";"] > conteo[","] && conteo[";"] >= conteo["\t"]) return ";";
  if (conteo["\t"] > conteo[","] && conteo["\t"] > conteo[";"]) return "\t";
  return ",";
}

// Parser CSV compatible con RFC 4180 (comillas, comillas escapadas "" y saltos de línea dentro de comillas).
function parsearCsvMatriz(texto) {
  const delimitador = detectarDelimitador(texto);
  const filas = [];
  let fila = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        celda += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === delimitador) {
      fila.push(celda);
      celda = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else {
      celda += c;
    }
  }

  if (celda.length > 0 || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

function esFilaVacia(celdas) {
  return !celdas || celdas.every((c) => c === undefined || c === null || String(c).trim() === "");
}

function convertirMatrizAFilas(matriz) {
  const indiceEncabezado = matriz.findIndex((f) => !esFilaVacia(f));
  if (indiceEncabezado === -1) return { encabezados: [], filas: [] };

  const encabezados = matriz[indiceEncabezado].map(normalizarEncabezado);
  const filas = [];

  for (let i = indiceEncabezado + 1; i < matriz.length; i++) {
    const celdas = matriz[i];
    if (esFilaVacia(celdas)) continue;

    const datos = {};
    for (let col = 0; col < encabezados.length; col++) {
      const clave = encabezados[col];
      if (!clave) continue;
      datos[clave] = celdas[col] !== undefined && celdas[col] !== null ? celdas[col] : "";
    }
    filas.push({ numeroFila: i + 1, datos });
  }

  return { encabezados, filas };
}

/**
 * Lee un archivo Excel (.xlsx, .xls) o CSV (.csv) y devuelve las filas normalizadas
 * junto con su número de fila real (1-based, considerando la fila 1 como encabezado).
 */
function leerArchivoEmpleados(rutaArchivo, nombreOriginal = "") {
  const ext = path.extname(nombreOriginal || rutaArchivo).toLowerCase();

  if (ext === ".csv") {
    const buffer = fs.readFileSync(rutaArchivo);
    const contenido = decodificarTextoCsv(buffer);
    const matriz = parsearCsvMatriz(contenido);
    return { formato: "CSV", ...convertirMatrizAFilas(matriz) };
  }

  // Excel (.xlsx / .xls): cellDates conserva las fechas de Excel como Date reales.
  const libro = XLSX.readFile(rutaArchivo, { cellDates: true });
  const nombreHoja =
    libro.SheetNames.find((n) => sinTildes(n) === "empleados") || libro.SheetNames[0];
  const hoja = libro.Sheets[nombreHoja];
  const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });
  return { formato: "Excel", ...convertirMatrizAFilas(matriz) };
}

/**
 * Parsea un campo numérico opcional (salario, promedioHorasExtras).
 * Rechaza textos inválidos en lugar de convertirlos silenciosamente en 0.
 */
function parsearNumeroOpcional(valor, etiqueta) {
  if (valor === undefined || valor === null) return { valor: 0, error: null };
  if (typeof valor === "number") {
    return isNaN(valor) ? { valor: NaN, error: `${etiqueta} debe ser un valor numérico válido` } : { valor, error: null };
  }
  const limpio = String(valor).trim().replace(/^\$\s*/, "");
  if (limpio === "") return { valor: 0, error: null };

  // Formato estándar: 3500000 o 12.5
  if (/^-?\d+(\.\d+)?$/.test(limpio)) {
    return { valor: Number(limpio), error: null };
  }
  // Formato con separador de miles por punto (es-CO): 3.500.000 o 3.500.000,50
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio)) {
    return { valor: Number(limpio.replace(/\./g, "").replace(",", ".")), error: null };
  }
  // Formato con separador de miles por coma (en-US): 3,500,000 o 3,500,000.50
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(limpio)) {
    return { valor: Number(limpio.replace(/,/g, "")), error: null };
  }
  // Decimal con coma (ej. 12,5 horas en Excel español)
  if (/^-?\d+,\d{1,2}$/.test(limpio)) {
    return { valor: Number(limpio.replace(",", ".")), error: null };
  }

  return { valor: NaN, error: `${etiqueta} debe ser un número válido (recibido: '${valor}')` };
}

module.exports = { leerArchivoEmpleados, parsearNumeroOpcional };
