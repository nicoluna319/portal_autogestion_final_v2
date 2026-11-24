const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { autenticar } = require("../utils/auth");

router.post("/", authController.login);
router.put("/contrasena", autenticar, authController.cambiarContrasena);
router.post("/olvide-contrasena", authController.solicitarRecuperacion);
router.get("/validar-token-recuperacion", authController.validarTokenRecuperacion);
router.post("/restablecer-contrasena", authController.restablecerContrasena);

module.exports = router;
