-- Migración v6: tabla de recuperación de contraseña por correo electrónico.
-- Ejecutar una vez en phpMyAdmin o consola MySQL (también se crea automáticamente al iniciar uso si no existe).

USE portal_acegrasco;

CREATE TABLE IF NOT EXISTS recuperacion_contrasena (
  id_recuperacion INT(11)     NOT NULL AUTO_INCREMENT,
  id_usuario      INT(11)     NOT NULL,
  token_hash      CHAR(64)    NOT NULL,
  expira_en       DATETIME    NOT NULL,
  usado           TINYINT(1)  NOT NULL DEFAULT 0,
  creado_en       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_recuperacion),
  UNIQUE KEY uq_recuperacion_token (token_hash),
  KEY idx_recuperacion_usuario (id_usuario),
  CONSTRAINT fk_recuperacion_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
