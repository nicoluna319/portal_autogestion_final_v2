export interface Certificado {
  id_certificado?: number;
  id_empleado?: number;
  id_tipo?: number;
  consecutivo?: number;
  incluye_sueldo?: boolean;
  fecha_generacion?: string;
  canal_entrega?: string;
  archivo_pdf?: string;
  nombre_empleado?: string;
  cedula_empleado?: string;
  tipo_documento_empleado?: string;
  cargo_empleado?: string;
  tipo_certificado?: string;
  generado_por?: number | null;
  generado_por_nombre?: string | null;
  codigo_verificacion?: string | null;
}

export interface GenerarCertificadoRequest {
  idUsuario?: number;
  idEmpleado?: number;
  tipoCarta: "todos" | "sin_basico" | "con_extras";
  canal: "pdf" | "correo";
}
