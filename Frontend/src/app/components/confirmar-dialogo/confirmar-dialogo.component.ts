import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-confirmar-dialogo",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div *ngIf="abierto"
         class="fixed inset-0 z-[450] flex animate-fade-in items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm overscroll-contain"
         (click)="cancelar.emit()">
      <div class="w-full max-w-md animate-scale-in rounded-card border border-border bg-surface p-6 shadow-dialog overscroll-contain"
           role="alertdialog"
           aria-modal="true"
           aria-labelledby="confirm-dialog-title"
           aria-describedby="confirm-dialog-desc"
           (click)="$event.stopPropagation()">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  [ngClass]="variante === 'peligro' ? 'bg-danger-bg text-danger' : 'bg-info-bg text-info'"
                  aria-hidden="true">
              <svg *ngIf="variante === 'peligro'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <svg *ngIf="variante !== 'peligro'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </span>
            <div>
              <h2 id="confirm-dialog-title" class="text-lg font-extrabold text-foreground-heading">{{ titulo }}</h2>
              <p id="confirm-dialog-desc" class="mt-1 text-sm text-muted-foreground">{{ descripcion }}</p>
            </div>
          </div>
          <button type="button"
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-surface-subtle hover:text-foreground"
                  aria-label="Cerrar diálogo"
                  (click)="cancelar.emit()">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>

        <div class="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <button type="button" class="btn-secundario" (click)="cancelar.emit()">{{ textoCancelar }}</button>
          <button type="button"
                  [ngClass]="variante === 'peligro' ? 'btn-peligro' : 'btn-primario'"
                  (click)="confirmar.emit()">
            {{ textoConfirmar }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmarDialogoComponent {
  @Input() abierto = false;
  @Input() titulo = "Confirmar acción";
  @Input() descripcion = "";
  @Input() textoConfirmar = "Confirmar";
  @Input() textoCancelar = "Cancelar";
  @Input() variante: "peligro" | "primario" = "peligro";

  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.abierto) this.cancelar.emit();
  }
}
