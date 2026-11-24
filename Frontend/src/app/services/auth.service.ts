import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, tap } from "rxjs";
import { environment } from "../../environments/environment";
import { Usuario } from "../models/usuario.model";
import { ROL_ADMIN, ROL_EMPLEADO } from "../models/catalogos";

const CLAVE_SESION = "autogestion_usuario";
const CLAVE_TOKEN = "autogestion_token";

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly baseUrl = `${environment.apiUrl}/login`;
  private usuarioCache: Usuario | null | undefined = undefined;
  private tokenCache: string | null | undefined = undefined;

  constructor(private http: HttpClient) {}

  login(correo: string, contrasena: string): Observable<{ mensaje: string; token: string; usuario: Usuario }> {
    return this.http
      .post<{ mensaje: string; token: string; usuario: Usuario }>(this.baseUrl, { correo, contrasena })
      .pipe(
        tap((resp) => {
          this.usuarioCache = resp.usuario;
          this.tokenCache = resp.token;
          sessionStorage.setItem(CLAVE_SESION, JSON.stringify(resp.usuario));
          sessionStorage.setItem(CLAVE_TOKEN, resp.token);
        })
      );
  }

  cambiarContrasena(actual: string, nueva: string): Observable<{ mensaje: string }> {
    return this.http.put<{ mensaje: string }>(`${this.baseUrl}/contrasena`, { actual, nueva });
  }

  solicitarRecuperacion(correo: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.baseUrl}/olvide-contrasena`, { correo });
  }

  validarTokenRecuperacion(token: string): Observable<{ valido: boolean; correoEnmascarado?: string; mensaje?: string }> {
    return this.http.get<{ valido: boolean; correoEnmascarado?: string; mensaje?: string }>(
      `${this.baseUrl}/validar-token-recuperacion?token=${encodeURIComponent(token)}`
    );
  }

  restablecerContrasena(token: string, nueva: string): Observable<{ mensaje: string }> {
    return this.http.post<{ mensaje: string }>(`${this.baseUrl}/restablecer-contrasena`, { token, nueva });
  }

  logout(): void {
    this.usuarioCache = null;
    this.tokenCache = null;
    sessionStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_TOKEN);
  }

  obtenerToken(): string | null {
    if (this.tokenCache === undefined) {
      this.tokenCache = sessionStorage.getItem(CLAVE_TOKEN);
    }
    return this.tokenCache;
  }

  obtenerUsuario(): Usuario | null {
    if (this.usuarioCache === undefined) {
      const datos = sessionStorage.getItem(CLAVE_SESION);
      try {
        this.usuarioCache = datos ? (JSON.parse(datos) as Usuario) : null;
      } catch {
        this.usuarioCache = null;
      }
    }
    return this.usuarioCache;
  }

  estaAutenticado(): boolean {
    return this.obtenerUsuario() !== null && this.obtenerToken() !== null;
  }

  esAdministrador(): boolean {
    return this.obtenerUsuario()?.idRol === ROL_ADMIN;
  }

  esEmpleado(): boolean {
    return this.obtenerUsuario()?.idRol === ROL_EMPLEADO;
  }

  debeCambiarContrasena(): boolean {
    return Boolean(this.obtenerUsuario()?.debeCambiarContrasena);
  }

  marcarContrasenaActualizada(): void {
    const usuario = this.obtenerUsuario();
    if (!usuario) return;
    const actualizado: Usuario = { ...usuario, debeCambiarContrasena: false };
    this.usuarioCache = actualizado;
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(actualizado));
  }
}
