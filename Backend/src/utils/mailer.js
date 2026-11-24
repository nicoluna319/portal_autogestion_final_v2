// Envío real de correo con Nodemailer (SMTP). Se configura en el archivo .env.
const fs = require("fs");
const nodemailer = require("nodemailer");

function crearTransporte() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) {
    const error = new Error("SMTP no configurado");
    error.code = "SMTP_NO_CONFIGURADO";
    throw error;
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE).toLowerCase() === "true", // true solo para el puerto 465
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

// Si MAILTRAP_API_TOKEN existe se usa la API HTTP de Mailtrap (entrega real, con dominio verificado);
// si no, se cae al SMTP de siempre. attachments: [{ filename, path }].
async function enviar({ to, subject, text, html, attachments = [] }) {
  const { MAILTRAP_API_TOKEN, MAILTRAP_FROM_EMAIL, MAILTRAP_FROM_NAME } = process.env;
  if (!MAILTRAP_API_TOKEN) {
    return crearTransporte().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
      attachments,
    });
  }
  if (!MAILTRAP_FROM_EMAIL) {
    const error = new Error("MAILTRAP_FROM_EMAIL no configurado");
    error.code = "SMTP_NO_CONFIGURADO";
    throw error;
  }
  const respuesta = await fetch("https://send.api.mailtrap.io/api/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${MAILTRAP_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: { email: MAILTRAP_FROM_EMAIL, name: MAILTRAP_FROM_NAME || "Portal de Autogestión" },
      to: [{ email: to }],
      subject,
      text,
      html,
      category: "Portal Autogestion",
      attachments: await Promise.all(
        attachments.map(async (a) => ({
          filename: a.filename,
          content: (await fs.promises.readFile(a.path)).toString("base64"),
          disposition: "attachment",
        }))
      ),
    }),
  });
  if (!respuesta.ok) throw new Error(`Mailtrap API ${respuesta.status}: ${await respuesta.text()}`);
}

async function enviarCertificado({ para, nombre, consecutivo, rutaPdf, nombreArchivo }) {
  await enviar({
    to: para,
    subject: `Certificación laboral N.° ${consecutivo} - Portal de Autogestión`,
    text:
      `Hola ${nombre},\n\nAdjunto encontrarás tu certificación laboral N.° ${consecutivo}, ` +
      "generada desde el Portal de Autogestión.\n\nPortal de Autogestión",
    attachments: [{ filename: nombreArchivo, path: rutaPdf }],
  });
}

async function enviarRecuperacionContrasena({ para, nombre, enlace, minutos = 30 }) {
  const saludo = nombre ? `Hola ${nombre}` : "Hola";
  await enviar({
    to: para,
    subject: "Restablece tu contraseña - Portal de Autogestión",
    text:
      `${saludo},\n\n` +
      "Recibimos una solicitud para restablecer la contraseña de tu cuenta en el Portal de Autogestión.\n\n" +
      `Abre el siguiente enlace para elegir una nueva contraseña (válido por ${minutos} minutos):\n` +
      `${enlace}\n\n` +
      "Si no solicitaste este cambio, puedes ignorar este correo de forma segura.\n\n" +
      "Portal de Autogestión",
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #d8e1fa;border-radius:14px;overflow:hidden;color:#1a1f2e;">
        <div style="background:#0A2266;padding:24px 28px;border-bottom:4px solid #EF9F27;">
          <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#EF9F27;font-weight:700;">Portal de Autogestión</p>
          <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;">Restablecimiento de contraseña</h1>
        </div>
        <div style="padding:28px;background:#ffffff;">
          <p style="margin:0 0 14px;font-size:15px;">${saludo},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4A5675;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón de abajo para definir una nueva contraseña:
          </p>
          <p style="margin:0 0 22px;text-align:center;">
            <a href="${enlace}" style="display:inline-block;background:#0F2F80;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:10px;">
              Restablecer contraseña
            </a>
          </p>
          <p style="margin:0 0 12px;font-size:12px;color:#4A5675;">
            Este enlace vencerá en <strong>${minutos} minutos</strong> y solo puede utilizarse una vez.
          </p>
          <p style="margin:0 0 12px;font-size:12px;color:#4A5675;word-break:break-all;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
            <a href="${enlace}" style="color:#0F2F80;">${enlace}</a>
          </p>
          <p style="margin:18px 0 0;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:14px;">
            Si no realizaste esta solicitud, puedes ignorar este mensaje; tu contraseña actual seguirá intacta.
          </p>
        </div>
      </div>
    `,
  });
}

module.exports = { enviarCertificado, enviarRecuperacionContrasena };
