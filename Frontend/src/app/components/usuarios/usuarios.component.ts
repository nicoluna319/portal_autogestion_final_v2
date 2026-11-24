import { Component, DestroyRef, Input, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Usuario } from "../../models/usuario.model";
import { UsuarioService } from "../../services/usuario.service";
import { GENEROS, TIPOS_DOCUMENTO, nombreTipoDocumento } from "../../models/catalogos";
import { coincideBusqueda, soloAlfanumerico } from "../../utils/busqueda.utils";
import { ConfirmarDialogoComponent } from "../confirmar-dialogo/confirmar-dialogo.component";
import { AlertaComponent, VarianteAlerta } from "../shared/alerta.component";
import { EncabezadoPaginaComponent } from "../shared/encabezado-pagina.component";
import { EstadoVacioComponent } from "../shared/estado-vacio.component";

@Component({
  selector: "app-usuarios",
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmarDialogoComponent, AlertaComponent, EncabezadoPaginaComponent, EstadoVacioComponent],
  templateUrl: "./usuarios.component.html",
})
export class UsuariosComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  @Input() embebido = false;

  readonly tiposDocumento = TIPOS_DOCUMENTO;
  readonly generos = GENEROS;
  readonly nombreTipo = nombreTipoDocumento;

  usuarios: Usuario[] = [];
  usuariosFiltrados: Usuario[] = [];
  filtroTabla = "";
  filtroRol: "todos" | "admins" | "empleados" = "todos";
  usuarioAEliminar: Usuario | null = null;
  usuarioSeleccionado: Usuario = this.usuarioVacio();
  modoEdicion = false;
  /** Paso 1: tipo y número de documento. Paso 2: el resto de los datos. */
  paso: "identificacion" | "formulario" = "identificacion";
  documentoTipo = "CC";
  documentoNumero = "";
  existente: Usuario | null = null;
  busqueda = "";
  mensaje = "";
  varianteMensaje: VarianteAlerta = "exito";
  cargando = false;

  constructor(private usuarioService: UsuarioService) {}

  ngOnInit(): void {
    this.cargarUsuarios();
  }

  aplicarFiltro(): void {
    this.usuariosFiltrados = this.usuarios.filter((u) => {
      if (this.filtroRol === "admins" && u.idRol !== 1) return false;
      if (this.filtroRol === "empleados" && u.idRol !== 2) return false;
      return coincideBusqueda(
        [
          u.nombre,
          u.tipoDocumento,
          u.numeroDocumento,
          u.correo,
          u.idRol === 1 ? "Administrador" : "Empleado",
          u.idEstado === 1 ? "Activo" : "Inactivo",
        ],
        this.filtroTabla
      );
    });
  }

  usuarioVacio(): Usuario {
    return { tipoDocumento: "CC", numeroDocumento: "", primerNombre: "", segundoNombre: "", primerApellido: "", segundoApellido: "", genero: "", nombre: "", correo: "", contrasena: "", idRol: 2, idEstado: 1 };
  }

  cargarUsuarios(): void {
    this.cargando = true;
    this.usuarioService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.usuarios = data;
          this.aplicarFiltro();
          this.cargando = false;
        },
        error: (err) => {
          this.avisar("error", "Error al cargar usuarios: " + (err.error?.mensaje || err.message));
          this.cargando = false;
        },
      });
  }

  private avisar(variante: VarianteAlerta, texto: string): void {
    this.varianteMensaje = variante;
    this.mensaje = texto;
  }

  // ----- Paso 1: identificación -----
  continuar(): void {
    this.mensaje = "";
    this.existente = null;
    const numero = soloAlfanumerico(this.documentoNumero).toUpperCase();
    if (!numero) return this.avisar("error", "Escribe el número de documento");
    this.documentoNumero = numero;
    this.usuarioService
      .buscarPorDocumento(numero)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (u) => {
          if (u) {
            this.existente = u;
            this.avisar("error", `Ya existe un usuario con ese documento: ${u.nombre}.`);
          } else {
            this.usuarioSeleccionado = { ...this.usuarioVacio(), tipoDocumento: this.documentoTipo, numeroDocumento: numero };
            this.paso = "formulario";
          }
        },
        error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo consultar el documento"),
      });
  }

  // ----- Búsqueda tolerante para editar (documento, nombre o correo sin importar espacios/signos) -----
  buscar(): void {
    this.mensaje = "";
    const consulta = this.busqueda.trim();
    const limpio = soloAlfanumerico(consulta);
    if (!limpio) return this.avisar("error", "Escribe el documento, nombre o correo que quieres buscar");

    const coincidenciaExactaDoc = this.usuarios.find((u) => soloAlfanumerico(u.numeroDocumento) === limpio);
    if (coincidenciaExactaDoc) return this.editar(coincidenciaExactaDoc);

    const coincidencias = this.usuarios.filter((u) =>
      coincideBusqueda([u.numeroDocumento, u.nombre, u.correo], consulta)
    );
    if (coincidencias.length === 1) return this.editar(coincidencias[0]);
    if (coincidencias.length > 1) {
      this.filtroTabla = consulta;
      this.aplicarFiltro();
      return this.avisar("info", `Se encontraron ${coincidencias.length} usuarios que coinciden. Selecciona el que deseas editar en la lista.`);
    }

    this.usuarioService
      .buscarPorDocumento(limpio)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (u) => (u ? this.editar(u) : this.avisar("error", "No se encontró un usuario con esa búsqueda")),
        error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo realizar la búsqueda"),
      });
  }

  guardar(): void {
    this.mensaje = "";
    const peticion = this.modoEdicion
      ? this.usuarioService.actualizar(this.usuarioSeleccionado)
      : this.usuarioService.crear(this.usuarioSeleccionado);
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (resp) => { this.avisar("exito", resp.mensaje); this.cancelar(false); this.cargarUsuarios(); },
      error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo guardar el usuario"),
    });
  }

  editar(usuario: Usuario): void {
    this.usuarioSeleccionado = { ...usuario, contrasena: "" };
    this.modoEdicion = true;
    this.paso = "formulario";
    this.existente = null;
    this.busqueda = "";
  }

  eliminar(usuario: Usuario): void {
    if (!usuario.idUsuario) return;
    this.usuarioAEliminar = usuario;
  }

  confirmarEliminacion(): void {
    const usuario = this.usuarioAEliminar;
    this.usuarioAEliminar = null;
    if (!usuario?.idUsuario) return;
    this.usuarioService
      .eliminar(usuario.idUsuario)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.avisar("exito", "Usuario eliminado correctamente"); this.cargarUsuarios(); },
        error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo eliminar el usuario"),
      });
  }

  cancelar(limpiarMensaje = true): void {
    this.usuarioSeleccionado = this.usuarioVacio();
    this.modoEdicion = false;
    this.paso = "identificacion";
    this.documentoNumero = "";
    this.documentoTipo = "CC";
    this.existente = null;
    if (limpiarMensaje) this.mensaje = "";
  }

  trackByUsuario = (_index: number, u: Usuario): number => u.idUsuario ?? _index;
}
