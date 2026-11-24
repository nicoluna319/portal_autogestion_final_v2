-- ============================================================
--  Portal de Autogestión — Migración v6 (Lógica de negocio)
--  Ejecutar UNA sola vez sobre una base portal_acegrasco ya existente
--  (phpMyAdmin > base portal_acegrasco > pestaña SQL > pegar y ejecutar).
--  Si creas la base desde cero con portal_acegrasco.sql o portal_acegrasco_nube.sql,
--  no necesitas ejecutar esta migración.
-- ============================================================

-- 1. Clasificación de estados por entidad (usuario vs solicitud)
ALTER TABLE estados
  ADD COLUMN entidad VARCHAR(20) NOT NULL DEFAULT 'general' AFTER nombre_estado;

UPDATE estados SET entidad = 'usuario'   WHERE id_estado IN (1, 2);
UPDATE estados SET entidad = 'solicitud' WHERE id_estado IN (3, 4, 5, 6);

-- 2. Cambio obligatorio de contraseña tras carga masiva + saneamiento de datos semilla
ALTER TABLE usuarios
  ADD COLUMN debe_cambiar_contrasena TINYINT(1) NOT NULL DEFAULT 0 AFTER ultimo_acceso;

-- Si Gennifer (dato semilla id_usuario=2) tenía primer_apellido NULL, se normaliza sin cambiar su nombre completo.
UPDATE usuarios
   SET primer_nombre = 'Gennifer', segundo_nombre = NULL, primer_apellido = 'Silvana'
 WHERE id_usuario = 2 AND primer_apellido IS NULL AND nombre = 'Gennifer Silvana';

-- 3. Unicidad 1:1 usuario-empleado y soporte de retiro lógico
ALTER TABLE empleados
  ADD UNIQUE KEY uq_empleados_usuario (id_usuario),
  ADD COLUMN fecha_retiro DATE NULL AFTER promedio_horas_extras;

-- 4. Auditoría y código de verificación en certificados + corrección de dato semilla
ALTER TABLE certificados
  ADD COLUMN generado_por        INT(11)     NULL AFTER archivo_pdf,
  ADD COLUMN codigo_verificacion VARCHAR(36) NULL AFTER generado_por,
  ADD UNIQUE KEY uq_certificados_codigo (codigo_verificacion),
  ADD CONSTRAINT fk_cert_generado_por FOREIGN KEY (generado_por) REFERENCES usuarios (id_usuario);

UPDATE certificados SET incluye_sueldo = 1 WHERE id_tipo IN (1, 3) AND incluye_sueldo = 0;

-- 5. Fechas estructuradas opcionales en solicitudes
ALTER TABLE solicitudes
  ADD COLUMN fecha_inicio DATE NULL AFTER descripcion,
  ADD COLUMN fecha_fin    DATE NULL AFTER fecha_inicio;

-- 6. Vistas corregidas (v_solicitudes_detalle sin filas duplicadas cuando hay múltiples respuestas)
CREATE OR REPLACE VIEW v_solicitudes_detalle AS
SELECT
    s.id_solicitud,
    u.nombre        AS empleado,
    e.cargo,
    e.area,
    s.tipo_solicitud,
    s.descripcion,
    s.fecha_inicio,
    s.fecha_fin,
    es.nombre_estado AS estado,
    s.fecha_creacion,
    r.mensaje       AS respuesta,
    r.fecha_respuesta
FROM solicitudes s
         JOIN empleados e  ON e.id_empleado = s.id_empleado
         JOIN usuarios  u  ON u.id_usuario  = e.id_usuario
         JOIN estados   es ON es.id_estado  = s.id_estado
         LEFT JOIN respuestas r ON r.id_respuesta = (
             SELECT r2.id_respuesta
             FROM respuestas r2
             WHERE r2.id_solicitud = s.id_solicitud
             ORDER BY r2.fecha_respuesta DESC, r2.id_respuesta DESC
             LIMIT 1
         );

CREATE OR REPLACE VIEW v_certificados_detalle AS
SELECT
    c.consecutivo,
    c.codigo_verificacion,
    u.nombre        AS empleado,
    e.cargo,
    e.area,
    tc.nombre_tipo  AS tipo_certificado,
    c.incluye_sueldo,
    c.canal_entrega,
    c.archivo_pdf,
    ug.nombre       AS generado_por,
    c.fecha_generacion
FROM certificados c
         JOIN empleados         e  ON e.id_empleado = c.id_empleado
         JOIN usuarios          u  ON u.id_usuario  = e.id_usuario
         JOIN tipo_certificados tc ON tc.id_tipo    = c.id_tipo
         LEFT JOIN usuarios     ug ON ug.id_usuario = c.generado_por;
