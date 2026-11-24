import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { EncabezadoPaginaComponent } from "../shared/encabezado-pagina.component";
import { UsuariosComponent } from "../usuarios/usuarios.component";

@Component({
  selector: "app-configuracion",
  standalone: true,
  imports: [CommonModule, RouterLink, EncabezadoPaginaComponent, UsuariosComponent],
  templateUrl: "./configuracion.component.html",
})
export class ConfiguracionComponent {
  seccionActiva: "usuarios" | "seguridad" = "usuarios";
}
