export const ROL_ADMIN = 1;
export const ROL_EMPLEADO = 2;

export const ESTADO_USUARIO = {
  ACTIVO: 1,
  INACTIVO: 2,
} as const;

export const ESTADO_SOLICITUD = {
  PENDIENTE: 3,
  EN_REVISION: 4,
  APROBADO: 5,
  RECHAZADO: 6,
} as const;

export const TIPOS_DOCUMENTO = [
  { codigo: "CC", nombre: "Cédula de Ciudadanía" },
  { codigo: "CE", nombre: "Cédula de Extranjería" },
  { codigo: "PPT", nombre: "Permiso por Protección Temporal" },
  { codigo: "PA", nombre: "Pasaporte" },
];

export const GENEROS = ["Masculino", "Femenino"];

export const TIPOS_SOLICITUD = [
  "Vacaciones",
  "Permiso remunerado",
  "Permiso no remunerado",
  "Incapacidad médica",
  "Licencia",
  "Actualización de datos",
  "Otro",
];

export const ESTADOS_SOLICITUD: Record<number, string> = {
  [ESTADO_SOLICITUD.PENDIENTE]: "Pendiente",
  [ESTADO_SOLICITUD.EN_REVISION]: "En revisión",
  [ESTADO_SOLICITUD.APROBADO]: "Aprobado",
  [ESTADO_SOLICITUD.RECHAZADO]: "Rechazado",
};

export interface RespuestaApi {
  mensaje: string;
  idUsuario?: number;
  idEmpleado?: number;
  idSolicitud?: number;
}

export const nombreTipoDocumento = (codigo?: string): string =>
  TIPOS_DOCUMENTO.find((t) => t.codigo === codigo)?.nombre || codigo || "";
