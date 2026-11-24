// Genera las plantillas oficiales (vacías y de demostración con 25 empleados) en Excel (.xlsx) y CSV (.csv).
// Uso: node scripts/generar-plantilla.js  (o npm run generar-plantillas)
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const COLUMNAS = [
  "tipoDocumento",
  "numeroDocumento",
  "primerNombre",
  "segundoNombre",
  "primerApellido",
  "segundoApellido",
  "genero",
  "correo",
  "contrasena",
  "cargo",
  "area",
  "fechaIngreso",
  "salario",
  "promedioHorasExtras",
];

const INSTRUCCIONES = [
  ["Columna", "Obligatoria", "Qué escribir"],
  ["tipoDocumento", "Sí", "CC (Cédula de Ciudadanía), CE (Cédula de Extranjería), PPT (Permiso por Protección Temporal) o PA (Pasaporte)"],
  ["numeroDocumento", "Sí", "Solo números (5 a 15 dígitos); en pasaporte (PA) puede incluir letras y números (5 a 20). No puede repetirse"],
  ["primerNombre", "Sí", "Primer nombre (solo letras, 2 a 50 caracteres)"],
  ["segundoNombre", "No", "Segundo nombre (opcional)"],
  ["primerApellido", "Sí", "Primer apellido (solo letras, 2 a 50 caracteres)"],
  ["segundoApellido", "No", "Segundo apellido (opcional)"],
  ["genero", "Sí", "Masculino o Femenino (también se acepta M o F)"],
  ["correo", "Sí", "Correo único de acceso al portal"],
  ["contrasena", "No", "Mínimo 6 caracteres. Si se deja vacía, el sistema asigna 123456"],
  ["cargo", "Sí", "Cargo del empleado"],
  ["area", "Sí", "Área o dependencia"],
  ["fechaIngreso", "Sí", "Formato AAAA-MM-DD (ej. 2024-03-15) o DD/MM/AAAA; no puede ser fecha futura"],
  ["salario", "No", "Salario básico mensual numérico, sin símbolos (ej. 3500000)"],
  ["promedioHorasExtras", "No", "Promedio de horas extras de los últimos 3 meses (ej. 12.5)"],
  [],
  ["Ejemplo de una fila", "", "CC | 1012345678 | Ana | María | Pérez | Gómez | Femenino | ana.perez@portalautogestion.com | | Analista | Tecnología | 2024-03-15 | 3500000 | 0"],
  ["Importante", "", "Escribe los datos en la hoja Empleados desde la fila 2 (o en el archivo CSV desde la línea 2). No modifiques los encabezados."],
];

// 25 empleados ficticios variados para demostración (sin colisiones con los datos iniciales de portal_acegrasco.sql).
const EMPLEADOS_DEMO = [
  ["CC", "1020304001", "Camila", "Andrea", "Rodríguez", "Martínez", "Femenino", "crodriguez@portalautogestion.com", "Clave2026*", "Desarrolladora Backend", "Tecnología", "2022-02-14", 4800000, 8],
  ["CC", "1020304002", "Sebastián", "David", "Gómez", "Herrera", "Masculino", "sgomez@portalautogestion.com", "", "Ingeniero DevOps", "Tecnología", "2021-08-01", 5600000, 12.5],
  ["CC", "1020304003", "Valentina", "", "López", "Ramírez", "Femenino", "vlopez@portalautogestion.com", "", "Diseñadora UX/UI", "Tecnología", "2023-01-16", 4200000, 0],
  ["CC", "1020304004", "Andrés", "Felipe", "Castro", "Vargas", "Masculino", "acastro@portalautogestion.com", "", "Analista de Datos", "Tecnología", "2023-05-10", 4100000, 6],
  ["CE", "70045123", "Mariana", "Isabel", "Fernández", "Silva", "Femenino", "mfernandez@portalautogestion.com", "", "Líder de QA", "Calidad", "2020-09-21", 5200000, 10],
  ["CC", "1020304006", "Juan", "Pablo", "Morales", "Díaz", "Masculino", "jmorales@portalautogestion.com", "", "Contador Senior", "Financiera", "2019-11-04", 4600000, 15],
  ["CC", "1020304007", "Laura", "Sofía", "Jiménez", "Torres", "Femenino", "ljimenez@portalautogestion.com", "", "Analista de Nómina", "Gestión Humana", "2021-03-08", 3400000, 4],
  ["CC", "1020304008", "Mateo", "", "Rojas", "Peña", "Masculino", "mrojas@portalautogestion.com", "", "Auxiliar Contable", "Financiera", "2024-01-22", 2400000, 18],
  ["CC", "1020304009", "Paula", "Ximena", "Vega", "Mendoza", "Femenino", "pvega@portalautogestion.com", "", "Psicóloga Organizacional", "Gestión Humana", "2022-07-11", 3900000, 0],
  ["PPT", "88451209", "Carlos", "Eduardo", "Mendoza", "Quintero", "Masculino", "cmendoza@portalautogestion.com", "", "Coordinador de Logística", "Operaciones", "2022-10-03", 3800000, 22],
  ["CC", "1020304011", "Daniela", "Alejandra", "Suárez", "Gutiérrez", "Femenino", "dsuarez@portalautogestion.com", "", "Ejecutiva Comercial", "Comercial", "2021-06-14", 3600000, 5],
  ["CC", "1020304012", "Felipe", "Esteban", "Navarro", "Cárdenas", "Masculino", "fnavarro@portalautogestion.com", "", "Asesor Comercial", "Comercial", "2023-09-04", 2900000, 9.5],
  ["CC", "1020304013", "Natalia", "", "Pardo", "Salazar", "Femenino", "npardo@portalautogestion.com", "", "Abogada Laboral", "Jurídica", "2020-04-20", 5900000, 0],
  ["PA", "CO9845123", "Diego", "Armando", "Ríos", "Ospina", "Masculino", "drios@portalautogestion.com", "", "Arquitecto de Software", "Tecnología", "2019-08-12", 7200000, 6],
  ["CC", "1020304015", "María", "Fernanda", "Ortega", "Mejía", "Femenino", "mortega@portalautogestion.com", "", "Analista de Cartera", "Financiera", "2022-11-28", 3200000, 7],
  ["CC", "1020304016", "Santiago", "Andrés", "Reyes", "Bautista", "Masculino", "sreyes@portalautogestion.com", "", "Supervisor de Planta", "Operaciones", "2018-05-07", 4300000, 28],
  ["CC", "1020304017", "Gabriela", "Lucía", "Cortés", "Rincón", "Femenino", "gcortes@portalautogestion.com", "", "Especialista en SST", "Gestión Humana", "2021-09-13", 4100000, 3],
  ["CC", "1020304018", "Esteban", "", "Arias", "Lozano", "Masculino", "earias@portalautogestion.com", "", "Técnico de Soporte", "Tecnología", "2024-04-01", 2600000, 14],
  ["CC", "1020304019", "Juliana", "Marcela", "Duarte", "Castaño", "Femenino", "jduarte@portalautogestion.com", "", "Analista de Calidad", "Calidad", "2022-01-17", 3500000, 5.5],
  ["CE", "70091844", "Ricardo", "Antonio", "Paredes", "León", "Masculino", "rparedes@portalautogestion.com", "", "Jefe de Compras", "Operaciones", "2020-02-10", 4900000, 11],
  ["CC", "1020304021", "Luisa", "Fernanda", "Becerra", "Moreno", "Femenino", "lbecerra@portalautogestion.com", "", "Líder de Servicio al Cliente", "Servicio al Cliente", "2021-11-15", 3700000, 6],
  ["CC", "1020304022", "Cristian", "Camilo", "Alvarez", "Zapata", "Masculino", "calvarez@portalautogestion.com", "", "Agente de Soporte", "Servicio al Cliente", "2024-06-03", 2200000, 16],
  ["CC", "1020304023", "Diana", "Carolina", "Molina", "Pineda", "Femenino", "dmolina@portalautogestion.com", "", "Especialista de Mercadeo", "Comercial", "2023-03-20", 4000000, 0],
  ["CC", "1020304024", "Jorge", "Iván", "Giraldo", "Escobar", "Masculino", "jgiraldo@portalautogestion.com", "", "Auditor Interno", "Calidad", "2019-06-10", 5100000, 4],
  ["CC", "1020304025", "Tatiana", "Milena", "Rueda", "Sánchez", "Femenino", "trueda@portalautogestion.com", "", "Analista Administrativo", "Gerencia", "2023-08-14", 3100000, 2],
];

function escaparCeldaCsv(valor) {
  const s = valor === undefined || valor === null ? "" : String(valor);
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function escribirCsv(rutaArchivo, filas) {
  const lineas = [COLUMNAS, ...filas].map((fila) => fila.map(escaparCeldaCsv).join(","));
  // BOM UTF-8 (\uFEFF) para que Excel en Windows abra tildes y ñ correctamente al hacer doble clic.
  fs.writeFileSync(rutaArchivo, "\uFEFF" + lineas.join("\r\n") + "\r\n", "utf8");
}

function escribirXlsx(rutaArchivo, filas) {
  const wb = XLSX.utils.book_new();
  const hojaEmpleados = XLSX.utils.aoa_to_sheet([COLUMNAS, ...filas]);
  hojaEmpleados["!cols"] = [
    { wch: 15 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 13 }, { wch: 34 }, { wch: 15 }, { wch: 28 }, { wch: 20 }, { wch: 15 },
    { wch: 14 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, hojaEmpleados, "Empleados");

  const hojaInstrucciones = XLSX.utils.aoa_to_sheet(INSTRUCCIONES);
  hojaInstrucciones["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 112 }];
  XLSX.utils.book_append_sheet(wb, hojaInstrucciones, "Instrucciones");

  XLSX.writeFile(wb, rutaArchivo);
}

const dirBackend = path.join(__dirname, "..");
const dirRaiz = path.join(dirBackend, "..");
const dirDemo = path.join(dirRaiz, "Plantillas_Demo");
fs.mkdirSync(dirDemo, { recursive: true });

// 1. Plantillas oficiales vacías que descarga el backend (GET /api/empleados/plantilla)
escribirXlsx(path.join(dirBackend, "plantilla_carga_empleados.xlsx"), []);
escribirCsv(path.join(dirBackend, "plantilla_carga_empleados.csv"), []);

// 2. Copias vacías + archivos de demostración con 25 empleados en Plantillas_Demo/
escribirXlsx(path.join(dirDemo, "plantilla_vacia_empleados.xlsx"), []);
escribirCsv(path.join(dirDemo, "plantilla_vacia_empleados.csv"), []);
escribirXlsx(path.join(dirDemo, "demo_carga_empleados_25.xlsx"), EMPLEADOS_DEMO);
escribirCsv(path.join(dirDemo, "demo_carga_empleados_25.csv"), EMPLEADOS_DEMO);

console.log("Plantillas generadas correctamente en Backend/ y Plantillas_Demo/ (25 empleados de demostración).");
