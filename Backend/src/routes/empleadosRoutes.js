const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const empleadosController = require("../controllers/empleadosController");
const { autenticar, soloAdmin } = require("../utils/auth");

const CARPETA_TEMP = path.join(__dirname, "..", "..", "temp");
if (!fs.existsSync(CARPETA_TEMP)) {
  fs.mkdirSync(CARPETA_TEMP, { recursive: true });
}

const almacenamiento = multer.diskStorage({
  destination: CARPETA_TEMP,
  filename: (req, file, cb) => cb(null, `carga_${Date.now()}_${path.basename(file.originalname)}`),
});

const upload = multer({
  storage: almacenamiento,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx|xls|csv)$/i.test(file.originalname)) return cb(null, true);
    const error = new Error("Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)");
    error.status = 400;
    return cb(error);
  },
});

router.use(autenticar);

router.get("/", empleadosController.listarOConsultar);
router.get("/plantilla", soloAdmin, empleadosController.descargarPlantilla);
router.post("/", soloAdmin, empleadosController.crear);
router.put("/", soloAdmin, empleadosController.actualizar);
router.patch("/estado", soloAdmin, empleadosController.cambiarEstado);
router.delete("/", soloAdmin, empleadosController.eliminar);
router.post("/carga-masiva", soloAdmin, upload.single("archivo"), empleadosController.cargaMasiva);

module.exports = router;
