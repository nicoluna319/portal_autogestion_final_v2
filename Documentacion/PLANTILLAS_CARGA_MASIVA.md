# Plantillas para Carga Masiva de Empleados (Excel y CSV)

Esta carpeta contiene las plantillas oficiales vacías y los archivos de demostración precargados con **25 empleados ficticios** listos para subir desde el módulo **Empleados → Carga masiva desde Excel o CSV** (rol Administrador).

## Archivos incluidos

| Archivo | Propósito |
|---|---|
| `demo_carga_empleados_25.xlsx` | **Excel listo para demostración** con 25 empleados (incluye CC, CE, PPT y Pasaporte PA, distintas áreas, salarios y horas extras) + hoja `Instrucciones`. |
| `demo_carga_empleados_25.csv` | **CSV UTF-8 listo para demostración** con los mismos 25 empleados (también se aceptan CSV delimitados por `;`). |
| `plantilla_vacia_empleados.xlsx` | Plantilla oficial vacía en formato Excel (`.xlsx`). |
| `plantilla_vacia_empleados.csv` | Plantilla oficial vacía en formato CSV (`.csv`). |

## Estructura de columnas

| Columna | Obligatoria | Descripción / Regla |
|---|---|---|
| `tipoDocumento` | Sí | `CC`, `CE`, `PPT` o `PA` |
| `numeroDocumento` | Sí | 5–15 dígitos (`CC`, `CE`, `PPT`) o 5–20 alfanuméricos (`PA`). Único. |
| `primerNombre` | Sí | Solo letras (2–50 caracteres). |
| `segundoNombre` | No | Opcional. |
| `primerApellido` | Sí | Solo letras (2–50 caracteres). |
| `segundoApellido` | No | Opcional. |
| `genero` | Sí | `Masculino` o `Femenino` (acepta `M` / `F`). |
| `correo` | Sí | Correo electrónico único de acceso al portal. |
| `contrasena` | No | Mínimo 6 caracteres. Si queda vacía, el sistema asigna `123456`. |
| `cargo` | Sí | Cargo del empleado. |
| `area` | Sí | Área o dependencia. |
| `fechaIngreso` | Sí | `AAAA-MM-DD` (o `DD/MM/AAAA`), no puede ser futura. |
| `salario` | No | Número mayor o igual a 0 (sin símbolos). |
| `promedioHorasExtras` | No | Número mayor o igual a 0 (ej. `12.5`). |

## Cómo hacer la demostración

1. Inicia sesión como **Administrador** (`jltrivino@portalautogestion.com` / `123456`).
2. Entra a **Empleados** en el menú lateral.
3. En la tarjeta **Carga masiva desde Excel o CSV**, arrastra o selecciona `demo_carga_empleados_25.xlsx` (o `demo_carga_empleados_25.csv`).
4. Pulsa **Cargar empleados**: verás el resumen de filas procesadas, empleados creados y la tabla actualizada con los 25 nuevos registros.
5. Si vuelves a subir el mismo archivo, el sistema detecta y reporta los duplicados fila por fila sin romper el proceso.

> Para regenerar todas las plantillas tras cambios futuros: ejecuta `npm run generar-plantillas` dentro de `Backend/`.
