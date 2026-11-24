# Portal de Autogestión

Aplicación web full-stack para la gestión de empleados, solicitudes laborales y certificados en PDF o correo electrónico.

## Estructura del proyecto

```text
portal_autogestion_final_v2/
├── Backend/          API REST en Node.js + Express + MySQL + PDFKit
├── Frontend/         Aplicación web en Angular 17 (standalone) + Tailwind CSS
├── Database/         Scripts SQL de instalación y migraciones
├── Plantillas_Demo/  Archivos Excel y CSV para carga masiva de empleados
└── Documentacion/    Guías técnicas, despliegue y recursos de apoyo
```

## Requisitos previos

- Node.js 18+ y npm
- MySQL 8 / MariaDB (por ejemplo mediante XAMPP)

## Instalación y ejecución local

### 1. Base de datos

Importa `Database/portal_acegrasco.sql` en MySQL (phpMyAdmin o CLI). Para entornos en la nube sin `CREATE DATABASE`, utiliza `Database/portal_acegrasco_nube.sql`.

### 2. Backend

```bash
cd Backend
npm install
copy .env.example .env
npm run dev
```

Configura en `Backend/.env` las credenciales de MySQL, `JWT_SECRET`, `CORS_ORIGIN`, `FRONTEND_URL` y las variables `SMTP_*` (requeridas para envío de certificados y recuperación de contraseña por correo).

API disponible en `http://localhost:3000`.

### 3. Frontend

```bash
cd Frontend
npm install
npx ng serve
```

Aplicación disponible en `http://localhost:4200`.

## Funcionalidades principales

- **Autenticación y seguridad**: inicio de sesión con JWT, contraseñas con bcrypt, bloqueo temporal por intentos fallidos, cambio de contraseña y flujo de **«Olvidé mi contraseña»** con restablecimiento por correo.
- **Panel de inicio**: perfil del usuario, resumen de indicadores, accesos rápidos y atajo directo a las solicitudes más recientes.
- **Solicitudes**: radicación y seguimiento de solicitudes propias (para empleados y administradores) y gestión con máquina de estados (Pendiente, En revisión, Aprobado, Rechazado con motivo).
- **Certificados laborales**: generación en PDF o envío por correo (completa, sin salario básico y con horas extras), con pestañas separadas para certificados propios y directorio de empleados para el administrador.
- **Empleados**: registro individual, edición, activación/desactivación lógica y carga masiva desde Excel (`.xlsx`, `.xls`) o CSV.
- **Configuración**: administración centralizada de cuentas de usuario (administradores y empleados) y seguridad de cuenta.

## Endpoints principales

| Módulo | Ruta base | Acceso |
|---|---|---|
| Autenticación y recuperación | `/api/login` | Público (cambio de contraseña requiere token) |
| Usuarios | `/api/usuarios` | Solo Administrador |
| Empleados | `/api/empleados` | Administrador (empleado solo consulta su perfil) |
| Solicitudes | `/api/solicitudes` | Autenticado (gestión global solo Administrador) |
| Certificados | `/api/certificados` | Autenticado (emisión a terceros solo Administrador) |

## Pruebas

```bash
cd Backend
npm test
```

Ejecuta las 39 pruebas automatizadas con Jest + Supertest sin necesidad de levantar MySQL. También se incluye la colección de Postman en `Backend/postman/Portal_Autogestion.postman_collection.json`.

## Documentación adicional

- Guía de despliegue (Render, Netlify y MySQL en la nube): [Documentacion/GUIA_DESPLIEGUE.md](Documentacion/GUIA_DESPLIEGUE.md)
- Formato y pruebas de carga masiva: [Documentacion/PLANTILLAS_CARGA_MASIVA.md](Documentacion/PLANTILLAS_CARGA_MASIVA.md)
