import { Injectable } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Observable, catchError, of, throwError } from "rxjs";
import { environment } from "../../environments/environment";
import { Empleado, ResultadoCargaMasiva } from "../models/empleado.model";
import { RespuestaApi } from "../models/catalogos";

export interface EmpleadoPayload {
  idEmpleado?: number;
  numeroDocumento?: string;
  cargo: string;
  area: string;
  fechaIngreso: string;
  salario: number;
  promedioHorasExtras: number;
}

@Injectable({ providedIn: "root" })
export class EmpleadoService {
  private readonly baseUrl = `${environment.apiUrl}/empleados`;

  constructor(private http: HttpClient) {}

  listar(): Observable<Empleado[]> {
    return this.http.get<Empleado[]>(this.baseUrl);
  }

  consultarPorId(id: number): Observable<Empleado> {
    return this.http.get<Empleado>(`${this.baseUrl}?id=${id}`);
  }

  consultarPorIdUsuario(idUsuario: number): Observable<Empleado> {
    return this.http.get<Empleado>(`${this.baseUrl}?idUsuario=${idUsuario}`);
  }

  consultarPorDocumento(documento: string): Observable<Empleado | null> {
    return this.http.get<Empleado>(`${this.baseUrl}?documento=${encodeURIComponent(documento.trim())}`).pipe(
      catchError((err: HttpErrorResponse) => (err.status === 404 ? of(null) : throwError(() => err)))
    );
  }

  descargarPlantilla(formato: "xlsx" | "csv" = "xlsx"): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/plantilla?formato=${formato}`, { responseType: "blob" });
  }

  crear(empleado: EmpleadoPayload): Observable<RespuestaApi> {
    return this.http.post<RespuestaApi>(this.baseUrl, empleado);
  }

  actualizar(empleado: EmpleadoPayload): Observable<RespuestaApi> {
    return this.http.put<RespuestaApi>(this.baseUrl, empleado);
  }

  cambiarEstado(idEmpleado: number, idEstado: 1 | 2): Observable<RespuestaApi> {
    return this.http.patch<RespuestaApi>(`${this.baseUrl}/estado`, { idEmpleado, idEstado });
  }

  eliminar(id: number): Observable<RespuestaApi> {
    return this.http.delete<RespuestaApi>(`${this.baseUrl}?id=${id}`);
  }

  cargaMasiva(archivo: File): Observable<ResultadoCargaMasiva> {
    const formData = new FormData();
    formData.append("archivo", archivo);
    return this.http.post<ResultadoCargaMasiva>(`${this.baseUrl}/carga-masiva`, formData);
  }
}
