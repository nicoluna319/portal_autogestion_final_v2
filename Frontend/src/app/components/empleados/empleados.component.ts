import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin } from "rxjs";
import { Empleado, ResultadoCargaMasiva } from "../../models/empleado.model";
import { Usuario } from "../../models/usuario.model";
import { EmpleadoService } from "../../services/empleado.service";
import { UsuarioService } from "../../services/usuario.service";
import { nombreTipoDocumento } from "../../models/catalogos";
import { descargarBlob, formatearTamanoArchivo } from "../../utils/archivo.utils";
import { coincideBusqueda, soloAlfanumerico } from "../../utils/busqueda.utils";
import { ConfirmarDialogoComponent } from "../confirmar-dialogo/confirmar-dialogo.component";
import { AlertaComponent, VarianteAlerta } from "../shared/alerta.component";
import { EncabezadoPaginaComponent } from "../shared/encabezado-pagina.component";
import { EstadoVacioComponent } from "../shared/estado-vacio.component";

interface PersonaVista { nombre: string; correo: string; genero: string; tipoDocumento: string; numeroDocumento: string; }
interface ConfirmacionEmpleado {
  titulo: string;
  descripcion: string;
  textoConfirmar: string;
  variante: "peligro" | "primario";
  ejecutar: () => void;
}

@Component({
  selector: "app-empleados",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ConfirmarDialogoComponent, AlertaComponent, EncabezadoPaginaComponent, EstadoVacioComponent],
  templateUrl: "./empleados.component.html",
})
export class EmpleadosComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild("inputArchivo") inputArchivo?: ElementRef<HTMLInputElement>;

  readonly nombreTipo = nombreTipoDocumento;
  readonly tamanoLegible = formatearTamanoArchivo;
  readonly tamanoPagina = 20;

  empleados: Empleado[] = [];
  empleadosFiltrados: Empleado[] = [];
  empleadosPaginados: Empleado[] = [];
  totalPaginas = 1;
  paginaActual = 1;
  filtroTabla = "";
  filtroEstado: "todos" | "activos" | "inactivos" = "todos";

  /** Datos laborales del formulario; el id del empleado lo maneja el sistema internamente. */
  form = this.formVacio();
  persona: PersonaVista | null = null;
  modoEdicion = false;
  paso: "busqueda" | "formulario" = "busqueda";
  documentoNuevo = "";
  busqueda = "";
  faltaUsuario = false;
  mensaje = "";
  varianteMensaje: VarianteAlerta = "exito";
  cargando = false;

  archivoSeleccionado: File | null = null;
  extensionArchivo = "";
  arrastrandoArchivo = false;
  cargandoArchivo = false;
  resultadoCarga: ResultadoCargaMasiva | null = null;
  confirmacionPendiente: ConfirmacionEmpleado | null = null;

  constructor(private empleadoService: EmpleadoService, private usuarioService: UsuarioService) {}

  ngOnInit(): void {
    this.cargarEmpleados();
  }

  // Recalcula listas derivadas con búsqueda tolerante (ignora tildes, mayúsculas, espacios y símbolos).
  recalcularTabla(reiniciarPagina = false): void {
    if (reiniciarPagina) this.paginaActual = 1;
    this.empleadosFiltrados = this.empleados.filter((e) => {
      if (this.filtroEstado === "activos" && e.id_estado === 2) return false;
      if (this.filtroEstado === "inactivos" && e.id_estado !== 2) return false;
      return coincideBusqueda(
        [e.nombre, e.tipo_documento, e.numero_documento, e.cedula, e.cargo, e.area, e.correo],
        this.filtroTabla
      );
    });
    this.totalPaginas = Math.max(1, Math.ceil(this.empleadosFiltrados.length / this.tamanoPagina));
    this.paginaActual = Math.min(this.paginaActual, this.totalPaginas);
    const inicio = (this.paginaActual - 1) * this.tamanoPagina;
    this.empleadosPaginados = this.empleadosFiltrados.slice(inicio, inicio + this.tamanoPagina);
  }

  irAPagina(p: number): void {
    this.paginaActual = Math.min(this.totalPaginas, Math.max(1, p));
    this.recalcularTabla(false);
  }

  formVacio() {
    return { idEmpleado: 0, cargo: "", area: "", fechaIngreso: "", salario: 0, promedioHorasExtras: 0 };
  }

  private avisar(variante: VarianteAlerta, texto: string): void {
    this.varianteMensaje = variante;
    this.mensaje = texto;
  }

  cargarEmpleados(): void {
    this.cargando = true;
    this.empleadoService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.empleados = data;
          this.recalcularTabla(false);
          this.cargando = false;
        },
        error: (err) => {
          this.avisar("error", "Error al cargar empleados: " + (err.error?.mensaje || err.message));
          this.cargando = false;
        },
      });
  }

  // ----- Nuevo empleado: consulta tolerante al formato de documento -----
  buscarPersona(): void {
    this.mensaje = "";
    this.faltaUsuario = false;
    const documento = soloAlfanumerico(this.documentoNuevo).toUpperCase();
    if (!documento) return this.avisar("error", "Escribe el número de documento de la persona");
    this.documentoNuevo = documento;

    forkJoin({
      emp: this.empleadoService.consultarPorDocumento(documento),
      usuario: this.usuarioService.buscarPorDocumento(documento),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ emp, usuario }: { emp: Empleado | null; usuario: Usuario | null }) => {
          if (emp) {
            this.avisar("error", `${emp.nombre} ya está registrado como empleado: puedes editarlo.`);
            return this.editar(emp);
          }
          if (!usuario) {
            this.faltaUsuario = true;
            return this.avisar("error", "No existe un usuario con ese número de documento. Primero créalo en Configuración > Usuarios.");
          }
          this.persona = {
            nombre: usuario.nombre,
            correo: usuario.correo,
            genero: usuario.genero,
            tipoDocumento: usuario.tipoDocumento,
            numeroDocumento: usuario.numeroDocumento,
          };
          this.form = this.formVacio();
          this.modoEdicion = false;
          this.paso = "formulario";
        },
        error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo consultar el documento"),
      });
  }

  // Búsqueda tolerante para editar (acepta documento con puntos/guiones/espacios, nombre, cargo, área o correo)
  buscarParaEditar(): void {
    this.mensaje = "";
    const consulta = this.busqueda.trim();
    const limpio = soloAlfanumerico(consulta);
    if (!limpio) return this.avisar("error", "Escribe el documento, nombre, cargo o área del empleado");

    const coincidenciaDoc = this.empleados.find(
      (e) => soloAlfanumerico(e.numero_documento || e.cedula) === limpio
    );
    if (coincidenciaDoc) return this.editar(coincidenciaDoc);

    const coincidencias = this.empleados.filter((e) =>
      coincideBusqueda([e.nombre, e.numero_documento, e.cedula, e.cargo, e.area, e.correo], consulta)
    );
    if (coincidencias.length === 1) return this.editar(coincidencias[0]);
    if (coincidencias.length > 1) {
      this.filtroTabla = consulta;
      this.recalcularTabla(true);
      return this.avisar("info", `Se encontraron ${coincidencias.length} empleados que coinciden. Selecciona el que deseas editar en la lista.`);
    }

    this.empleadoService
      .consultarPorDocumento(limpio)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (emp) => (emp ? this.editar(emp) : this.avisar("error", "No existe un empleado con esa búsqueda")),
        error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo realizar la búsqueda"),
      });
  }

  editar(e: Empleado): void {
    this.persona = {
      nombre: e.nombre || "", correo: e.correo || "", genero: e.genero || "",
      tipoDocumento: e.tipo_documento || "CC", numeroDocumento: e.numero_documento || e.cedula,
    };
    this.form = {
      idEmpleado: e.id_empleado || 0,
      cargo: e.cargo, area: e.area,
      fechaIngreso: (e.fecha_ingreso || e.fechaIngreso || "").substring(0, 10),
      salario: Number(e.salario) || 0,
      promedioHorasExtras: Number(e.promedio_horas_extras ?? e.promedioHorasExtras) || 0,
    };
    this.modoEdicion = true;
    this.paso = "formulario";
    this.busqueda = "";
  }

  guardar(): void {
    if (!this.persona) return;
    const peticion = this.modoEdicion
      ? this.empleadoService.actualizar({ ...this.form })
      : this.empleadoService.crear({ numeroDocumento: this.persona.numeroDocumento, ...this.form });
    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (resp) => { this.avisar("exito", resp.mensaje); this.cancelar(false); this.cargarEmpleados(); },
      error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo guardar el empleado"),
    });
  }

  cambiarEstado(e: Empleado): void {
    if (!e.id_empleado) return;
    const nuevoEstado: 1 | 2 = e.id_estado === 2 ? 1 : 2;
    const desactivar = nuevoEstado === 2;
    this.confirmacionPendiente = {
      titulo: desactivar ? "Desactivar empleado" : "Reactivar empleado",
      descripcion: desactivar
        ? `¿Deseas desactivar a ${e.nombre}? Conservará su historial laboral, pero no podrá ingresar ni emitir certificados activos.`
        : `¿Deseas reactivar a ${e.nombre}? Volverá a tener acceso al portal.`,
      textoConfirmar: desactivar ? "Desactivar" : "Reactivar",
      variante: desactivar ? "peligro" : "primario",
      ejecutar: () => {
        this.empleadoService
          .cambiarEstado(e.id_empleado!, nuevoEstado)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (resp) => { this.avisar("exito", resp.mensaje); this.cargarEmpleados(); },
            error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo actualizar el estado del empleado"),
          });
      },
    };
  }

  eliminar(e: Empleado): void {
    if (!e.id_empleado) return;
    this.confirmacionPendiente = {
      titulo: "Eliminar empleado",
      descripcion: `¿Seguro que deseas eliminar a ${e.nombre} como empleado? Esta acción no se puede deshacer si no tiene historial asociado.`,
      textoConfirmar: "Eliminar empleado",
      variante: "peligro",
      ejecutar: () => {
        this.empleadoService
          .eliminar(e.id_empleado!)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => { this.avisar("exito", "Empleado eliminado correctamente"); this.cargarEmpleados(); },
            error: (err) => this.avisar("error", err.error?.mensaje || "No se pudo eliminar el empleado"),
          });
      },
    };
  }

  confirmarDialogo(): void {
    const accion = this.confirmacionPendiente;
    this.confirmacionPendiente = null;
    accion?.ejecutar();
  }

  cancelarDialogo(): void {
    this.confirmacionPendiente = null;
  }

  cancelar(limpiarMensaje = true): void {
    this.form = this.formVacio();
    this.persona = null;
    this.modoEdicion = false;
    this.paso = "busqueda";
    this.documentoNuevo = "";
    this.faltaUsuario = false;
    if (limpiarMensaje) this.mensaje = "";
  }

  // ----- Carga masiva (Excel y CSV) -----
  descargarPlantilla(formato: "xlsx" | "csv" = "xlsx"): void {
    this.empleadoService
      .descargarPlantilla(formato)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) =>
          descargarBlob(blob, formato === "csv" ? "plantilla_carga_empleados.csv" : "plantilla_carga_empleados.xlsx"),
        error: () => this.avisar("error", `No se pudo descargar la plantilla ${formato.toUpperCase()}`),
      });
  }

  private validarYAsignarArchivo(archivo: File | null): void {
    this.resultadoCarga = null;
    if (!archivo) {
      this.archivoSeleccionado = null;
      this.extensionArchivo = "";
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(archivo.name)) {
      this.archivoSeleccionado = null;
      this.extensionArchivo = "";
      this.limpiarInputArchivo();
      this.avisar("error", "Formato no compatible. Selecciona un archivo Excel (.xlsx, .xls) o CSV (.csv).");
      return;
    }
    this.mensaje = "";
    this.archivoSeleccionado = archivo;
    const partes = archivo.name.split(".");
    this.extensionArchivo = (partes[partes.length - 1] || "").toUpperCase();
  }

  seleccionarArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.validarYAsignarArchivo(input.files && input.files.length > 0 ? input.files[0] : null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.arrastrandoArchivo = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.arrastrandoArchivo = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.arrastrandoArchivo = false;
    this.validarYAsignarArchivo(event.dataTransfer?.files?.[0] || null);
  }

  quitarArchivo(): void {
    this.archivoSeleccionado = null;
    this.extensionArchivo = "";
    this.limpiarInputArchivo();
  }

  private limpiarInputArchivo(): void {
    if (this.inputArchivo?.nativeElement) {
      this.inputArchivo.nativeElement.value = "";
    }
  }

  cargarArchivo(): void {
    if (!this.archivoSeleccionado) return this.avisar("error", "Selecciona primero un archivo Excel (.xlsx, .xls) o CSV (.csv)");
    this.cargandoArchivo = true;
    this.resultadoCarga = null;
    this.mensaje = "";

    this.empleadoService
      .cargaMasiva(this.archivoSeleccionado)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.resultadoCarga = resp;
          this.cargandoArchivo = false;
          this.archivoSeleccionado = null;
          this.extensionArchivo = "";
          this.limpiarInputArchivo();
          this.cargarEmpleados();
        },
        error: (err) => {
          this.avisar("error", "Error al procesar el archivo: " + (err.error?.mensaje || err.message));
          this.cargandoArchivo = false;
        },
      });
  }

  trackByEmpleado = (_index: number, e: Empleado): number => e.id_empleado ?? _index;
}
