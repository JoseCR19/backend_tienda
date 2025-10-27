const PDFDocument = require("pdfkit");

function generateHeader(doc) {
  doc
    .fillColor("#000")
    .fontSize(20)
    .font("Helvetica-Bold")
    .text("ClassyShop", 50, 50, { align: "left" })
    .font("Helvetica")
    .fontSize(10)
    .text("Factura de Pedido", 50, 75, { align: "left" })
    .text(`Fecha: ${new Date().toLocaleDateString()}`, 0, 75, {
      align: "right",
    });

  doc.moveDown(2);
  doc
    .strokeColor("#ccc")
    .lineWidth(1)
    .moveTo(50, 110)
    .lineTo(550, 110)
    .stroke();
}

function generateCustomerInformation(doc, order) {
  const customer = order.customer_details || {};

  doc
    .fillColor("#444")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Facturado a:", 50, 130);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(customer.name || "Cliente", 50, 150)
    .text(customer.email || "-")
    .text(customer.address || "-");

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Pedido:", 400, 130)
    .font("Helvetica")
    .fontSize(10)
    .text(`Orden #${order.id}`, 400, 150)
    .text(`Fecha: ${new Date(order.order_date).toLocaleDateString()}`);

  const normalizedType = String(
    order.type_payment || customer.paymentMethod || ""
  )
    .trim()
    .toLowerCase();

  let paymentText = "Metodo de Pago: ";

  switch (normalizedType) {
    case "card":
      paymentText += "Tarjeta";
      break;
    case "yape":
      paymentText += "Yape";
      if (customer.yapePhone) {
        paymentText += ` (${customer.yapePhone})`;
      }
      break;
    case "pagoefectivo":
      paymentText += "PagoEfectivo";
      if (customer.pagoBranch) {
        let branchName = "Punto: ";
        if (customer.pagoBranch === "bcp") branchName += "BCP";
        else if (customer.pagoBranch === "agente_pe") branchName += "Agente PE";
        else if (customer.pagoBranch === "tienda") branchName += "Tienda";
        else branchName += customer.pagoBranch;
        paymentText += ` (${branchName})`;
      }
      break;
    case "cash":
      paymentText += "Efectivo";
      break;
    default:
      paymentText += normalizedType || "No especificado";
      break;
  }

  doc.font("Helvetica").fontSize(10).text(paymentText);
  doc.moveDown(3);
}

function generateInvoiceTable(doc, order) {
  let tableTop = 230;
  const itemTopMargin = 20;

  doc.fontSize(12).font("Helvetica-Bold").fillColor("#000");
  doc.text("Producto", 50, tableTop, { width: 250 });
  doc.text("Cant.", 300, tableTop, { width: 50 });
  doc.text("Precio Unit.", 350, tableTop, { width: 100, align: "right" });
  doc.text("Total", 450, tableTop, { width: 100, align: "right" });

  doc
    .strokeColor("#ccc")
    .lineWidth(1)
    .moveTo(50, tableTop + itemTopMargin)
    .lineTo(550, tableTop + itemTopMargin)
    .stroke();

  doc.font("Helvetica").fontSize(10).fillColor("#444");

  let y = tableTop + itemTopMargin + 10;
  (order.items || []).forEach((item) => {
    doc.text(item.title || "Producto", 50, y, { width: 250 });
    doc.text(item.quantity ?? 0, 300, y, { width: 50 });
    doc.text(`S/.${Number(item.price || 0).toFixed(2)}`, 350, y, {
      width: 100,
      align: "right",
    });
    const totalItem = Number(item.quantity || 0) * Number(item.price || 0);
    doc.text(`S/.${totalItem.toFixed(2)}`, 450, y, {
      width: 100,
      align: "right",
    });
    y += 30;
  });

  doc.strokeColor("#ccc").lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#000")
    .text(`Total Pagado: S/.${Number(order.total || 0).toFixed(2)}`, 50, y + 20, {
      align: "right",
      width: 500,
    });

  doc
    .font("Helvetica-Oblique")
    .fontSize(10)
    .fillColor("#888")
    .text("Gracias por tu compra en ClassyShop!", 50, y + 60, {
      align: "center",
      width: 500,
    });
}

function generateInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      generateHeader(doc);
      generateCustomerInformation(doc, order);
      generateInvoiceTable(doc, order);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateInvoicePdf };
