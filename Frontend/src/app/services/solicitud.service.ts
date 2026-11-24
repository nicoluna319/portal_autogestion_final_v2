import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { Solicitud, NuevaSolicitud } from "../models/solicitud.model";
import { RespuestaApi } from "../models/catalogos";

@Injectable({ providedIn: "root" })
export class SolicitudService {
  private readonly baseUrl = `${environment.apiUrl}/solicitudes`;

  constructor(private http: HttpClient) {}

  listar(): Observable<Solicitud[]> {
    return this.http.get<Solicitud[]>(this.baseUrl);
  }

  consultarPorId(id: number): Observable<Solicitud> {
    return this.http.get<Solicitud>(`${this.baseUrl}?id=${id}`);
  }

  listarPorEmpleado(idEmpleado: number): Observable<Solicitud[]> {
    return this.http.get<Solicitud[]>(`${this.baseUrl}?empleado=${idEmpleado}`);
  }

  crear(solicitud: NuevaSolicitud): Observable<RespuestaApi> {
    return this.http.post<RespuestaApi>(this.baseUrl, solicitud);
  }

  actualizarEstado(idSolicitud: number, idEstado: number, mensaje?: string): Observable<RespuestaApi> {
    return this.http.put<RespuestaApi>(this.baseUrl, { idSolicitud, idEstado, ...(mensaje ? { mensaje } : {}) });
  }

  eliminar(id: number): Observable<RespuestaApi> {
    return this.http.delete<RespuestaApi>(`${this.baseUrl}?id=${id}`);
  }
}
