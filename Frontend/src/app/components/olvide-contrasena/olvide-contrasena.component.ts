import { Component, DestroyRef, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AuthService } from "../../services/auth.service";

@Component({
  selector: "app-olvide-contrasena",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./olvide-contrasena.component.html",
})
export class OlvideContrasenaComponent {
  private readonly destroyRef = inject(DestroyRef);

  correo = "";
  enviando = false;
  enviado = false;
  mensaje = "";
  esError = false;
  readonly anio = new Date().getFullYear();

  constructor(private authService: AuthService) {}

  enviar(): void {
    this.mensaje = "";
    this.esError = false;
    const correoLimpio = this.correo.trim();
    if (!correoLimpio) {
      this.esError = true;
      this.mensaje = "Ingresa tu correo electrónico registrado.";
      return;
    }

    this.enviando = true;
    this.authService
      .solicitarRecuperacion(correoLimpio)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.enviando = false;
          this.enviado = true;
          this.esError = false;
          this.mensaje = resp.mensaje;
        },
        error: (err) => {
          this.enviando = false;
          this.esError = true;
          this.mensaje = err.error?.mensaje || "No se pudo procesar la solicitud. Intenta nuevamente.";
        },
      });
  }
}
