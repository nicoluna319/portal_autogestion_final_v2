import { Injectable } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Observable, catchError, map, of, throwError } from "rxjs";
import { environment } from "../../environments/environment";
import { Usuario } from "../models/usuario.model";
import { RespuestaApi } from "../models/catalogos";

interface UsuarioApiRow {
  id_usuario: number;
  tipo_documento?: string;
  numero_documento?: string;
  primer_nombre?: string;
  segundo_nombre?: string;
  primer_apellido?: string;
  segundo_apellido?: string;
  genero?: string;
  nombre: string;
  correo: string;
  id_rol: number;
  id_estado: number;
}

@Injectable({ providedIn: "root" })
export class UsuarioService {
  private readonly baseUrl = `${environment.apiUrl}/usuarios`;

  constructor(private http: HttpClient) {}

  private mapear(r: UsuarioApiRow): Usuario {
    return {
      idUsuario: r.id_usuario,
      tipoDocumento: r.tipo_documento || "CC",
      numeroDocumento: r.numero_documento || "",
      primerNombre: r.primer_nombre || "",
      segundoNombre: r.segundo_nombre || "",
      primerApellido: r.primer_apellido || "",
      segundoApellido: r.segundo_apellido || "",
      genero: r.genero || "",
      nombre: r.nombre,
      correo: r.correo,
      idRol: r.id_rol,
      idEstado: r.id_estado,
    };
  }

  listar(): Observable<Usuario[]> {
    return this.http.get<UsuarioApiRow[]>(this.baseUrl).pipe(map((lista) => lista.map((r) => this.mapear(r))));
  }

  buscarPorDocumento(numero: string): Observable<Usuario | null> {
    return this.http.get<UsuarioApiRow>(`${this.baseUrl}?documento=${encodeURIComponent(numero.trim())}`).pipe(
      map((r) => this.mapear(r)),
      catchError((err: HttpErrorResponse) => (err.status === 404 ? of(null) : throwError(() => err)))
    );
  }

  crear(usuario: Usuario): Observable<RespuestaApi> {
    return this.http.post<RespuestaApi>(this.baseUrl, usuario);
  }

  actualizar(usuario: Usuario): Observable<RespuestaApi> {
    return this.http.put<RespuestaApi>(this.baseUrl, usuario);
  }

  eliminar(id: number): Observable<RespuestaApi> {
    return this.http.delete<RespuestaApi>(`${this.baseUrl}?id=${id}`);
  }
}
