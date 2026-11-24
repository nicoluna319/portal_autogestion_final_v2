import { Component, DestroyRef, HostListener, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, forkJoin, of } from "rxjs";
import { Solicitud, NuevaSolicitud } from "../../models/solicitud.model";
import { SolicitudService } from "../../services/solicitud.service";
import { AuthService } from "../../services/auth.service";
import { EmpleadoService } from "../../services/empleado.service";
import { ESTADO_SOLICITUD, ESTADOS_SOLICITUD, TIPOS_SOLICITUD } from "../../models/catalogos";
import { fechaCorta } from "../../utils/perfil.utils";
import { coincideBusqueda } from "../../utils/busqueda.utils";
import { ConfirmarDialogoComponent } from "../confirmar-dialogo/confirmar-dialogo.component";
import { AlertaComponent, VarianteAlerta } from "../shared/alerta.component";
import { EncabezadoPaginaComponent } from "../shared/encabezado-pagina.component";
import { EstadoVacioComponent } from "../shared/estado-vacio.component";

@Component({
  selector: "app-solicitudes",
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmarDialogoComponent, AlertaComponent, EncabezadoPaginaComponent, EstadoVacioComponent],
  templateUrl: "./solicitudes.component.html",
})
export class SolicitudesComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly tiposCatalogo = TIPOS_SOLICITUD;
  readonly ESTADOS: Record<number, string> = ESTADOS_SOLICITUD;
  readonly fechaCorta = fechaCorta;
  readonly esAdmin = this.authService.esAdministrador();

  solicitudes: Solicitud[] = [];
  misSolicitudes: Solicitud[] = [];
  listaFiltrada: Solicitud[] = [];
  vistaAdmin: "gestion" | "propias" = "gestion";
  filtroTexto = "";
  filtroEstado: "todos" | "3" | "4" | "5" | "6" = "todos";

  nuevaSolicitud: NuevaSolicitud = this.solicitudVacia();
  tipoSeleccionado = this.tiposCatalogo[0];
  tipoOtro = "";

  mensaje = "";
  varianteMensaje: VarianteAlerta = "exito";
  cargando = false;
  enviando = false;
  miIdEmpleado: number | null = null;
  miIdUsuario: number | null = null;

  // Diálogo de resolución (rechazo obligatorio / aprobación con nota opcional)
  resolviendo: { solicitud: Solicitud; nuevoEstado: 5 | 6 } | null = null;
  solicitudAEliminar: Solicitud | null = null;
  motivo = "";

  @HostListener("document:keydown.escape")
  cerrarDialogosConEscape(): void {
    if (this.resolviendo) this.cancelarResolucion();
  }

  constructor(
    private solicitudService: SolicitudService,
    public authService: AuthService,
    private empleadoService: EmpleadoService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const usuario = this.authService.obtenerUsuario();
    this.miIdUsuario = usuario?.idUsuario ?? null;

    if (this.esAdmin && this.route.snapshot.queryParamMap.get("vista") === "propias") {
      this.vistaAdmin = "propias";
    }

    if (this.esAdmin) {
      this.cargando = true;
      forkJoin({
        lista: this.solicitudService.listar(),
        perfil: usuario?.idUsuario
          ? this.empleadoService.consultarPorIdUsuario(usuario.idUsuario).pipe(catchError(() => of(null)))
          : of(null),
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ lista, perfil }) => {
            this.miIdEmpleado = perfil?.id_empleado ?? null;
            this.nuevaSolicitud.idEmpleado = perfil?.id_empleado ?? 0;
            this.solicitudes = lista;
            this.sincronizarMisSolicitudesAdmin();
            this.aplicarFiltro();
            this.cargando = false;
          },
          error: (err) => {
            this.avisar("error", "Error al cargar solicitudes: " + (err.error?.mensaje || err.message));
            this.cargando = false;
          },
        });
    } else if (usuario?.idUsuario) {
      this.cargando = true;
      this.empleadoService
        .consultarPorIdUsuario(usuario.idUsuario)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (emp) => {
            this.miIdEmpleado = emp.id_empleado ?? null;
            this.nuevaSolicitud.idEmpleado = emp.id_empleado ?? 0;
            this.cargarMisSolicitudes();
          },
          error: () => {
            this.cargando = false;
            this.avisar("error", "No se encontró un perfil de empleado asociado a tu usuario.");
          },
        });
    }
  }

  private sincronizarMisSolicitudesAdmin(): void {
    this.misSolicitudes = this.solicitudes.filter((s) => {
      if (this.miIdEmpleado && s.id_empleado === this.miIdEmpleado) return true;
      if (this.miIdUsuario && s.id_usuario_empleado === this.miIdUsuario) return true;
      return false;
    });
  }

  cambiarVistaAdmin(vista: "gestion" | "propias"): void {
    this.vistaAdmin = vista;
    this.aplicarFiltro();
  }

  aplicarFiltro(): void {
    const base = !this.esAdmin ? this.misSolicitudes : this.vistaAdmin === "propias" ? this.misSolicitudes : this.solicitudes;
    this.listaFiltrada = base.filter((s) => {
      if (this.filtroEstado !== "todos" && Number(s.id_estado) !== Number(this.filtroEstado)) return false;
      return coincideBusqueda(
        [
          s.id_solicitud,
          s.nombre_empleado,
          s.cedula_empleado,
          s.tipo_solicitud,
          s.descripcion,
          s.respuesta,
          this.ESTADOS[s.id_estado || 3],
        ],
        this.filtroTexto
      );
    });
  }

  get puedeCrearSolicitud(): boolean {
    if (this.esAdmin) return this.vistaAdmin === "propias";
    return Boolean(this.miIdEmpleado);
  }

  private avisar(variante: VarianteAlerta, texto: string): void {
    this.varianteMensaje = variante;
    this.mensaje = texto;
  }

  solicitudVacia(): NuevaSolicitud {
    return { idEmpleado: this.miIdEmpleado || 0, tipoSolicitud: "", descripcion: "", fechaInicio: "", fechaFin: "" };
  }

  cargarSolicitudes(): void {
    this.cargando = true;
    this.solicitudService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.solicitudes = data;
          this.sincronizarMisSolicitudesAdmin();
          this.aplicarFiltro();
          this.cargando = false;
        },
        error: (err) => {
          this.avisar("error", "Error al cargar solicitudes: " + (err.error?.mensaje || err.message));
          this.cargando = false;
        },
      });
  }

  cargarMisSolicitudes(): void {
    if (!this.miIdEmpleado) return;
    this.cargando = true;
    this.solicitudService
      .listarPorEmpleado(this.miIdEmpleado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.misSolicitudes = data;
          this.aplicarFiltro();
          this.cargando = false;
        },
        error: (err) => {
          this.avisar("error", "Error al cargar tus solicitudes: " + (err.error?.mensaje || err.message));
          this.cargando = false;
        },
      });
  }

  crear(): void {
    this.mensaje = "";
    const tipoFinal = this.tipoSeleccionado === "Otro" ? this.tipoOtro.trim() : this.tipoSeleccionado;
    if (!tipoFinal || tipoFinal.length < 2) {
      return this.avisar("error", "Especifica el tipo de solicitud (mínimo 2 caracteres)");
    }
    if (this.nuevaSolicitud.fechaInicio && this.nuevaSolicitud.fechaFin && this.nuevaSolicitud.fechaFin < this.nuevaSolicitud.fechaInicio) {
      return this.avisar("error", "La fecha de fin no puede ser anterior a la fecha de inicio");
    }

    const payload: NuevaSolicitud = {
      idEmpleado: this.miIdEmpleado || this.nuevaSolicitud.idEmpleado || 0,
      tipoSolicitud: tipoFinal,
      descripcion: this.nuevaSolicitud.descripcion,
      ...(this.nuevaSolicitud.fechaInicio ? { fechaInicio: this.nuevaSolicitud.fechaInicio } : {}),
      ...(this.nuevaSolicitud.fechaFin ? { fechaFin: this.nuevaSolicitud.fechaFin } : {}),
    };

    this.enviando = true;
    this.solicitudService
      .crear(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando = false;
          this.avisar("exito", "Solicitud enviada correctamente");
          this.nuevaSolicitud = this.solicitudVacia();
          this.tipoSeleccionado = this.tiposCatalogo[0];
          this.tipoOtro = "";
          if (this.esAdmin) {
            // Si el backend creó el perfil laboral automáticamente, lo refrescamos
            if (!this.miIdEmpleado && this.miIdUsuario) {
              this.empleadoService
                .consultarPorIdUsuario(this.miIdUsuario)
                .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
                .subscribe((emp) => {
                  this.miIdEmpleado = emp?.id_empleado ?? this.miIdEmpleado;
                  this.cargarSolicitudes();
                });
            } else {
              this.cargarSolicitudes();
            }
          } else {
            this.cargarMisSolicitudes();
          }
        },
        error: (err) => {
          this.enviando = false;
          this.avisar("error", "Error al enviar la solicitud: " + (err.error?.mensaje || err.message));
        },
      });
  }

  esFinalizada(s: Solicitud): boolean {
    return s.id_estado === ESTADO_SOLICITUD.APROBADO || s.id_estado === ESTADO_SOLICITUD.RECHAZADO;
  }

  cambiarEstado(solicitud: Solicitud, nuevoEstado: number, mensaje?: string): void {
    if (!solicitud.id_solicitud) return;
    this.solicitudService
      .actualizarEstado(solicitud.id_solicitud, nuevoEstado, mensaje)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.avisar("exito", "Estado actualizado correctamente");
          this.cargarSolicitudes();
        },
        error: (err) => this.avisar("error", "Error al actualizar estado: " + (err.error?.mensaje || err.message)),
      });
  }

  abrirResolucion(solicitud: Solicitud, nuevoEstado: 5 | 6): void {
    this.resolviendo = { solicitud, nuevoEstado };
    this.motivo = "";
  }

  cancelarResolucion(): void {
    this.resolviendo = null;
    this.motivo = "";
  }

  confirmarResolucion(): void {
    if (!this.resolviendo) return;
    const { solicitud, nuevoEstado } = this.resolviendo;
    if (nuevoEstado === 6 && !this.motivo.trim()) return;
    this.cambiarEstado(solicitud, nuevoEstado, this.motivo.trim() || undefined);
    this.cancelarResolucion();
  }

  eliminar(s: Solicitud): void {
    if (!s.id_solicitud) return;
    this.solicitudAEliminar = s;
  }

  confirmarEliminacion(): void {
    const s = this.solicitudAEliminar;
    this.solicitudAEliminar = null;
    if (!s?.id_solicitud) return;
    this.solicitudService
      .eliminar(s.id_solicitud)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.avisar("exito", "Solicitud eliminada correctamente");
          this.esAdmin ? this.cargarSolicitudes() : this.cargarMisSolicitudes();
        },
        error: (err) => this.avisar("error", "Error al eliminar: " + (err.error?.mensaje || err.message)),
      });
  }

  trackBySolicitud = (_index: number, s: Solicitud): number => s.id_solicitud ?? _index;
}
