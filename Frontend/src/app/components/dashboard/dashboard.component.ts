import { Component, DestroyRef, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, forkJoin, of, switchMap } from "rxjs";
import { TarjetaPerfilComponent, DatoPerfil } from "../tarjeta-perfil/tarjeta-perfil.component";
import { EncabezadoPaginaComponent } from "../shared/encabezado-pagina.component";
import { EstadoVacioComponent } from "../shared/estado-vacio.component";
import { antiguedad, fechaCorta, formatearUltimoAcceso } from "../../utils/perfil.utils";
import { AuthService } from "../../services/auth.service";
import { EmpleadoService } from "../../services/empleado.service";
import { SolicitudService } from "../../services/solicitud.service";
import { UsuarioService } from "../../services/usuario.service";
import { Empleado } from "../../models/empleado.model";
import { Solicitud } from "../../models/solicitud.model";
import { ESTADO_SOLICITUD, ESTADOS_SOLICITUD } from "../../models/catalogos";

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink, TarjetaPerfilComponent, EncabezadoPaginaComponent, EstadoVacioComponent],
  templateUrl: "./dashboard.component.html",
})
export class DashboardComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  usuario = this.authService.obtenerUsuario();
  readonly primerNombre = (this.usuario?.nombre || "").split(" ")[0];
  readonly esAdmin = this.authService.esAdministrador();

  // Vista Empleado
  empleado: Empleado | null = null;
  misSolicitudes: Solicitud[] = [];
  totalSolicitudes = 0;
  solicitudesAtendidas = 0;
  solicitudesEnRevision = 0;
  solicitudesPendientes = 0;

  // Vista Administrador
  totalUsuarios = 0;
  totalEmpleados = 0;
  totalSolicitudesPorGestionarAdmin = 0;
  adminPendientes = 0;
  adminEnRevision = 0;
  solicitudesRecientesAdmin: Solicitud[] = [];

  subtituloPerfil = this.esAdmin ? "Administrador del sistema" : "";
  selloPerfil = "";
  datosPerfil: DatoPerfil[] = [];

  cargando = true;
  readonly ESTADOS: Record<number, string> = ESTADOS_SOLICITUD;

  constructor(
    public authService: AuthService,
    private empleadoService: EmpleadoService,
    private solicitudService: SolicitudService,
    private usuarioService: UsuarioService
  ) {}

  ngOnInit(): void {
    this.recalcularTarjetaPerfil();
    if (this.esAdmin) {
      this.cargarDatosAdmin();
    } else {
      this.cargarDatosEmpleado();
    }
  }

  private cargarDatosEmpleado(): void {
    if (!this.usuario?.idUsuario) {
      this.cargando = false;
      return;
    }
    this.empleadoService
      .consultarPorIdUsuario(this.usuario.idUsuario)
      .pipe(
        switchMap((emp) => {
          this.empleado = emp;
          this.recalcularTarjetaPerfil();
          return this.solicitudService.listarPorEmpleado(emp.id_empleado!).pipe(catchError(() => of([] as Solicitud[])));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (solicitudes) => {
          this.misSolicitudes = solicitudes.slice(0, 5);
          this.totalSolicitudes = solicitudes.length;
          let pendientes = 0;
          let enRevision = 0;
          let atendidas = 0;
          for (const s of solicitudes) {
            if (s.id_estado === ESTADO_SOLICITUD.PENDIENTE) pendientes++;
            else if (s.id_estado === ESTADO_SOLICITUD.EN_REVISION) enRevision++;
            else if (s.id_estado === ESTADO_SOLICITUD.APROBADO || s.id_estado === ESTADO_SOLICITUD.RECHAZADO) atendidas++;
          }
          this.solicitudesPendientes = pendientes;
          this.solicitudesEnRevision = enRevision;
          this.solicitudesAtendidas = atendidas;
          this.cargando = false;
        },
        error: () => (this.cargando = false),
      });
  }

  private cargarDatosAdmin(): void {
    forkJoin({
      usuarios: this.usuarioService.listar().pipe(catchError(() => of([]))),
      empleados: this.empleadoService.listar().pipe(catchError(() => of([]))),
      solicitudes: this.solicitudService.listar().pipe(catchError(() => of([] as Solicitud[]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ usuarios, empleados, solicitudes }) => {
        this.totalUsuarios = usuarios.length;
        this.totalEmpleados = empleados.length;
        this.solicitudesRecientesAdmin = solicitudes.slice(0, 5);
        let pendientes = 0;
        let enRevision = 0;
        for (const s of solicitudes) {
          if (s.id_estado === ESTADO_SOLICITUD.PENDIENTE) pendientes++;
          else if (s.id_estado === ESTADO_SOLICITUD.EN_REVISION) enRevision++;
        }
        this.adminPendientes = pendientes;
        this.adminEnRevision = enRevision;
        this.totalSolicitudesPorGestionarAdmin = pendientes + enRevision;
        this.cargando = false;
      });
  }

  private recalcularTarjetaPerfil(): void {
    const ultimo: DatoPerfil = { icono: "reloj", etiqueta: "Último ingreso", valor: formatearUltimoAcceso(this.usuario?.ultimoAcceso) };
    if (this.esAdmin) {
      this.subtituloPerfil = "Administrador del sistema";
      this.selloPerfil = "";
      this.datosPerfil = [
        { icono: "correo", etiqueta: "Correo", valor: this.usuario?.correo || "" },
        { icono: "rol", etiqueta: "Rol", valor: "Administrador" },
        ultimo,
      ];
      return;
    }
    const e = this.empleado;
    this.subtituloPerfil = e?.cargo || "";
    this.selloPerfil = e ? antiguedad(e.fecha_ingreso || e.fechaIngreso) : "";
    this.datosPerfil = [
      { icono: "cedula", etiqueta: e?.tipo_documento || "Documento", valor: e?.numero_documento || e?.cedula || "" },
      { icono: "area", etiqueta: "Área", valor: e?.area || "" },
      { icono: "fecha", etiqueta: "Fecha de ingreso", valor: fechaCorta(e?.fecha_ingreso || e?.fechaIngreso) },
      ultimo,
    ];
  }

  trackBySolicitud = (_index: number, s: Solicitud): number => s.id_solicitud ?? _index;
}
