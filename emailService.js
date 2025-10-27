// Tienda/server/emailService.js
const nodemailer = require("nodemailer");
const path = require("path"); // <-- 1. IMPORTA 'PATH'

// 1. Configura el "transportador" (sin cambios)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_PORT == 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 2. Crea la función para enviar el correo (MODIFICADA)
async function sendOrderConfirmation(customerEmail, order, pdfBuffer) {
  try {
    const mailOptions = {
      // 2. CAMBIA "Tu Tienda" POR "ClassyShop"
      from: `"ClassyShop" <${process.env.EMAIL_FROM}>`,
      to: customerEmail,
      subject: `Confirmación de tu pedido #${order.id}`,

      // 3. ACTUALIZA EL HTML PARA INCLUIR LA IMAGEN
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
          <img src="cid:logo" alt="ClassyShop Logo" style="max-width: 150px; margin: 0 auto 20px auto; display: block;" />
          <h1 style="color: #333; text-align: center;">¡Gracias por tu compra!</h1>
          <p style="color: #555;">Hola ${order.customer_details.name},</p>
          <p style="color: #555;">Hemos recibido tu pedido #${
            order.id
          }. Adjuntamos la confirmación detallada en PDF.</p>
          <p style="font-size: 18px; font-weight: bold; text-align: center; background: #f4f4f4; padding: 10px; border-radius: 4px;">Total Pagado: S/.${Number(
            order.total
          ).toFixed(2)}</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">&copy; ${new Date().getFullYear()} ClassyShop. Todos los derechos reservados.</p>
        </div>
      `,

      // 4. ACTUALIZA LOS ADJUNTOS (AHORA SON 2)
      attachments: [
        {
          // El PDF
          filename: `pedido_${order.id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
        {
          // El Logo
          filename: "logo.jpg",
          // 5. Usa 'path' para encontrar la imagen en tu servidor
          path: path.resolve(__dirname, "assets/logo.jpg"),
          cid: "logo", // <-- Este es el ID que usa el tag <img> en el HTML
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`Correo de confirmación enviado a ${customerEmail}`);
  } catch (error) {
    console.error(`Error al enviar correo a ${customerEmail}:`, error);
  }
}

module.exports = { sendOrderConfirmation };
