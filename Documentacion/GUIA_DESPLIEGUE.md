# Guía de despliegue en la nube

Orden recomendado: **1) Base de datos MySQL → 2) Backend (Render) → 3) Frontend (Netlify) → 4) CORS y `FRONTEND_URL` → 5) Verificación**.

## 1. Base de datos (MySQL / TiDB Cloud / proveedor compatible)

1. Crea una instancia MySQL en la nube y copia **host, puerto, usuario, contraseña y nombre de la base**. Si el proveedor entrega certificado CA (`ca.pem`), descárgalo.
2. Importa `Database/portal_acegrasco_nube.sql` (no incluye `CREATE DATABASE` ni `USE`):
   - **DBeaver**: crea conexión MySQL con SSL activado → clic derecho sobre la base → *Tools → Execute script* → selecciona el archivo.
   - **Consola**:
     ```bash
     mysql -h HOST -P PUERTO -u USUARIO -p --ssl-ca=ca.pem --default-character-set=utf8mb4 NOMBRE_BASE < Database/portal_acegrasco_nube.sql
     ```
3. Verifica que existan las tablas (`roles`, `estados`, `usuarios`, `empleados`, `tipo_certificados`, `certificados`, `solicitudes`, `respuestas`, `recuperacion_contrasena`).

## 2. Backend en Render

1. En Render selecciona **New + → Web Service** y conecta el repositorio (también puedes usar `render.yaml` como *Blueprint*).
2. Configura:
   - **Root Directory:** `Backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Define las variables de entorno:

| Variable | Descripción |
|---|---|
| `NODE_VERSION` | `20` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Datos de conexión de la base de datos |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | (Opcional) Certificado CA (`ca.pem`, saltos de línea escapados con `\n`) |
| `JWT_SECRET` | Clave secreta larga y aleatoria (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `CORS_ORIGIN` | URL pública de Netlify sin barra final (se actualiza en el paso 4) |
| `FRONTEND_URL` | Misma URL pública de Netlify (para enlaces de recuperación de contraseña) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Credenciales SMTP (en Render gratuito usar puerto `2525`, por ejemplo Mailtrap) |
| `SMTP_SECURE` | `false` (solo `true` si el puerto es `465`) |

## 3. Frontend en Netlify

1. Actualiza `Frontend/src/environments/environment.prod.ts` con la URL del backend terminada en `/api`.
2. Sube los cambios al repositorio.
3. En Netlify importa el proyecto: `netlify.toml` ya define la carpeta base `Frontend`, el comando de compilación y la redirección SPA a `index.html`.

## 4. Configurar CORS y URL pública

En Render actualiza `CORS_ORIGIN` y `FRONTEND_URL` con la URL final de Netlify (sin `/` al final) y guarda para reiniciar el servicio.

## 5. Verificación rápida

1. Ingresa a la URL de Netlify e inicia sesión.
2. Recarga una ruta interna (por ejemplo `/solicitudes`) para confirmar la redirección SPA.
3. Prueba la descarga/envío de certificados y el flujo de **¿Olvidaste tu contraseña?**.
4. Cambia las contraseñas de las cuentas de demostración antes de compartir el enlace.
