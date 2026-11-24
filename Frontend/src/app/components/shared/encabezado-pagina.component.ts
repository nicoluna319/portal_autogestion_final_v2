import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-encabezado-pagina",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div class="min-w-0">
        <h1 class="titulo-pagina">{{ titulo }}</h1>
        <p *ngIf="subtitulo" class="subtitulo-pagina">{{ subtitulo }}</p>
      </div>
      <ng-content />
    </header>
  `,
})
export class EncabezadoPaginaComponent {
  @Input() titulo = "";
  @Input() subtitulo = "";
}
