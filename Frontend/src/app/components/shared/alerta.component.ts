import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

export type VarianteAlerta = "exito" | "error" | "aviso" | "info";

@Component({
  selector: "app-alerta",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div *ngIf="mensaje"
         class="alerta"
         [ngClass]="claseVariante"
         [attr.role]="esError ? 'alert' : 'status'"
         [attr.aria-live]="esError ? 'assertive' : 'polite'"
         aria-atomic="true">
      <span class="min-w-0 flex-1">{{ mensaje }}</span>
      <ng-content />
    </div>
  `,
})
export class AlertaComponent {
  @Input() mensaje = "";
  @Input() variante: VarianteAlerta = "exito";

  get esError(): boolean {
    return this.variante === "error";
  }

  get claseVariante(): string {
    if (this.variante === "error") return "alerta-error";
    if (this.variante === "aviso") return "alerta-warn";
    if (this.variante === "info") return "alerta-info";
    return "";
  }
}
