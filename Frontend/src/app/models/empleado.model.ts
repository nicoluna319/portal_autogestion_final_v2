export interface Empleado {
  id_empleado?: number;
  id_usuario?: number;
  idUsuario?: number;
  id_estado?: number;
  cedula: string;
  cargo: string;
  area: string;
  fechaIngreso: string;
  fecha_ingreso?: string;
  salario: number;
  promedioHorasExtras: number;
  promedio_horas_extras?: number;
  nombre?: string;
  correo?: string;
  tipo_documento?: string;
  numero_documento?: string;
  genero?: string;
}

export interface EmpleadoCreadoMasivo {
  fila: number;
  documento: string;
  nombre: string;
  correo: string;
  cargo: string;
  area: string;
}

export interface ResultadoCargaMasiva {
  mensaje: string;
  formato?: string;
  totalFilas?: number;
  insertados: number;
  fallidos: number;
  errores: string[];
  empleadosCreados?: EmpleadoCreadoMasivo[];
}
