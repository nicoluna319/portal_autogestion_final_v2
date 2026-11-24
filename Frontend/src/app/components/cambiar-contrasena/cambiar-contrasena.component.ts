import { Component, DestroyRef, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AuthService } from "../../services/auth.service";

@Component({
  selector: "app-cambiar-contrasena",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./cambiar-contrasena.component.html",
})
export class CambiarContrasenaComponent {
  private readonly destroyRef = inject(DestroyRef);

  actual = "";
  nueva = "";
  confirmar = "";
  mensaje = "";
  tipoMensaje: "exito" | "error" = "exito";
  guardando = false;
  verClaves = false;

  constructor(private authService: AuthService, private router: Router) {}

  get esCambioObligatorio(): boolean {
    return this.authService.debeCambiarContrasena();
  }

  guardar(): void {
    this.mensaje = "";
    if (this.nueva.length < 6) return this.error("La nueva contraseña debe tener mínimo 6 caracteres");
    if (this.nueva !== this.confirmar) return this.error("La confirmación no coincide con la nueva contraseña");
    if (this.nueva === this.actual) return this.error("La nueva contraseña debe ser diferente a la actual");

    const eraObligatorio = this.esCambioObligatorio;
    this.guardando = true;
    this.authService
      .cambiarContrasena(this.actual, this.nueva)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.guardando = false;
          this.authService.marcarContrasenaActualizada();
          this.tipoMensaje = "exito";
          this.mensaje = resp.mensaje;
          this.actual = this.nueva = this.confirmar = "";
          if (eraObligatorio) {
            this.router.navigate(["/"]);
          }
        },
        error: (err) => {
          this.guardando = false;
          this.error(err.error?.mensaje || "No se pudo cambiar la contraseña");
        },
      });
  }

  volver(): void {
    this.router.navigate(["/"]);
  }

  private error(texto: string): void {
    this.tipoMensaje = "error";
    this.mensaje = texto;
  }
}
