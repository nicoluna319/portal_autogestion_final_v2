const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { verificarConexion } = require("./config/db");
const usuariosRoutes = require("./routes/usuariosRoutes");
const empleadosRoutes = require("./routes/empleadosRoutes");
const solicitudesRoutes = require("./routes/solicitudesRoutes");
const certificadosRoutes = require("./routes/certificadosRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const origenesPermitidos = (process.env.CORS_ORIGIN || "http://localhost:4200")
  .split(",")
  .map((o) => o.trim());

app.use(cors({ origin: origenesPermitidos, exposedHeaders: ["Content-Disposition"] }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
  res.json({ mensaje: "API del Portal de Autogestión" });
});

app.use("/api/login", authRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/empleados", empleadosRoutes);
app.use("/api/solicitudes", solicitudesRoutes);
app.use("/api/certificados", certificadosRoutes);

app.use((req, res) => {
  res.status(404).json({ mensaje: "Recurso no encontrado" });
});

app.use((err, req, res, next) => {
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ mensaje: err.message });
  }
  if (err.name === "MulterError") {
    return res.status(400).json({ mensaje: "Archivo inválido o demasiado grande (máximo 10 MB)" });
  }
  console.error("Error no controlado:", err.message);
  return res.status(500).json({ mensaje: "Error interno del servidor" });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor Express corriendo en http://localhost:${PORT}`);
    verificarConexion();
  });
}

module.exports = app;
