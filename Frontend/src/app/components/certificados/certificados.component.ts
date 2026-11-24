import { Component, DestroyRef, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { catchError, forkJoin, of } from "rxjs";
import { TarjetaPerfilComponent, DatoPerfil } from "../tarjeta-perfil/tarjeta-perfil.component";
import { AlertaComponent, VarianteAlerta } from "../shared/alerta.component";
import { EncabezadoPaginaComponent } from "../shared/encabezado-pagina.component";
import { EstadoVacioComponent } from "../shared/estado-vacio.component";
import { antiguedad, fechaCorta, formatearUltimoAcceso } from "../../utils/perfil.utils";
import { descargarBlob, leerMensajeErrorHttp } from "../../utils/archivo.utils";
import { coincideBusqueda } from "../../utils/busqueda.utils";
import { CertificadoService } from "../../services/certificado.service";
import { EmpleadoService } from "../../services/empleado.service";
import { AuthService } from "../../services/auth.service";
import { Certificado, GenerarCertificadoRequest } from "../../models/certificado.model";
import { Empleado } from "../../models/empleado.model";

interface OpcionCertificado {
  valor: "todos" | "sin_basico" | "con_extras";
  icono: "completa" | "sin_basico" | "con_extras";
  titulo: string;
  descripcion: string;
  detalle: string;
}

@Component({
  selector: "app-certificados",
  standalone: true,
  imports: [CommonModule, FormsModule, TarjetaPerfilComponent, AlertaComponent, EncabezadoPaginaComponent, EstadoVacioComponent],
  templateUrl: "./certificados.component.html",
})
export class CertificadosComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly esAdmin = this.authService.esAdministrador();

  // Pestañas exclusivas de administrador:
  // "propios"   -> generar y consultar únicamente los certificados propios del admin
  // "empleados" -> seleccionar cualquier empleado al hacer clic para generar/consultar sus certificados
  pestanaActiva: "propios" | "empleados" = "propios";

  // Perfil propio (para empleado normal o pestaña "Mis certificados" del admin)
  miEmpleado: Empleado | null = null;
  miAntiguedad = "";
  misDatosPerfil: DatoPerfil[] = [];
  misCertificados: Certificado[] = [];

  // Directorio de empleados (solo admin -> pestaña "Certificados de empleados")
  empleados: Empleado[] = [];
  empleadosFiltrados: Empleado[] = [];
  filtroEmpleado = "";
  filtroEstadoEmpleado: "todos" | "activos" | "inactivos" = "todos";
  cargandoEmpleados = false;

  // Empleado clickeado en la pestaña "Certificados de empleados"
  empleadoSeleccionado: Empleado | null = null;
  antiguedadSeleccionado = "";
  datosPerfilSeleccionado: DatoPerfil[] = [];
  empleadoSeleccionadoInactivo = false;
  certificadosSeleccionado: Certificado[] = [];

  // Índice global de certificados (para conteo por empleado sin mostrar listas gigantes revueltas)
  todosCertificados: Certificado[] = [];
  conteoPorEmpleado = new Map<number, number>();

  mensaje = "";
  varianteMensaje: VarianteAlerta = "exito";
  generando = false;
  ultimoAccesoTexto = "";

  readonly opciones: OpcionCertificado[] = [
    {
      valor: "todos",
      icono: "completa",
      titulo: "Certificación Laboral Completa",
      descripcion: "Nombre, cédula, cargo, área, ingreso y salario básico",
      detalle: "Incluye nombre, cédula, cargo, área, fecha de ingreso y salario básico mensual. Para trámites financieros o bancarios.",
    },
    {
      valor: "sin_basico",
      icono: "sin_basico",
      titulo: "Sin Salario Básico",
      descripcion: "Igual que el anterior pero sin mencionar el salario",
      detalle: "Incluye nombre, cédula, cargo, área y fecha de ingreso, sin mencionar el salario. Ideal cuando no se requiere revelar los ingresos.",
    },
    {
      valor: "con_extras",
      icono: "con_extras",
      titulo: "Con Horas Extras",
      descripcion: "Todos los datos + salario básico y promedio de horas extras",
      detalle: "Incluye nombre, documento, cargo, área, fecha de ingreso, salario básico mensual y el promedio de horas extras de los últimos 3 meses.",
    },
  ];

  opcionSeleccionada: OpcionCertificado = this.opciones[0];

  constructor(
    private certificadoService: CertificadoService,
    private empleadoService: EmpleadoService,
    public authService: AuthService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const usuario = this.authService.obtenerUsuario();
    if (!usuario) return;
    this.ultimoAccesoTexto = formatearUltimoAcceso(usuario.ultimoAcceso);

    if (this.esAdmin) {
      this.cargarVistaAdministrador(usuario.idUsuario!);
    } else {
      this.empleadoService
        .consultarPorIdUsuario(usuario.idUsuario!)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (emp) => {
            this.configurarMiPerfil(emp);
            this.cargarMisCertificados();
          },
          error: () => this.avisar("error", "No se encontró un perfil de empleado asociado a tu usuario."),
        });
    }
  }

  /** Empleado actualmente objetivo según la pestaña activa */
  get empleadoActivo(): Empleado | null {
    if (!this.esAdmin || this.pestanaActiva === "propios") return this.miEmpleado;
    return this.empleadoSeleccionado;
  }

  get activoEsInactivo(): boolean {
    const emp = this.empleadoActivo;
    return Boolean(emp && emp.id_estado !== undefined && emp.id_estado !== 1);
  }

  get activoEsOtroEmpleado(): boolean {
    return this.esAdmin && this.pestanaActiva === "empleados" && Boolean(this.empleadoSeleccionado);
  }

  cambiarPestana(pestana: "propios" | "empleados"): void {
    this.pestanaActiva = pestana;
    this.mensaje = "";
    if (pestana === "propios") {
      this.empleadoSeleccionado = null;
    }
  }

  private avisar(variante: VarianteAlerta, texto: string): void {
    this.varianteMensaje = variante;
    this.mensaje = texto;
  }

  private construirDatosPerfil(emp: Empleado, esPropio: boolean): DatoPerfil[] {
    return [
      { icono: "cedula", etiqueta: emp.tipo_documento || "Documento", valor: emp.numero_documento || emp.cedula || "" },
      { icono: "area", etiqueta: "Área", valor: emp.area || "" },
      { icono: "fecha", etiqueta: "Fecha de ingreso", valor: fechaCorta(emp.fecha_ingreso || emp.fechaIngreso) },
      esPropio
        ? { icono: "reloj", etiqueta: "Último ingreso", valor: this.ultimoAccesoTexto }
        : { icono: "correo", etiqueta: "Correo destinatario", valor: emp.correo || "—" },
    ];
  }

  private configurarMiPerfil(emp: Empleado | null): void {
    this.miEmpleado = emp;
    if (!emp) {
      this.miAntiguedad = "";
      this.misDatosPerfil = [];
      this.misCertificados = [];
      return;
    }
    this.miAntiguedad = antiguedad(emp.fecha_ingreso || emp.fechaIngreso);
    this.misDatosPerfil = this.construirDatosPerfil(emp, true);
  }

  private recalcularIndicesCertificados(): void {
    const mapa = new Map<number, number>();
    for (const c of this.todosCertificados) {
      if (c.id_empleado) mapa.set(c.id_empleado, (mapa.get(c.id_empleado) || 0) + 1);
    }
    this.conteoPorEmpleado = mapa;

    const miId = this.miEmpleado?.id_empleado;
    this.misCertificados = miId ? this.todosCertificados.filter((c) => c.id_empleado === miId) : [];

    const idSel = this.empleadoSeleccionado?.id_empleado;
    this.certificadosSeleccionado = idSel ? this.todosCertificados.filter((c) => c.id_empleado === idSel) : [];
  }

  conteoCertificados(idEmpleado?: number): number {
    return idEmpleado ? this.conteoPorEmpleado.get(idEmpleado) || 0 : 0;
  }

  private cargarVistaAdministrador(idUsuarioAdmin: number): void {
    this.cargandoEmpleados = true;
    const idParam = Number(this.route.snapshot.queryParamMap.get("empleado")) || null;

    forkJoin({
      lista: this.empleadoService.listar(),
      todos: this.certificadoService.listarTodos().pipe(catchError(() => of([] as Certificado[]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ lista, todos }) => {
          this.empleados = lista;
          this.todosCertificados = todos;
          this.cargandoEmpleados = false;

          const propio = lista.find((e) => (e.id_usuario ?? e.idUsuario) === idUsuarioAdmin) || null;
          this.configurarMiPerfil(propio);
          this.aplicarFiltroEmpleados();
          this.recalcularIndicesCertificados();

          // Si vino con ?empleado=X desde el módulo Empleados, abrir directamente ese empleado
          if (idParam) {
            if (propio && propio.id_empleado === idParam) {
              this.pestanaActiva = "propios";
            } else {
              const destino = lista.find((e) => e.id_empleado === idParam);
              if (destino) {
                this.pestanaActiva = "empleados";
                this.abrirEmpleado(destino);
              }
            }
          } else if (!propio) {
            this.pestanaActiva = "empleados";
          }
        },
        error: () => {
          this.cargandoEmpleados = false;
          this.avisar("error", "No se pudo cargar el listado de empleados.");
        },
      });
  }

  aplicarFiltroEmpleados(): void {
    this.empleadosFiltrados = this.empleados.filter((e) => {
      if (this.filtroEstadoEmpleado === "activos" && e.id_estado === 2) return false;
      if (this.filtroEstadoEmpleado === "inactivos" && e.id_estado !== 2) return false;
      return coincideBusqueda(
        [e.nombre, e.tipo_documento, e.numero_documento, e.cedula, e.cargo, e.area, e.correo],
        this.filtroEmpleado
      );
    });
  }

  abrirEmpleado(emp: Empleado): void {
    this.empleadoSeleccionado = emp;
    this.empleadoSeleccionadoInactivo = emp.id_estado !== undefined && emp.id_estado !== 1;
    this.antiguedadSeleccionado = antiguedad(emp.fecha_ingreso || emp.fechaIngreso);
    this.datosPerfilSeleccionado = this.construirDatosPerfil(emp, false);
    this.mensaje = "";
    this.recalcularIndicesCertificados();
  }

  volverADirectorio(): void {
    this.empleadoSeleccionado = null;
    this.mensaje = "";
  }

  cargarMisCertificados(): void {
    if (!this.miEmpleado?.id_empleado) return;
    this.certificadoService
      .historialPorEmpleado(this.miEmpleado.id_empleado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (data) => (this.misCertificados = data) });
  }

  refrescarHistoriales(): void {
    if (this.esAdmin) {
      this.certificadoService
        .listarTodos()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (data) => {
            this.todosCertificados = data;
            this.recalcularIndicesCertificados();
          },
        });
    } else {
      this.cargarMisCertificados();
    }
  }

  seleccionar(opcion: OpcionCertificado): void {
    this.opcionSeleccionada = opcion;
    this.mensaje = "";
  }

  private construirSolicitud(canal: "pdf" | "correo"): GenerarCertificadoRequest | null {
    const emp = this.empleadoActivo;
    if (!emp) return null;
    const idUsuarioDestino = emp.id_usuario ?? emp.idUsuario ?? this.authService.obtenerUsuario()?.idUsuario;
    return {
      idEmpleado: emp.id_empleado,
      idUsuario: idUsuarioDestino,
      tipoCarta: this.opcionSeleccionada.valor,
      canal,
    };
  }

  descargarPdf(): void {
    const emp = this.empleadoActivo;
    const solicitud = this.construirSolicitud("pdf");
    if (!solicitud || !emp || this.activoEsInactivo) return;

    this.generando = true;
    this.mensaje = "";
    const doc = (emp.numero_documento || emp.cedula || "empleado").replace(/[^a-zA-Z0-9_-]/g, "");

    this.certificadoService
      .generarPdf(solicitud)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          descargarBlob(blob, `certificado-${this.opcionSeleccionada.valor}-${doc}.pdf`);
          this.avisar(
            "exito",
            this.activoEsOtroEmpleado
              ? `Certificado de ${emp.nombre} generado y descargado correctamente.`
              : "Tu certificado fue generado y descargado correctamente."
          );
          this.generando = false;
          this.refrescarHistoriales();
        },
        error: async (err) => {
          this.avisar("error", "Error al generar el certificado: " + (await leerMensajeErrorHttp(err)));
          this.generando = false;
        },
      });
  }

  enviarPorCorreo(): void {
    const emp = this.empleadoActivo;
    const solicitud = this.construirSolicitud("correo");
    if (!solicitud || !emp || this.activoEsInactivo) return;

    this.generando = true;
    this.mensaje = "";

    this.certificadoService
      .generarYEnviarPorCorreo(solicitud)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.avisar("exito", resp.mensaje);
          this.generando = false;
          this.refrescarHistoriales();
        },
        error: (err) => {
          this.avisar("error", "Error al enviar el certificado: " + (err.error?.mensaje || err.message));
          this.generando = false;
        },
      });
  }

  descargarExistente(c: Certificado): void {
    if (!c.id_certificado) return;
    this.mensaje = "";
    const consec = (c.consecutivo ?? c.id_certificado).toString().padStart(4, "0");
    this.certificadoService
      .descargarExistente(c.id_certificado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => descargarBlob(blob, `CERT-${consec}.pdf`),
        error: async (err) =>
          this.avisar("error", "No se pudo descargar el certificado histórico: " + (await leerMensajeErrorHttp(err))),
      });
  }

  nombreTipoPorId(idTipo?: number): string {
    if (idTipo === 1) return "Laboral completa";
    if (idTipo === 2) return "Sin salario básico";
    if (idTipo === 3) return "Con horas extras";
    return "Certificado laboral";
  }

  inicialesEmpleado(nombre?: string): string {
    const partes = (nombre || "").trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || "") + (partes[1]?.[0] || "")).toUpperCase() || "EM";
  }

  trackByCertificado = (_index: number, c: Certificado): number => c.id_certificado ?? c.consecutivo ?? _index;
  trackByEmpleado = (_index: number, e: Empleado): number => e.id_empleado ?? _index;
}
