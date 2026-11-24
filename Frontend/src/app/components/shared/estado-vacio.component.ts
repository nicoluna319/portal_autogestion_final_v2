import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-estado-vacio",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vacio">
      <strong class="text-base text-foreground-heading">{{ titulo }}</strong>
      <span *ngIf="descripcion">{{ descripcion }}</span>
      <ng-content />
    </div>
  `,
})
export class EstadoVacioComponent {
  @Input() titulo = "";
  @Input() descripcion = "";
}
