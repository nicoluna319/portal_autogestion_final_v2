import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../services/auth.service";

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.estaAutenticado()) {
    router.navigate(["/login"]);
    return false;
  }
  if (auth.debeCambiarContrasena() && !state.url.startsWith("/cambiar-contrasena")) {
    router.navigate(["/cambiar-contrasena"]);
    return false;
  }
  return true;
};
