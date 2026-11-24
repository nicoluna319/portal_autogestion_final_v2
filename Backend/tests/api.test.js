// Pruebas automáticas de la API (Jest + Supertest). La base de datos y el correo se simulan,
// por eso corren sin MySQL:  npm test
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "clave_de_pruebas";

const fs = require("fs");
const path = require("path");
const request = require("supertest");
const bcrypt = require("bcryptjs");

jest.mock("../src/config/db", () => {
  const pool = { query: jest.fn(), getConnection: jest.fn() };
  return { pool, verificarConexion: jest.fn() };
});
jest.mock("../src/utils/mailer", () => ({
  enviarCertificado: jest.fn(() => {
    const e = new Error("SMTP no configurado");
    e.code = "SMTP_NO_CONFIGURADO";
    throw e;
  }),
  enviarRecuperacionContrasena: jest.fn(async () => {}),
}));

const { pool } = require("../src/config/db");
const { firmarToken } = require("../src/utils/auth");
const limitador = require("../src/utils/limitador");
const { normalizarFecha, limpiarDocumentoBusqueda, tokensBusqueda } = require("../src/utils/validaciones");
const mailer = require("../src/utils/mailer");
const {
  formatearFechaCorta,
  formatearFechaLarga,
  textosPorGenero,
  textoDocumentoPdf,
} = require("../src/controllers/certificadosController");
const app = require("../src/app");

beforeAll(() => jest.spyOn(console, "error").mockImplementation(() => {}));

const CARPETA_CERT = path.join(__dirname, "..", "certificados");
const inicio = Date.now();
const tokenAdmin = firmarToken({ id_usuario: 1, id_rol: 1, nombre: "Admin" });
const tokenEmpleado = firmarToken({ id_usuario: 2, id_rol: 2, nombre: "Empleada" });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

// Enruta las consultas simuladas: cada prueba define qué responde cada SQL.
function simularBD(reglas) {
  pool.query.mockImplementation(async (sql, params) => {
    for (const [patron, respuesta] of reglas) {
      if (patron.test(sql)) return typeof respuesta === "function" ? respuesta(sql, params) : respuesta;
    }
    return [[], undefined];
  });
}

beforeEach(() => {
  pool.query.mockReset();
  pool.getConnection.mockReset();
  limitador.reiniciarTodo();
});

afterAll(() => {
  for (const f of fs.readdirSync(CARPETA_CERT)) {
    const ruta = path.join(CARPETA_CERT, f);
    if (/^CERT-\d{4}-\d+\.pdf$/.test(f) && fs.statSync(ruta).mtimeMs >= inicio) fs.unlinkSync(ruta);
  }
});

describe("Autenticación", () => {
  test("sin token las rutas protegidas responden 401", async () => {
    const r = await request(app).get("/api/usuarios");
    expect(r.status).toBe(401);
  });

  test("login correcto devuelve token y usuario", async () => {
    const hash = await bcrypt.hash("123456", 4);
    simularBD([[/FROM usuarios u/, [[{ id_usuario: 2, nombre: "Gennifer", correo: "g@a.com", contrasena: hash, id_rol: 2, nombre_rol: "Empleado", id_estado: 1, ultimo_acceso: null }]]]]);
    const r = await request(app).post("/api/login").send({ correo: "g@a.com", contrasena: "123456" });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.usuario).toMatchObject({ idUsuario: 2, idRol: 2, ultimoAcceso: null });
  });

  test("contraseña incorrecta responde 401", async () => {
    const hash = await bcrypt.hash("123456", 4);
    simularBD([[/FROM usuarios u/, [[{ id_usuario: 2, nombre: "G", correo: "g@a.com", contrasena: hash, id_rol: 2, nombre_rol: "Empleado", id_estado: 1 }]]]]);
    const r = await request(app).post("/api/login").send({ correo: "g@a.com", contrasena: "otra" });
    expect(r.status).toBe(401);
  });

  test("una contraseña en texto plano se convierte a hash en el primer ingreso", async () => {
    simularBD([[/FROM usuarios u/, [[{ id_usuario: 2, nombre: "G", correo: "g@a.com", contrasena: "123456", id_rol: 2, nombre_rol: "Empleado", id_estado: 1 }]]]]);
    const r = await request(app).post("/api/login").send({ correo: "g@a.com", contrasena: "123456" });
    expect(r.status).toBe(200);
    const actualizacion = pool.query.mock.calls.find(([sql]) => /UPDATE usuarios SET contrasena/.test(sql));
    expect(actualizacion[1][0]).toMatch(/^\$2[aby]\$/);
  });

  test("después de 5 intentos fallidos el login se bloquea (429)", async () => {
    simularBD([[/FROM usuarios u/, [[]]]]);
    for (let i = 0; i < 5; i++) await request(app).post("/api/login").send({ correo: "x@a.com", contrasena: "mala" });
    const r = await request(app).post("/api/login").send({ correo: "x@a.com", contrasena: "mala" });
    expect(r.status).toBe(429);
  });

  test("cambiar contraseña exige la actual correcta", async () => {
    const hash = await bcrypt.hash("vieja123", 4);
    simularBD([[/SELECT contrasena FROM usuarios/, [[{ contrasena: hash }]]]]);
    const mala = await request(app).put("/api/login/contrasena").set(auth(tokenEmpleado)).send({ actual: "zzz", nueva: "nueva123" });
    expect(mala.status).toBe(400);
    const buena = await request(app).put("/api/login/contrasena").set(auth(tokenEmpleado)).send({ actual: "vieja123", nueva: "nueva123" });
    expect(buena.status).toBe(200);
  });
});

describe("Control de acceso por rol", () => {
  test("un empleado no puede listar usuarios (403)", async () => {
    const r = await request(app).get("/api/usuarios").set(auth(tokenEmpleado));
    expect(r.status).toBe(403);
  });

  test("un empleado no puede listar todos los empleados (403) pero sí su propio perfil", async () => {
    simularBD([[/FROM empleados e/, [[{ id_empleado: 1, id_usuario: 2, cedula: "123" }]]]]);
    expect((await request(app).get("/api/empleados").set(auth(tokenEmpleado))).status).toBe(403);
    expect((await request(app).get("/api/empleados?idUsuario=1").set(auth(tokenEmpleado))).status).toBe(403);
    expect((await request(app).get("/api/empleados?idUsuario=2").set(auth(tokenEmpleado))).status).toBe(200);
  });

  test("un empleado no puede cambiar el estado de una solicitud (403)", async () => {
    const r = await request(app).put("/api/solicitudes").set(auth(tokenEmpleado)).send({ idSolicitud: 1, idEstado: 5 });
    expect(r.status).toBe(403);
  });

  test("un empleado no puede generar el certificado de otra persona (403)", async () => {
    const r = await request(app).post("/api/certificados").set(auth(tokenEmpleado)).send({ idUsuario: 1, tipoCarta: "todos", canal: "pdf" });
    expect(r.status).toBe(403);
  });

  test("un empleado no puede eliminar una solicitud que ya fue atendida (409)", async () => {
    simularBD([
      [/SELECT id_empleado, id_estado FROM solicitudes/, [[{ id_empleado: 1, id_estado: 5 }]]],
      [/SELECT id_usuario FROM empleados/, [[{ id_usuario: 2 }]]],
    ]);
    const r = await request(app).delete("/api/solicitudes?id=7").set(auth(tokenEmpleado));
    expect(r.status).toBe(409);
  });
});

const PERSONA = { tipoDocumento: "CC", numeroDocumento: "1012345678", primerNombre: "Ana", segundoNombre: "María", primerApellido: "Pérez", segundoApellido: "Gómez", genero: "Femenino" };

describe("Validaciones", () => {
  test("crear usuario con correo inválido responde 400", async () => {
    const r = await request(app).post("/api/usuarios").set(auth(tokenAdmin)).send({ ...PERSONA, correo: "ana", contrasena: "123456", idRol: 2 });
    expect(r.status).toBe(400);
  });

  test("la contraseña del usuario nuevo se guarda con hash", async () => {
    simularBD([[/INSERT INTO usuarios/, [{ insertId: 9 }]]]);
    const r = await request(app).post("/api/usuarios").set(auth(tokenAdmin)).send({ ...PERSONA, correo: "ana@a.com", contrasena: "clave123", idRol: 2 });
    expect(r.status).toBe(201);
    const insercion = pool.query.mock.calls.find(([sql]) => /INSERT INTO usuarios/.test(sql));
    expect(insercion[1][9]).toMatch(/^\$2[aby]\$/);
    expect(insercion[1][7]).toBe("Ana María Pérez Gómez"); // el nombre completo se arma solo
  });

  test("un correo duplicado responde 409 sin mostrar el error técnico", async () => {
    pool.query.mockRejectedValue(Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY", sqlMessage: "Duplicate entry 'a' for key 'correo'" }));
    const r = await request(app).post("/api/usuarios").set(auth(tokenAdmin)).send({ ...PERSONA, correo: "ana@a.com", contrasena: "clave123", idRol: 2 });
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/correo/);
    expect(JSON.stringify(r.body)).not.toMatch(/Duplicate entry/);
  });

  test("el género es obligatorio y solo acepta Masculino o Femenino", async () => {
    const base = { ...PERSONA, correo: "ana@a.com", contrasena: "clave123", idRol: 2 };
    expect((await request(app).post("/api/usuarios").set(auth(tokenAdmin)).send({ ...base, genero: undefined })).status).toBe(400);
    expect((await request(app).post("/api/usuarios").set(auth(tokenAdmin)).send({ ...base, genero: "Otro" })).status).toBe(400);
  });

  test("documento con letras, nombres con números o documento duplicado se rechazan", async () => {
    const base = { ...PERSONA, correo: "ana@a.com", contrasena: "clave123", idRol: 2 };
    expect((await request(app).post("/api/usuarios").set(auth(tokenAdmin)).send({ ...base, numeroDocumento: "12ab" })).status).toBe(400);
    expect((await request(app).post("/api/usuarios").set(auth(tokenAdmin)).send({ ...base, primerNombre: "Ana2" })).status).toBe(400);
    pool.query.mockRejectedValue(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY", sqlMessage: "Duplicate entry '1' for key 'numero_documento'" }));
    const r = await request(app).post("/api/usuarios").set(auth(tokenAdmin)).send(base);
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/documento/);
  });

  test("empleado: documento inválido o fecha futura responde 400, y sin usuario responde 404", async () => {
    const base = { numeroDocumento: "123456789", cargo: "Analista", area: "TI", fechaIngreso: "2024-01-10" };
    expect((await request(app).post("/api/empleados").set(auth(tokenAdmin)).send({ ...base, numeroDocumento: "abc" })).status).toBe(400);
    expect((await request(app).post("/api/empleados").set(auth(tokenAdmin)).send({ ...base, fechaIngreso: "2099-01-01" })).status).toBe(400);
    simularBD([[/FROM usuarios/, [[]]]]);
    const r = await request(app).post("/api/empleados").set(auth(tokenAdmin)).send(base);
    expect(r.status).toBe(404);
    expect(r.body.mensaje).toMatch(/Usuarios/);
  });

  test("la plantilla de Excel y CSV solo la descarga el administrador", async () => {
    expect((await request(app).get("/api/empleados/plantilla").set(auth(tokenEmpleado))).status).toBe(403);
    const rXlsx = await request(app).get("/api/empleados/plantilla").set(auth(tokenAdmin));
    expect(rXlsx.status).toBe(200);
    expect(rXlsx.headers["content-disposition"]).toMatch(/plantilla_carga_empleados\.xlsx/);

    const rCsv = await request(app).get("/api/empleados/plantilla?formato=csv").set(auth(tokenAdmin));
    expect(rCsv.status).toBe(200);
    expect(rCsv.headers["content-disposition"]).toMatch(/plantilla_carga_empleados\.csv/);
  });

  test("rechazar una solicitud exige el motivo", async () => {
    const r = await request(app).put("/api/solicitudes").set(auth(tokenAdmin)).send({ idSolicitud: 1, idEstado: 6 });
    expect(r.status).toBe(400);
  });

  test("normalizarFecha acepta varios formatos y rechaza fechas imposibles", () => {
    expect(normalizarFecha("2024-03-15")).toBe("2024-03-15");
    expect(normalizarFecha("15/03/2024")).toBe("2024-03-15");
    expect(normalizarFecha(45366)).toBe("2024-03-15"); // número de serie de Excel
    expect(normalizarFecha("2026-02-31")).toBeNull();
    expect(normalizarFecha("hola")).toBeNull();
  });
});

describe("Certificados", () => {
  const reglasBase = [
    [/FROM empleados e/, [[{ id_empleado: 1, id_usuario: 2, nombre: "Gennifer", correo: "g@a.com", cedula: "123", cargo: "RRHH", area: "Gestion", fecha_ingreso: "2019-07-01", salario: 4000000, promedio_horas_extras: 0 }]]],
  ];

  test("si el consecutivo choca (UNIQUE) se recalcula y se reintenta", async () => {
    let maximo = 5;
    let primerIntento = true;
    simularBD([
      ...reglasBase,
      [/MAX\(consecutivo\)/, () => [[{ maxConsecutivo: maximo }]]],
      [/INSERT INTO certificados/, () => {
        if (primerIntento) {
          primerIntento = false;
          maximo = 6; // otra persona alcanzó a guardar el 6
          throw Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY", sqlMessage: "key 'uq_certificados_consecutivo'" });
        }
        return [{ insertId: 50 }];
      }],
    ]);
    const r = await request(app).post("/api/certificados").set(auth(tokenEmpleado)).send({ idUsuario: 2, tipoCarta: "todos", canal: "pdf" });
    expect(r.status).toBe(200);
    const inserciones = pool.query.mock.calls.filter(([sql]) => /INSERT INTO certificados/.test(sql));
    expect(inserciones).toHaveLength(2);
    expect(inserciones[0][1][2]).toBe(6);
    expect(inserciones[1][1][2]).toBe(7);
  });

  test("enviar por correo sin SMTP configurado responde 503 y no deja registro", async () => {
    simularBD([
      ...reglasBase,
      [/MAX\(consecutivo\)/, [[{ maxConsecutivo: 0 }]]],
      [/INSERT INTO certificados/, [{ insertId: 77 }]],
    ]);
    const r = await request(app).post("/api/certificados").set(auth(tokenEmpleado)).send({ idUsuario: 2, tipoCarta: "todos", canal: "correo" });
    expect(r.status).toBe(503);
    const borrado = pool.query.mock.calls.find(([sql]) => /DELETE FROM certificados/.test(sql));
    expect(borrado[1][0]).toBe(77);
  });

  test("un administrador puede generar el certificado de otro empleado por idEmpleado o idUsuario", async () => {
    simularBD([
      [/FROM empleados e/, [[{ id_empleado: 5, id_usuario: 8, id_estado: 1, tipo_documento: "CC", numero_documento: "1130857026", nombre: "Julio Cesar Sanchez", correo: "jcsanchez@portalautogestion.com", cedula: "1130857026", cargo: "Jefe de Tesoreria", area: "Financiera", fecha_ingreso: "2023-01-15", salario: 4500000, promedio_horas_extras: 0 }]]],
      [/MAX\(consecutivo\)/, [[{ maxConsecutivo: 10 }]]],
      [/INSERT INTO certificados/, [{ insertId: 99 }]],
    ]);

    const rPorEmpleado = await request(app)
      .post("/api/certificados")
      .set(auth(tokenAdmin))
      .send({ idEmpleado: 5, tipoCarta: "todos", canal: "pdf" });
    expect(rPorEmpleado.status).toBe(200);
    expect(rPorEmpleado.headers["content-type"]).toMatch(/pdf/);

    const rPorUsuario = await request(app)
      .post("/api/certificados")
      .set(auth(tokenAdmin))
      .send({ idUsuario: 8, tipoCarta: "sin_basico", canal: "pdf" });
    expect(rPorUsuario.status).toBe(200);
  });

  test("un empleado no puede generar el certificado de otro empleado usando idEmpleado (403)", async () => {
    simularBD([
      [/FROM empleados e/, [[{ id_empleado: 5, id_usuario: 8, id_estado: 1, nombre: "Julio", correo: "j@a.com", cedula: "1130857026", cargo: "Jefe", area: "Financiera", fecha_ingreso: "2023-01-15", salario: 4500000, promedio_horas_extras: 0 }]]],
    ]);
    const r = await request(app)
      .post("/api/certificados")
      .set(auth(tokenEmpleado))
      .send({ idEmpleado: 5, tipoCarta: "todos", canal: "pdf" });
    expect(r.status).toBe(403);
  });

  test("no se puede generar certificado activo para un empleado con usuario inactivo (409)", async () => {
    simularBD([
      [/FROM empleados e/, [[{ id_empleado: 5, id_usuario: 8, id_estado: 2, nombre: "Julio", correo: "j@a.com", cedula: "1130857026", cargo: "Jefe", area: "Financiera", fecha_ingreso: "2023-01-15", salario: 4500000, promedio_horas_extras: 0 }]]],
    ]);
    const r = await request(app)
      .post("/api/certificados")
      .set(auth(tokenAdmin))
      .send({ idEmpleado: 5, tipoCarta: "todos", canal: "pdf" });
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/inactivo/i);
  });
});

describe("Carga masiva de empleados (Excel y CSV)", () => {
  function crearConexionMock({ correosExistentes = [], docsExistentes = [] } = {}) {
    let siguienteId = 100;
    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (/SELECT LOWER\(correo\)/i.test(sql)) return [correosExistentes.map((c) => ({ correo: c }))];
        if (/SELECT numero_documento/i.test(sql)) return [docsExistentes.map((d) => ({ numero_documento: d }))];
        if (/SELECT cedula/i.test(sql)) return [[]];
        if (/INSERT INTO usuarios/i.test(sql)) return [{ insertId: ++siguienteId }];
        if (/INSERT INTO empleados/i.test(sql)) return [{ insertId: ++siguienteId }];
        return [[]];
      }),
    };
    pool.getConnection.mockResolvedValue(conn);
    return conn;
  }

  test("procesa un archivo CSV con delimitador punto y coma, tildes, pasaporte PA y detecta duplicados y errores", async () => {
    const conn = crearConexionMock({ correosExistentes: ["existente@empresa.com"] });
    const csvContenido = [
      "\uFEFFtipoDocumento;numeroDocumento;primerNombre;segundoNombre;primerApellido;segundoApellido;genero;correo;contrasena;cargo;area;fechaIngreso;salario;promedioHorasExtras",
      "CC;1099887701;Sofía;Elena;Martínez;Gómez;Femenino;sofia@empresa.com;;Analista;Tecnología;2024-02-10;3500000;5,5",
      "PA;CO1234567;Diego;;Ríos;Ospina;Masculino;diego@empresa.com;Clave99;Arquitecto;Tecnología;15/03/2023;6800000;0",
      ";;;;;;;;;;;;;", // fila vacía debe ignorarse
      "CC;1099887701;Repetido;;Doc;;Masculino;otro@empresa.com;;Auxiliar;TI;2024-01-01;2000000;0",
      "CC;1099887702;YaExiste;;EnBD;;Femenino;existente@empresa.com;;Auxiliar;TI;2024-01-01;2000000;0",
      "CC;1099887703;Salario;;Malo;;Masculino;salariomalo@empresa.com;;Auxiliar;TI;2024-01-01;no_es_numero;0",
    ].join("\r\n");

    const r = await request(app)
      .post("/api/empleados/carga-masiva")
      .set(auth(tokenAdmin))
      .attach("archivo", Buffer.from(csvContenido, "utf8"), "demo_empleados.csv");

    expect(r.status).toBe(200);
    expect(r.body.formato).toBe("CSV");
    expect(r.body.totalFilas).toBe(5);
    expect(r.body.insertados).toBe(2);
    expect(r.body.fallidos).toBe(3);
    expect(r.body.empleadosCreados).toHaveLength(2);
    expect(r.body.empleadosCreados[0].nombre).toBe("Sofía Elena Martínez Gómez");
    expect(r.body.empleadosCreados[1].documento).toBe("PA CO1234567");
    expect(r.body.errores.some((e) => /repetido dentro del archivo/i.test(e))).toBe(true);
    expect(r.body.errores.some((e) => /ya está registrado/i.test(e))).toBe(true);
    expect(r.body.errores.some((e) => /salario debe ser un número válido/i.test(e))).toBe(true);
    expect(conn.commit).toHaveBeenCalledTimes(2);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  test("procesa el archivo Excel de demostración (25 empleados)", async () => {
    const conn = crearConexionMock();
    const rutaDemo = path.join(__dirname, "..", "..", "Plantillas_Demo", "demo_carga_empleados_25.xlsx");
    const r = await request(app)
      .post("/api/empleados/carga-masiva")
      .set(auth(tokenAdmin))
      .attach("archivo", rutaDemo);

    expect(r.status).toBe(200);
    expect(r.body.formato).toBe("Excel");
    expect(r.body.totalFilas).toBe(25);
    expect(r.body.insertados).toBe(25);
    expect(r.body.fallidos).toBe(0);
    expect(conn.commit).toHaveBeenCalledTimes(25);
  });

  test("rechaza archivos con extensión no permitida (.txt)", async () => {
    const r = await request(app)
      .post("/api/empleados/carga-masiva")
      .set(auth(tokenAdmin))
      .attach("archivo", Buffer.from("hola mundo"), "empleados.txt");
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toMatch(/Excel|CSV/i);
  });
});

describe("Reglas de negocio y recuperación de contraseña", () => {
  afterEach(() => {
    delete process.env.AUTH_CHECK_DB;
  });

  test("certificado con_extras incluye salario (incluye_sueldo = 1) y genera código de verificación", async () => {
    simularBD([
      [/FROM empleados e/, [[{ id_empleado: 2, id_usuario: 3, id_estado: 1, tipo_documento: "PA", numero_documento: "CO9845123", genero: "Masculino", nombre: "Diego Ríos", correo: "d@a.com", cedula: "CO9845123", cargo: "Arquitecto", area: "TI", fecha_ingreso: "2019-07-01", salario: 7200000, promedio_horas_extras: 10 }]]],
      [/MAX\(consecutivo\)/, [[{ maxConsecutivo: 20 }]]],
      [/INSERT INTO certificados/, [{ insertId: 120 }]],
    ]);
    const r = await request(app)
      .post("/api/certificados")
      .set(auth(tokenAdmin))
      .send({ idEmpleado: 2, tipoCarta: "con_extras", canal: "pdf" });
    expect(r.status).toBe(200);
    const ins = pool.query.mock.calls.find(([sql]) => /INSERT INTO certificados/.test(sql));
    expect(ins[1][3]).toBe(1); // incluye_sueldo = 1
    expect(ins[1][6]).toBe(1); // generado_por = admin id 1
    expect(ins[1][7]).toMatch(/^VER-[A-F0-9]{8}$/);
  });

  test("PDF: fechas sin corrimiento UTC, documento dinámico y trato por género", () => {
    expect(formatearFechaCorta("2019-07-01")).toBe("01/07/2019");
    expect(formatearFechaCorta(new Date("2019-07-01T00:00:00.000Z"))).toBe("01/07/2019");
    expect(formatearFechaLarga("2024-03-15")).toBe("15 de marzo de 2024");
    expect(textosPorGenero("Femenino")).toMatchObject({ trato: "la señora", identificado: "identificada", activo: "activa" });
    expect(textosPorGenero("Masculino")).toMatchObject({ trato: "el señor", identificado: "identificado", activo: "activo" });
    expect(textoDocumentoPdf({ tipo_documento: "PA", numero_documento: "CO9845123" })).toBe("pasaporte N.° CO9845123");
    expect(textoDocumentoPdf({ tipo_documento: "PPT", numero_documento: "88451209" })).toBe("Permiso por Protección Temporal (PPT) N.° 88451209");
  });

  test("GET /api/certificados/:id/descargar regenera PDF histórico y bloquea a terceros no admin (403)", async () => {
    const filaCert = {
      id_certificado: 55,
      id_empleado: 5,
      id_usuario: 8,
      id_tipo: 3,
      consecutivo: 55,
      incluye_sueldo: 1,
      fecha_generacion: "2025-04-10T15:00:00.000Z",
      archivo_pdf: "CERT-0055-9999999999999.pdf",
      codigo_verificacion: "VER-1122AABB",
      cedula: "1130857026",
      tipo_documento: "CC",
      numero_documento: "1130857026",
      genero: "Masculino",
      nombre: "Julio Cesar Sanchez",
      correo: "jcsanchez@portalautogestion.com",
      cargo: "Jefe de Tesoreria",
      area: "Financiera",
      fecha_ingreso: "2023-01-15",
      salario: 4500000,
      promedio_horas_extras: 8,
    };
    simularBD([[/FROM certificados c/, [[filaCert]]]]);

    expect((await request(app).get("/api/certificados/55/descargar").set(auth(tokenEmpleado))).status).toBe(403);
    const rAdmin = await request(app).get("/api/certificados/55/descargar").set(auth(tokenAdmin));
    expect(rAdmin.status).toBe(200);
    expect(rAdmin.headers["content-type"]).toMatch(/pdf/);
  });

  test("alta individual de empleado soporta Pasaporte (PA) y rechaza usuario inactivo (409)", async () => {
    simularBD([
      [/FROM usuarios WHERE numero_documento/, [[{ id_usuario: 30, tipo_documento: "PA", numero_documento: "CO9845123", id_estado: 1 }]]],
      [/FROM empleados WHERE id_usuario/, [[]]],
      [/INSERT INTO empleados/, [{ insertId: 44 }]],
    ]);
    const ok = await request(app)
      .post("/api/empleados")
      .set(auth(tokenAdmin))
      .send({ numeroDocumento: "CO9845123", cargo: "Arquitecto", area: "Tecnología", fechaIngreso: "2024-01-10", salario: 7000000 });
    expect(ok.status).toBe(201);

    simularBD([
      [/FROM usuarios WHERE numero_documento/, [[{ id_usuario: 31, tipo_documento: "CC", numero_documento: "1020304099", id_estado: 2 }]]],
    ]);
    const inactivo = await request(app)
      .post("/api/empleados")
      .set(auth(tokenAdmin))
      .send({ numeroDocumento: "1020304099", cargo: "Analista", area: "TI", fechaIngreso: "2024-01-10" });
    expect(inactivo.status).toBe(409);
  });

  test("inactivación lógica de empleado (PATCH /api/empleados/estado) impide auto-desactivarse", async () => {
    simularBD([[/SELECT id_empleado, id_usuario FROM empleados/, [[{ id_empleado: 4, id_usuario: 1 }]]]]);
    const propio = await request(app).patch("/api/empleados/estado").set(auth(tokenAdmin)).send({ idEmpleado: 4, idEstado: 2 });
    expect(propio.status).toBe(400);

    const conn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };
    pool.getConnection.mockResolvedValue(conn);
    simularBD([[/SELECT id_empleado, id_usuario FROM empleados/, [[{ id_empleado: 5, id_usuario: 8 }]]]]);
    const ok = await request(app).patch("/api/empleados/estado").set(auth(tokenAdmin)).send({ idEmpleado: 5, idEstado: 2 });
    expect(ok.status).toBe(200);
    expect(conn.commit).toHaveBeenCalledTimes(1);
  });

  test("JWT valida estado y rol vigentes en BD al desactivar o degradar rol", async () => {
    process.env.AUTH_CHECK_DB = "true";
    simularBD([[/auth_check/, [[{ id_rol: 1, id_estado: 2, nombre: "Admin" }]]]]);
    const desactivado = await request(app).get("/api/usuarios").set(auth(tokenAdmin));
    expect(desactivado.status).toBe(403);

    simularBD([[/auth_check/, [[{ id_rol: 2, id_estado: 1, nombre: "ExAdmin" }]]]]);
    const degradado = await request(app).get("/api/usuarios").set(auth(tokenAdmin));
    expect(degradado.status).toBe(403);
  });

  test("solicitudes: máquina de estados bloquea cambios tras Aprobado/Rechazado, protege borrado y evita auto-aprobación", async () => {
    // 1. No se puede modificar solicitud ya Aprobada (5)
    simularBD([[/SELECT id_solicitud, id_empleado, id_estado FROM solicitudes/, [[{ id_solicitud: 10, id_empleado: 2, id_estado: 5 }]]]]);
    const reabrir = await request(app)
      .put("/api/solicitudes")
      .set(auth(tokenAdmin))
      .send({ idSolicitud: 10, idEstado: 6, mensaje: "Cambio de opinión" });
    expect(reabrir.status).toBe(409);

    // 2. No se puede eliminar solicitud Aprobada ni como Admin
    simularBD([[/SELECT id_empleado, id_estado FROM solicitudes/, [[{ id_empleado: 2, id_estado: 5 }]]]]);
    const borrar = await request(app).delete("/api/solicitudes?id=10").set(auth(tokenAdmin));
    expect(borrar.status).toBe(409);

    // 3. Segregación de funciones: admin no puede aprobar su propia solicitud si hay otro admin activo
    simularBD([
      [/SELECT id_solicitud, id_empleado, id_estado FROM solicitudes/, [[{ id_solicitud: 11, id_empleado: 4, id_estado: 3 }]]],
      [/SELECT id_usuario FROM empleados/, [[{ id_usuario: 1 }]]],
      [/COUNT\(\*\) AS otros/, [[{ otros: 1 }]]],
    ]);
    const autoAprobar = await request(app).put("/api/solicitudes").set(auth(tokenAdmin)).send({ idSolicitud: 11, idEstado: 5 });
    expect(autoAprobar.status).toBe(403);

    // 4. Rango de fechas inválido (fechaFin < fechaInicio) y solapamiento (409)
    const rangoMalo = await request(app)
      .post("/api/solicitudes")
      .set(auth(tokenEmpleado))
      .send({ idEmpleado: 1, tipoSolicitud: "Vacaciones", descripcion: "Descanso", fechaInicio: "2026-07-15", fechaFin: "2026-07-01" });
    expect(rangoMalo.status).toBe(400);

    simularBD([
      [/SELECT id_usuario FROM empleados/, [[{ id_usuario: 2 }]]],
      [/AND fecha_inicio <= \? AND fecha_fin >= \?/, [[{ id_solicitud: 2, tipo_solicitud: "Vacaciones" }]]],
    ]);
    const solapada = await request(app)
      .post("/api/solicitudes")
      .set(auth(tokenEmpleado))
      .send({ idEmpleado: 1, tipoSolicitud: "Permiso", descripcion: "Cruce", fechaInicio: "2026-07-05", fechaFin: "2026-07-06" });
    expect(solapada.status).toBe(409);
  });

  test("login expone debeCambiarContrasena y GET /api/empleados soporta paginación opcional", async () => {
    const hash = await bcrypt.hash("123456", 4);
    simularBD([[/FROM usuarios u/, [[{ id_usuario: 9, nombre: "Nuevo", correo: "n@a.com", contrasena: hash, id_rol: 2, nombre_rol: "Empleado", id_estado: 1, ultimo_acceso: null, debe_cambiar_contrasena: 1 }]]]]);
    const rLogin = await request(app).post("/api/login").send({ correo: "n@a.com", contrasena: "123456" });
    expect(rLogin.status).toBe(200);
    expect(rLogin.body.usuario.debeCambiarContrasena).toBe(true);

    simularBD([
      [/SELECT COUNT\(\*\) AS total FROM empleados/, [[{ total: 35 }]]],
      [/FROM empleados e/, [[{ id_empleado: 1, nombre: "Ana" }]]],
    ]);
    const rPag = await request(app).get("/api/empleados?page=2&limit=10").set(auth(tokenAdmin));
    expect(rPag.status).toBe(200);
    expect(rPag.body).toMatchObject({ total: 35, page: 2, limit: 10, totalPaginas: 4 });
    expect(rPag.body.datos).toHaveLength(1);
  });

  test("recuperación de contraseña por correo: solicita, valida token y restablece", async () => {
    mailer.enviarRecuperacionContrasena.mockClear();
    simularBD([
      [/FROM usuarios WHERE LOWER\(correo\)/, [[{ id_usuario: 2, nombre: "Gennifer", correo: "g@a.com", id_estado: 1 }]]],
      [/UPDATE recuperacion_contrasena/, [{ affectedRows: 0 }]],
      [/INSERT INTO recuperacion_contrasena/, [{ insertId: 1 }]],
    ]);

    const rSol = await request(app).post("/api/login/olvide-contrasena").send({ correo: "  G@A.COM " });
    expect(rSol.status).toBe(200);
    expect(mailer.enviarRecuperacionContrasena).toHaveBeenCalledTimes(1);
    const enlaceEnviado = mailer.enviarRecuperacionContrasena.mock.calls[0][0].enlace;
    const token = new URL(enlaceEnviado).searchParams.get("token");
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    // Validar token válido
    simularBD([
      [/FROM recuperacion_contrasena r/, [[{ id_recuperacion: 1, id_usuario: 2, correo: "g@a.com" }]]],
    ]);
    const rVal = await request(app).get(`/api/login/validar-token-recuperacion?token=${token}`);
    expect(rVal.status).toBe(200);
    expect(rVal.body.valido).toBe(true);

    // Restablecer contraseña
    const rReset = await request(app).post("/api/login/restablecer-contrasena").send({ token, nueva: "NuevaClave2026" });
    expect(rReset.status).toBe(200);
    const upd = pool.query.mock.calls.find(([sql]) => /UPDATE usuarios SET contrasena/.test(sql));
    expect(upd[1][0]).toMatch(/^\$2[aby]\$/);
  });

  test("admin sin perfil previo de empleado puede crear su propia solicitud", async () => {
    simularBD([
      [/SELECT id_empleado FROM empleados WHERE id_usuario/, [[]]],
      [/SELECT numero_documento FROM usuarios WHERE id_usuario/, [[{ numero_documento: "1234567890" }]]],
      [/INSERT INTO empleados/, [{ insertId: 40 }]],
      [/INSERT INTO solicitudes/, [{ insertId: 91 }]],
    ]);
    const r = await request(app)
      .post("/api/solicitudes")
      .set(auth(tokenAdmin))
      .send({ tipoSolicitud: "Permiso", descripcion: "Cita médica" });
    expect(r.status).toBe(201);
    expect(r.body.idSolicitud).toBe(91);
  });

  test("búsqueda tolerante ignora tildes, mayúsculas, espacios y caracteres especiales", () => {
    expect(limpiarDocumentoBusqueda("  1.234.567-890 # ")).toBe("1234567890");
    expect(limpiarDocumentoBusqueda("CO-9845 123!")).toBe("co9845123");
    expect(tokensBusqueda("  JÓSE!!  triviño_Osorio  ")).toEqual(["jose", "trivino", "osorio"]);
  });
});
