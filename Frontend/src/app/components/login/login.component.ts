import { Component, DestroyRef, OnInit, OnDestroy, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AuthService } from "../../services/auth.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./login.component.html",
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);

  correo = "";
  contrasena = "";
  error = "";
  cargando = false;
  verClave = false;
  readonly anio = new Date().getFullYear();

  readonly imagenes = [
    { src: "assets/imagenes/portal1.JPG", width: 770, height: 434, etiqueta: "Bienvenido", titulo: "Portal de Autogestión", descripcion: "Gestiona tus solicitudes y certificados de forma rápida, segura y desde cualquier dispositivo." },
    { src: "assets/imagenes/portal2.jpg", width: 1920, height: 1080, etiqueta: "Trámites en línea", titulo: "Solicitudes sin filas ni papeleo", descripcion: "Radica permisos, vacaciones y novedades laborales desde donde estés." },
    { src: "assets/imagenes/portal3.JPG", width: 615, height: 228, etiqueta: "Certificados al instante", titulo: "Genera tus certificados laborales", descripcion: "Descárgalos en PDF o recíbelos directamente en tu correo, en segundos." },
  ];
  indiceActual = 0;
  pausado = false;
  pausadoManual = false;
  private intervalo: ReturnType<typeof setInterval> | null = null;

  constructor(private authService: AuthService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.pausadoManual = reducido;
    this.pausado = reducido;
    this.intervalo = setInterval(() => {
      if (!this.pausado && !this.pausadoManual) this.siguiente();
    }, 5000);
    if (this.route.snapshot.queryParamMap.get("expirada")) {
      this.error = "Tu sesión expiró. Inicia sesión nuevamente.";
    }
  }

  alternarPausa(): void {
    this.pausadoManual = !this.pausadoManual;
    this.pausado = this.pausadoManual;
  }

  ngOnDestroy(): void {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  siguiente(): void {
    this.indiceActual = (this.indiceActual + 1) % this.imagenes.length;
  }

  anterior(): void {
    this.indiceActual = (this.indiceActual - 1 + this.imagenes.length) % this.imagenes.length;
  }

  irA(indice: number): void {
    this.indiceActual = indice;
  }

  ingresar(): void {
    this.error = "";
    if (!this.correo || !this.contrasena) {
      this.error = "Ingresa tu correo y contraseña";
      return;
    }
    this.cargando = true;
    this.authService
      .login(this.correo, this.contrasena)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.cargando = false;
          this.router.navigate([resp.usuario?.debeCambiarContrasena ? "/cambiar-contrasena" : "/"]);
        },
        error: (err) => {
          this.cargando = false;
          this.error = err.error?.mensaje || "No se pudo iniciar sesión. Verifica tus credenciales.";
        },
      });
  }
}
