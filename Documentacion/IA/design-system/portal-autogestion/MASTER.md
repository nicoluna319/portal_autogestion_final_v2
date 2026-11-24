# Sistema de Diseño — Portal de Autogestión (`MASTER.md`)

> **Fuente única de verdad (Master)** para diseño visual, tokens de 3 capas, accesibilidad y componentes del **Portal de Autogestión** (Angular 17 + Tailwind CSS v3 + Certificados PDF).
>
> **Archivos vinculados:**
> - Tokens DTCG (fuente): `design-system/portal-autogestion/design-tokens.json`
> - Variables CSS activas: `Frontend/src/styles/tokens.css`
> - Configuración Tailwind: `Frontend/tailwind.config.js`
> - Componentes CSS base: `Frontend/src/styles.css`
> - Vista previa interactiva: `design-system/portal-autogestion/preview.html`

---

## 1. Dirección Visual y Dials

| Parámetro | Definición |
|---|---|
| **Estilo** | **Accessible & Ethical Enterprise** (institucional, claro, confiable, alto contraste) |
| **Identidad de marca** | Azul institucional **Navy** (`#0A2266` / `#0F2F80` / `#1B4FBF`) + acento **Ámbar cálido** (`#EF9F27`) |
| **Variance** | `4/10` — Equilibrado y moderno (jerarquía clara sin ornamentación excesiva) |
| **Motion** | `3/10` — Micro-interacciones sutiles (`150ms–300ms`), respetando `prefers-reduced-motion` |
| **Density** | `6/10` — Estándar de productividad (formularios amplios ≥ 44px táctil + tablas legibles con `tabular-nums`) |
| **Modos** | **Light Mode** por defecto; arquitectura semántica preparada con `.dark` en `tokens.css` |

---

## 2. Arquitectura de Tokens (3 Capas)

```text
┌──────────────────────────────────────────────────────────┐
│  Capa 3 · Component  (--btn-*, --card-*, --input-*, ...) │
├──────────────────────────────────────────────────────────┤
│  Capa 2 · Semantic   (--color-primary, --color-surface…) │
├──────────────────────────────────────────────────────────┤
│  Capa 1 · Primitive  (--navy-800, --amber-500, --space…) │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Paleta Semántica y Contraste WCAG 2.1 Verificado

| Rol semántico | Token CSS | Clase Tailwind | Hex | Contraste verificado |
|---|---|---|---|---|
| Fondo de lienzo | `--color-canvas` | `bg-canvas` / `bg-lienzo` | `#F4F6FB` | Base |
| Superficie (tarjetas) | `--color-surface` | `bg-surface` / `bg-white` | `#FFFFFF` | Base |
| Texto principal | `--color-foreground` | `text-foreground` / `text-ink` | `#1A1F2E` | **16.41:1** sobre `#FFFFFF` (AAA) |
| Texto secundario | `--color-muted-foreground` | `text-muted-foreground` / `text-ink-muted` | `#4A5675` | **7.29:1** sobre `#FFFFFF` (AAA) |
| Primario (CTA) | `--color-primary` | `bg-primary` / `bg-navy-700` | `#1B4FBF` | **7.20:1** con texto blanco (AAA) |
| Primario Hover | `--color-primary-hover` | `bg-primary-hover` / `bg-navy-800` | `#0F2F80` | **12.08:1** con texto blanco (AAA) |
| Acento de marca | `--color-accent` | `bg-accent` / `bg-amber` | `#EF9F27` | **6.74:1** con texto `#0A2266` (AA+) |
| Éxito (Aprobado / Activo) | `--color-success` / `--color-success-bg` | `bg-ok` / `insignia-ok` | `#1B7F3A` / `#EAF7EE` | **5.07:1** blanco / **6.95:1** `#14602B` en bg (AA+) |
| Alerta (Pendiente / Revisión) | `--color-warning-foreground` / `--color-warning-bg` | `insignia-warn` | `#7A5300` / `#FFF6E5` | **6.38:1** (AA+) |
| Peligro (Rechazado / Inactivo) | `--color-danger` / `--color-danger-bg` | `bg-err` / `insignia-err` | `#B83232` / `#FCEBEB` | **5.93:1** blanco / **7.61:1** `#8F2020` en bg (AAA) |
| Informativo | `--color-info` / `--color-info-bg` | `bg-info` / `insignia-info` | `#0369A1` / `#E0F2FE` | **5.93:1** blanco / **6.59:1** `#075985` en bg (AA+) |
| Borde sutil / fuerte | `--color-border` / `--color-border-strong` | `border-border` / `border-ink-soft` | `#DDE3F0` / `#CBD4E6` | ≥ 3:1 en controles activos |

> **Regla de oro:** nunca usar colores hexadecimales sueltos en componentes ni clases arbitrarias (`text-[#...]`). Consumir siempre clases registradas en `tailwind.config.js` o variables `var(--...)` de `tokens.css`.

### 2.2 Escala Completa Navy y Ámbar (HSL con soporte de opacidad)

- **Navy:** `50` (`#F1F5FF`), `100` (`#E3ECFF`), `200` (`#C8DAFD`), `300` (`#ABC4FA`), `400` (`#7CA5F5`), `500` (`#4B83F0`), `600` (`#2E6BE6`), `700` (`#1B4FBF`), `800` (`#0F2F80`), `900` (`#0A2266`), `950` (`#071A4D`).
- **Amber:** `50` (`#FFF6E5`), `100` (`#FDE8BF`), `200` (`#FBD58E`), `300` (`#F6B84A`), `400` (`#F3AE3C`), `500` (`#EF9F27`), `600` (`#B5790A`), `700` (`#996605`), `800` (`#7A5300`).
- Todos los colores se exponen como canales HSL separados por espacio (`--navy-700: 221 75% 43%`) para habilitar modificadores de opacidad en Tailwind (`bg-primary/10`, `border-navy-200`, `bg-navy-50/70`).

---

## 3. Tipografía

| Rol | Familia | Tamaño / Peso | Uso |
|---|---|---|---|
| **Display / Título página** | `DM Sans` (`--font-display`) | `24px–30px` (`text-2xl sm:text-3xl`), `800`, `tracking-tight`, `text-wrap: balance` | `.titulo-pagina` |
| **Título de sección** | `DM Sans` | `18px` (`text-lg`), `700`, barra lateral ámbar (`before:bg-amber`) | `.titulo-seccion` |
| **Cuerpo / UI** | `DM Sans` (`--font-sans`) | `14px–15px`, `400–600` | Formularios, tablas, párrafos |
| **Micro-etiqueta** | `DM Sans` | `11px–12px`, `700`, `uppercase tracking-wider` | Encabezados de tabla, `<dt>`, etiquetas de menú |
| **Monoespaciado / Códigos** | `JetBrains Mono` (`--font-mono`) | `12px–13px`, `tabular-nums` | Consecutivos (`CERT-0001`), códigos (`VER-XXXXXXXX`), documentos, salarios y fechas |

---

## 4. Espaciado, Radios, Elevación y Movimiento

- **Base de espaciado (4px):** `--space-1` (`4px`) a `--space-16` (`64px`). Ritmo vertical estándar entre secciones: `24px` (`mb-6` / `--spacing-section`).
- **Radios:**
  - Controles (botones, inputs, alertas): `12px` (`--radius-lg` / `rounded-xl`)
  - Superficies (tarjetas, tablas, modales): `16px` (`--radius-xl` / `rounded-2xl`)
  - Botones compactos (`.btn-mini`): `8px` (`--radius-md` / `rounded-lg`)
  - Insignias / pills: `9999px` (`--radius-full` / `rounded-full`)
- **Sombras:** `--shadow-card` (superficies en reposo), `--shadow-lift` (hover/selección), `--shadow-brand` (elementos sobre fondos oscuros), `--shadow-dialog` (modales).
- **Duraciones:** `--duration-fast` (`150ms` colores/bordes), `--duration-normal` (`200ms` botones/inputs), `--duration-slow` (`300ms` tarjetas/drawers). Desactivadas automáticamente bajo `@media (prefers-reduced-motion: reduce)`.

---

## 5. Especificación de Componentes

| Componente | Clases | Altura / Padding | Estados obligatorios |
|---|---|---|---|
| **Botón primario / secundario / éxito / peligro / acento** | `.btn-primario`, `.btn-secundario`, `.btn-exito`, `.btn-peligro`, `.btn-acento` | `min-h: 44px`, `px-5 py-2.5` | `hover`, `active:scale-[.98]`, `focus-visible` (ring 2px + offset 2px), `disabled` (opacity 50%, `cursor-not-allowed`) |
| **Botón de tabla** | `.btn-mini`, `.btn-mini-peligro` | `min-h: 36px`, `px-3` | Contraste ≥ 4.5:1 en reposo y hover; `aria-label` contextual |
| **Input / Select / Textarea** | `.input` + `.label` | `min-h: 46px`, `px-3.5 py-2.5` | `hover`, `focus` (borde + ring 30%), `ng-invalid.ng-touched` (borde peligro), `disabled` |
| **Tarjeta** | `.card`, `.card-hover` | `p-5 sm:p-6`, borde 1px `--card-border` | Sin sombras pesadas; borde de acento superior en KPIs |
| **Insignia de estado** | `.insignia-ok`, `.insignia-warn`, `.insignia-err`, `.insignia-info`, `.insignia-neutral` | `px-2.5 py-1`, `text-xs font-bold` | Punto indicador + texto explícito (nunca depender solo del color) |
| **Alerta** | `.alerta`, `.alerta-error`, `.alerta-warn`, `.alerta-info` | `px-4 py-3`, `rounded-xl` | `role="alert"` en errores y `role="status"` en confirmaciones |
| **Tabla de datos** | `.tabla-wrap` > `.tabla` | Encabezado `navy-900`, `py-3.5 px-4` | Scroll horizontal seguro en móvil, `tabular-nums` en cifras/fechas, hover de fila `navy-50` |

---

## 6. Anti-Patrones a Evitar

- Usar emojis (`📋`, `📄`, `⏱️`) como iconos estructurales de interfaz: usar siempre iconos vectoriales **SVG** con `aria-hidden="true"` cuando acompañen texto visible.
- Usar colores con contraste `< 4.5:1` en texto normal (por ejemplo `text-white/55` sobre fondo azul oscuro — mínimo `text-white/75`).
- Inyectar colores hexadecimales o sombras arbitrarias (`shadow-[...]`, `bg-[#...]`) directo en plantillas HTML en vez de usar tokens.
- Mostrar estados únicamente por color sin texto ni indicador semántico.
- Dejar `Certificados PDF` (`certificadosController.js`) desincronizado de los hex oficiales de marca (`#0F2F80`, `#0A2266`, `#E3ECFF`, `#EF9F27`, `#1A1F2E`, `#4A5675`).

---

## 7. Checklist Pre-Entrega

- [x] Todos los colores semánticos pasan contraste WCAG AA (≥ 4.5:1 texto normal, ≥ 3:1 bordes/iconos).
- [x] Sin emojis como iconos estructurales (solo SVG con `aria-hidden="true"`).
- [x] Focos visibles (`:focus-visible`) de 2px con offset 2px en fondos claros y oscuros (`.on-dark`).
- [x] Objetivos interactivos táctiles ≥ 44px en acciones principales y navegación.
- [x] Respeta `prefers-reduced-motion: reduce`.
- [x] `tabular-nums` en KPIs, fechas, salarios y consecutivos.
- [x] Validación automática de tokens (`validate-tokens.cjs`) sin violaciones en `Frontend/src/`.
