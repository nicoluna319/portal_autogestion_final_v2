require("dotenv").config();
const mysql = require("mysql2/promise");

let ssl;
if (String(process.env.DB_SSL).toLowerCase() === "true") {
  ssl = {
    minVersion: "TLSv1.2",
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
  };
  if (process.env.DB_SSL_CA) {
    ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, "\n");
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "portal_acegrasco",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl,
});

async function verificarConexion() {
  try {
    const conn = await pool.getConnection();
    console.log(`Conexión a MySQL (${process.env.DB_NAME || "portal_acegrasco"}) establecida correctamente.`);
    conn.release();
  } catch (error) {
    console.error("Error al conectar con la base de datos MySQL:", error.message);
  }
}

module.exports = { pool, verificarConexion };
