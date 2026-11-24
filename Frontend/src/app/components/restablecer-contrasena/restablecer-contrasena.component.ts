import { Component, DestroyRef, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AuthService } from "../../services/auth.service";

@Component({
  selector: "app-restablecer-contrasena",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: "./restablecer-contrasena.component.html",
})
export class RestablecerContrasenaComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  token = "";
  verificando = true;
  tokenValido = false;
  correoEnmascarado = "";

  nueva = "";
  confirmar = "";
  verClaves = false;
  guardando = false;
  completado = false;

  mensaje = "";
  esError = false;
  readonly anio = new Date().getFullYear();

  constructor(private route: ActivatedRoute, private authService: AuthService) {}

  ngOnInit(): void {
    this.token = (this.route.snapshot.queryParamMap.get("token") || "").trim();
    if (!this.token) {
      this.verificando = false;
      this.tokenValido = false;
      this.esError = true;
      this.mensaje = "El enlace de recuperación no es válido o está incompleto.";
      return;
    }

    this.authService
      .validarTokenRecuperacion(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.verificando = false;
          this.tokenValido = Boolean(resp.valido);
          this.correoEnmascarado = resp.correoEnmascarado || "";
        },
        error: (err) => {
          this.verificando = false;
          this.tokenValido = false;
          this.esError = true;
          this.mensaje = err.error?.mensaje || "El enlace de recuperación es inválido o ya expiró.";
        },
      });
  }

  restablecer(): void {
    this.mensaje = "";
    this.esError = false;

    if (this.nueva.length < 6) {
      this.esError = true;
      this.mensaje = "La nueva contraseña debe tener mínimo 6 caracteres.";
      return;
    }
    if (this.nueva !== this.confirmar) {
      this.esError = true;
      this.mensaje = "La confirmación no coincide con la nueva contraseña.";
      return;
    }

    this.guardando = true;
    this.authService
      .restablecerContrasena(this.token, this.nueva)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.guardando = false;
          this.completado = true;
          this.esError = false;
          this.mensaje = resp.mensaje;
          this.nueva = "";
          this.confirmar = "";
        },
        error: (err) => {
          this.guardando = false;
          this.esError = true;
          this.mensaje = err.error?.mensaje || "No se pudo restablecer la contraseña.";
        },
      });
  }
}
