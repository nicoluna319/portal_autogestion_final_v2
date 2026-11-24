import { Routes } from "@angular/router";
import { authGuard } from "./guards/auth.guard";
import { adminGuard } from "./guards/admin.guard";

export const routes: Routes = [
  {
    path: "login",
    loadComponent: () => import("./components/login/login.component").then((m) => m.LoginComponent),
  },
  {
    path: "olvide-contrasena",
    loadComponent: () =>
      import("./components/olvide-contrasena/olvide-contrasena.component").then((m) => m.OlvideContrasenaComponent),
  },
  {
    path: "restablecer-contrasena",
    loadComponent: () =>
      import("./components/restablecer-contrasena/restablecer-contrasena.component").then((m) => m.RestablecerContrasenaComponent),
  },
  {
    path: "",
    canActivate: [authGuard],
    loadComponent: () => import("./components/dashboard/dashboard.component").then((m) => m.DashboardComponent),
  },
  {
    path: "configuracion",
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import("./components/configuracion/configuracion.component").then((m) => m.ConfiguracionComponent),
  },
  {
    path: "usuarios",
    redirectTo: "configuracion",
    pathMatch: "full",
  },
  {
    path: "empleados",
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import("./components/empleados/empleados.component").then((m) => m.EmpleadosComponent),
  },
  {
    path: "solicitudes",
    canActivate: [authGuard],
    loadComponent: () => import("./components/solicitudes/solicitudes.component").then((m) => m.SolicitudesComponent),
  },
  {
    path: "certificados",
    canActivate: [authGuard],
    loadComponent: () => import("./components/certificados/certificados.component").then((m) => m.CertificadosComponent),
  },
  {
    path: "cambiar-contrasena",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./components/cambiar-contrasena/cambiar-contrasena.component").then((m) => m.CambiarContrasenaComponent),
  },
  { path: "**", redirectTo: "login" },
];
