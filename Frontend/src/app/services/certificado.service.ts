import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { Certificado, GenerarCertificadoRequest } from "../models/certificado.model";

export interface RespuestaEnvioCertificado {
  mensaje: string;
  consecutivo?: number;
  codigoVerificacion?: string;
}

@Injectable({ providedIn: "root" })
export class CertificadoService {
  private readonly baseUrl = `${environment.apiUrl}/certificados`;

  constructor(private http: HttpClient) {}

  historialPorEmpleado(idEmpleado: number): Observable<Certificado[]> {
    return this.http.get<Certificado[]>(`${this.baseUrl}?idEmpleado=${idEmpleado}`);
  }

  listarTodos(): Observable<Certificado[]> {
    return this.http.get<Certificado[]>(this.baseUrl);
  }

  generarYEnviarPorCorreo(datos: GenerarCertificadoRequest): Observable<RespuestaEnvioCertificado> {
    return this.http.post<RespuestaEnvioCertificado>(this.baseUrl, datos);
  }

  generarPdf(datos: GenerarCertificadoRequest): Observable<Blob> {
    return this.http.post(this.baseUrl, datos, { responseType: "blob" });
  }

  descargarExistente(idCertificado: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${idCertificado}/descargar`, { responseType: "blob" });
  }
}
