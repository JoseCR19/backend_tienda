
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yaml");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { generateInvoicePdf } = require("./pdfService");
const { sendOrderConfirmation } = require("./emailService");

const parseOrigins = (value = "") =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const rawCorsOrigins =
  process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:4000";
const allowedOrigins = parseOrigins(rawCorsOrigins);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      console.warn(`CORS bloqueado para origen: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";

if (!JWT_SECRET) {
  console.warn(
    "JWT_SECRET no esta definido. Configura la variable de entorno para firmar tokens de manera segura."
  );
}

if (!ADMIN_TOKEN) {
  console.warn(
    "ADMIN_TOKEN no esta definido. Configura la variable de entorno para proteger las rutas administrativas."
  );
}

const swaggerSpecPath = path.join(__dirname, "docs", "openapi.yaml");
let swaggerDocument;

try {
  const swaggerFile = fs.readFileSync(swaggerSpecPath, "utf8");
  swaggerDocument = YAML.parse(swaggerFile);
} catch (error) {
  console.error("No se pudo cargar la especificacion OpenAPI:", error.message);
  swaggerDocument = {
    openapi: "3.0.3",
    info: {
      title: "ClassyShop API",
      version: "1.0.0",
      description:
        "Documentacion temporal generica. Verifica el archivo docs/openapi.yaml.",
    },
  };
}

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, { explorer: true })
);

app.get("/docs-json", (req, res) => {
  res.json(swaggerDocument);
});

const isBcryptHash = (value) =>
  typeof value === "string" && /^\$2[aby]\$[0-9]{2}\$/.test(value);

const hashPassword = async (plainPassword) => {
  const normalized = plainPassword ?? "";
  if (!normalized) {
    return "";
  }

  if (isBcryptHash(normalized)) {
    return normalized;
  }

  return bcrypt.hash(normalized, 10);
};

const sanitizeUser = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    lastname: row.lastname,
    email: row.email,
    cellphone: row.cellphone,
    terms: row.terms,
  };
};

const slugify = (value) => {
  if (typeof value !== "string") return "";
  const from = "ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç";
  const to =   "AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc";
  const map = {};
  for (let i = 0; i < from.length; i++) map[from[i]] = to[i];
  const replaced = value
    .split("")
    .map((ch) => map[ch] || ch)
    .join("");
  return replaced
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
};

const ensureStringArray = (val) => {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) {
    return val
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter(Boolean);
      }
    } catch (_) {
      // treat as comma-separated
    }
    return val
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

const ensureBigIntArray = (val) => {
  if (val === undefined || val === null) return [];
  const arr = Array.isArray(val) ? val : (() => {
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {
        // fallthrough
      }
      return val.split(",");
    }
    return [val];
  })();

  return arr
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
};

const mapProductRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    slug: row.slug,
    id: row.id,
    name: row.name,
    brand: row.brand ?? null,
    description: row.description ?? null,
    picture: row.picture ?? null,
    price: Number(row.price),
    money: row.money,
    stock: row.stock,
    new: row.new,
    badge: row.badge ?? {},
    segments: row.segments ?? [],
    features: row.features ?? [],
    related_ids: row.related_ids ?? [],
    id_category: row.id_category,
    category: row.category_name
      ? { id: row.id_category, name: row.category_name }
      : null,
  };
};

const createHttpError = (status, message, extra = {}) => {
  const error = new Error(message);
  error.httpStatus = status;
  return Object.assign(error, extra);
};

const extractAdminToken = (req) => {
  const headerToken = req.headers["x-admin-token"];
  if (headerToken) {
    return headerToken;
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Admin ")) {
    return authHeader.slice(6).trim();
  }

  return null;
};

const isPublicRoute = (req) => {
  if (req.method === "POST" && req.path === "/users") {
    return true;
  }

  return false;
};

const authenticate = (req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (req.method === "POST" && ["/users", "/api/users"].includes(req.path)) {
    return next();
  }

  const adminToken = extractAdminToken(req);
  if (ADMIN_TOKEN && adminToken === ADMIN_TOKEN) {
    req.isAdmin = true;
    return next();
  }

  if (isPublicRoute(req)) {
    return next();
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = {
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
      lastname: payload.lastname,
    };
    req.isAdmin = false;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token invalido" });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.isAdmin) {
    return next();
  }
  return res.status(401).json({ message: "Token de administrador requerido" });
};

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail || typeof password !== "string" || !password.trim()) {
      return res.status(400).json({ message: "Credenciales incompletas" });
    }

    const result = await pool.query(
      `SELECT id, name, lastname, email, cellphone, terms, password
         FROM "user"
        WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    const userRow = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, userRow.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Credenciales invalidas" });
    }

    if (!JWT_SECRET) {
      return res
        .status(500)
        .json({ message: "Configuracion de JWT no disponible" });
    }

    const tokenPayload = {
      userId: userRow.id,
      email: userRow.email,
      name: userRow.name,
      lastname: userRow.lastname,
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.status(200).json({
      token,
      user: sanitizeUser(userRow),
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error al iniciar sesion" });
  }
});

app.use("/api", authenticate);

app.post("/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    res.sendStatus(204);
  } catch (error) {
    res.status(401).json({ message: "Token invalido" });
  }
});

const parseIdParam = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id) || id <= 0) {
    return null;
  }

  return id;
};

const coerceBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return Boolean(value);
};

const normalizeOrderRow = (row) => {
  if (!row) {
    return row;
  }

  const normalized = { ...row };

  if (typeof normalized.customer_details === "string") {
    try {
      normalized.customer_details = JSON.parse(normalized.customer_details);
    } catch {
      normalized.customer_details = null;
    }
  }

  if (typeof normalized.items === "string") {
    try {
      normalized.items = JSON.parse(normalized.items);
    } catch {
      normalized.items = [];
    }
  }

  if (
    normalized.customer_details &&
    normalized.type_payment &&
    !normalized.customer_details.paymentMethod
  ) {
    normalized.customer_details.paymentMethod = normalized.type_payment;
  }

  return normalized;
};

const mapOrderRow = (row) => {
  const normalized = normalizeOrderRow(row);

  if (!normalized) {
    return normalized;
  }

  if (row && (row.user_name || row.user_lastname || row.user_email)) {
    normalized.user = {
      id: normalized.id_user,
      name: row.user_name,
      lastname: row.user_lastname,
      email: row.user_email,
    };
  }

  delete normalized.user_name;
  delete normalized.user_lastname;
  delete normalized.user_email;

  return normalized;
};
const handleOrderCreation = async (req, res, options = {}) => {
  const { forceUserId = null, enforceSameUser = false } = options;

  let savedOrder;
  let client;

  const correlationId =
    req.headers["x-correlation-id"] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const logPrefix = `[ORDERS:${correlationId}]`;

  console.info(`${logPrefix} Inicio creacion de orden`, {
    path: req.originalUrl,
    method: req.method,
    forceUserId,
    enforceSameUser,
  });

  try {
    const {
      userId: bodyUserId,
      id_user: bodyIdUser,
      customer,
      customer_details: customerDetailsBody,
      items,
      total,
      paymentType,
      type_payment: bodyTypePayment,
    } = req.body;

    const tokenUserId = parseIdParam(req.auth?.userId);
    const forcedUserId = forceUserId !== undefined && forceUserId !== null
      ? parseIdParam(forceUserId)
      : null;

    console.info(`${logPrefix} Payload recibido`, {
      tokenUserId,
      bodyUserId,
      forcedUserId,
      itemsCount: Array.isArray(items) ? items.length : 0,
      paymentType,
      total,
    });

    if (enforceSameUser && !tokenUserId) {
      console.warn(`${logPrefix} Usuario autenticado requerido para endpoint /me`);
      return res
        .status(401)
        .json({ message: "Token de usuario requerido para crear ordenes" });
    }

    if (!req.isAdmin && !tokenUserId && !forcedUserId) {
      console.warn(`${logPrefix} Solicitud sin credenciales validas`);
      return res
        .status(401)
        .json({ message: "Token de usuario requerido para crear ordenes" });
    }

    let idUser = forcedUserId;
    if (!idUser) {
      idUser = parseIdParam(bodyUserId ?? bodyIdUser);
    }
    if (!idUser && tokenUserId) {
      idUser = tokenUserId;
    }

    if (!idUser) {
      console.warn(`${logPrefix} No se pudo determinar id_user`, {
        bodyUserId,
        tokenUserId,
        forcedUserId,
      });
      return res.status(400).json({ message: "id_user es requerido" });
    }

    if (
      (enforceSameUser || !req.isAdmin) &&
      tokenUserId &&
      idUser !== tokenUserId
    ) {
      console.warn(`${logPrefix} Intento de crear orden para otro usuario`, {
        tokenUserId,
        targetUserId: idUser,
      });
      return res
        .status(403)
        .json({ message: "No puedes crear ordenes para otros usuarios" });
    }

    const customerDetails = customerDetailsBody || customer;
    if (
      !customerDetails ||
      !customerDetails.name ||
      !customerDetails.email
    ) {
      console.warn(`${logPrefix} Datos del cliente incompletos`, {
        customerDetails,
      });
      return res
        .status(400)
        .json({ message: "Datos del cliente incompletos" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.warn(`${logPrefix} La orden no contiene items`);
      return res
        .status(400)
        .json({ message: "La orden debe incluir productos" });
    }

    const parsedTotal =
      total === undefined || total === null ? null : Number(total);
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      console.warn(`${logPrefix} Total invalido`, { total });
      return res
        .status(400)
        .json({ message: "El total debe ser un numero positivo" });
    }

    const typePayment =
      paymentType || bodyTypePayment || customerDetails.paymentMethod;
    if (!typePayment) {
      console.warn(`${logPrefix} Metodo de pago faltante`, {
        paymentType,
        bodyTypePayment,
        customerDetails,
      });
      return res
        .status(400)
        .json({ message: "type_payment es requerido" });
    }

    const customerPayload = {
      ...customerDetails,
      paymentMethod: customerDetails.paymentMethod || typePayment,
    };

    const normalizedItems = items.map((item, index) => {
      const quantityValue =
        item?.quantity ?? item?.qty ?? item?.cantidad ?? null;
      const quantity = Number.parseInt(quantityValue, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        console.warn(`${logPrefix} Item con cantidad invalida`, {
          index,
          item,
        });
        throw createHttpError(400, `quantity invalido en item ${index + 1}`, {
          details: { index: index + 1 },
        });
      }

      const productIdCandidate =
        item?.productId ?? item?.product_id ?? item?.id ?? item?.product;
      const productId = parseIdParam(productIdCandidate);
      if (!productId) {
        console.warn(`${logPrefix} Item sin productId`, { index, item });
        throw createHttpError(
          400,
          `productId es requerido en item ${index + 1}`,
          { details: { index: index + 1 } }
        );
      }

      const normalizedItem = {
        ...item,
        productId,
        quantity,
      };

      if (!("id" in normalizedItem)) {
        normalizedItem.id = productId;
      }

      return normalizedItem;
    });

    const productQuantities = new Map();
    for (const item of normalizedItems) {
      productQuantities.set(
        item.productId,
        (productQuantities.get(item.productId) || 0) + item.quantity
      );
    }

    console.info(`${logPrefix} Validando inventario`, {
      productQuantities: Array.from(productQuantities.entries()),
    });

    let customerJson;
    let itemsJson;
    try {
      customerJson = JSON.stringify(customerPayload);
      itemsJson = JSON.stringify(normalizedItems);
    } catch (serializationError) {
      console.error(
        `${logPrefix} Error al serializar payload a JSON`,
        serializationError
      );
      return res.status(400).json({
        message: "No se pudo serializar la orden",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    console.info(`${logPrefix} Transaccion iniciada`);

    for (const [productId, requestedQuantity] of productQuantities.entries()) {
      const productResult = await client.query(
        `SELECT id, stock, name FROM product WHERE id = $1 FOR UPDATE`,
        [productId]
      );

      if (productResult.rowCount === 0) {
        console.warn(`${logPrefix} Producto no existe`, { productId });
        throw createHttpError(404, `Producto ${productId} no existe`, {
          details: { productId },
        });
      }

      const productRow = productResult.rows[0];
      if (productRow.stock < requestedQuantity) {
        console.warn(`${logPrefix} Stock insuficiente`, {
          productId,
          requested: requestedQuantity,
          available: productRow.stock,
        });
        throw createHttpError(
          409,
          `Stock insuficiente para ${productRow.name}`,
          {
            details: {
              productId,
              requested: requestedQuantity,
              available: productRow.stock,
            },
          }
        );
      }

      await client.query(
        `UPDATE product SET stock = stock - $1 WHERE id = $2`,
        [requestedQuantity, productId]
      );
    }

    console.info(`${logPrefix} Inventario reservado`);

    const orderResult = await client.query(
      `INSERT INTO "order" (id_user, customer_details, items, total, type_payment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, id_user, order_date, customer_details, items, total, type_payment`,
      [idUser, customerJson, itemsJson, parsedTotal, typePayment]
    );

    await client.query("COMMIT");
    console.info(`${logPrefix} Orden persistida`, {
      orderId: orderResult.rows[0]?.id,
      idUser,
    });

    savedOrder = normalizeOrderRow(orderResult.rows[0]);
    savedOrder.items = normalizedItems;

    console.info(`${logPrefix} Orden procesada correctamente`, {
      orderId: savedOrder.id,
      userId: savedOrder.id_user,
      items: savedOrder.items?.length ?? 0,
      total: savedOrder.total,
    });

    res.status(201).json(savedOrder);
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
        console.warn(`${logPrefix} Transaccion revertida`);
      } catch (rollbackError) {
        console.error(
          "Error al revertir la transaccion de orden:",
          rollbackError
        );
      }
    }

    if (error.httpStatus) {
      console.warn(`${logPrefix} Error controlado`, {
        status: error.httpStatus,
        message: error.message,
        details: error.details,
      });
      return res
        .status(error.httpStatus)
        .json({
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
    }

    if (error.code === "23503") {
      console.warn(`${logPrefix} Usuario asociado no existe`, {
        bodyUserId,
        tokenUserId,
        forcedUserId,
      });
      return res
        .status(409)
        .json({ message: "El usuario asociado no existe" });
    }

    console.error(`${logPrefix} Error inesperado al crear la orden`, error);
    return res.status(500).json({ message: "Error al crear la orden" });
  } finally {
    if (client) {
      client.release();
    }
  }

  try {
    if (savedOrder && savedOrder.customer_details?.email) {
      console.info(`${logPrefix} Generando PDF para orden #${savedOrder.id}`);
      const pdfBuffer = await generateInvoicePdf(savedOrder);

      console.info(`${logPrefix} Enviando email para orden #${savedOrder.id}`);
      await sendOrderConfirmation(
        savedOrder.customer_details.email,
        savedOrder,
        pdfBuffer
      );
    }
  } catch (emailError) {
    console.error(
      `${logPrefix} Error en el proceso de email/PDF para orden #${savedOrder?.id}`,
      emailError
    );
  }
};

app.post("/api/orders", async (req, res) => {
  await handleOrderCreation(req, res);
});

app.post("/api/orders/me", async (req, res) => {
  await handleOrderCreation(req, res, {
    forceUserId: req.auth?.userId,
    enforceSameUser: true,
  });
});

app.get("/api/orders", async (req, res) => {
  if (req.isAdmin) {
    return res
      .status(403)
      .json({ message: "Solo disponible para usuarios autenticados" });
  }

  const userId = req.auth?.userId;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Token de usuario requerido" });
  }

  try {
    const result = await pool.query(
      `SELECT
         o.id,
         o.id_user,
         o.order_date,
         o.customer_details,
         o.items,
         o.total,
         o.type_payment,
         u.name AS user_name,
         u.lastname AS user_lastname,
         u.email AS user_email
       FROM "order" o
       JOIN "user" u ON u.id = o.id_user
       WHERE o.id_user = $1
       ORDER BY o.order_date DESC`,
      [userId]
    );

    const orders = result.rows.map(mapOrderRow);
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error al obtener las ordenes:", error);
    res.status(500).json({ message: "Error al obtener las ordenes" });
  }
});

app.get("/api/orders/me", async (req, res) => {
  const userId = req.auth?.userId;
  const logPrefix = `[ORDERS-ME:${userId ?? "anon"}]`;

  console.info(`${logPrefix} Consulta de compras iniciada`);

  if (!userId) {
    console.warn(`${logPrefix} Solicitud sin token valido`);
    return res.status(401).json({ message: "Token de usuario requerido" });
  }

  try {
    const result = await pool.query(
      `SELECT
         o.id,
         o.id_user,
         o.order_date,
         o.customer_details,
         o.items,
         o.total,
         o.type_payment
       FROM "order" o
       WHERE o.id_user = $1
       ORDER BY o.order_date DESC`,
      [userId]
    );

    const purchases = result.rows.map(normalizeOrderRow);
    console.info(`${logPrefix} Consulta completada`, {
      count: purchases.length,
    });
    res.status(200).json(purchases);
  } catch (error) {
    console.error(`${logPrefix} Error al obtener compras`, error);
    res.status(500).json({ message: "Error al obtener tus compras" });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  const orderId = parseIdParam(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: "ID de orden invalido" });
  }

  const userId = req.auth?.userId;
  if (!req.isAdmin && !userId) {
    return res
      .status(401)
      .json({ message: "Token de usuario requerido" });
  }

  try {
    const query = req.isAdmin
      ? `SELECT
         o.id,
         o.id_user,
         o.order_date,
         o.customer_details,
         o.items,
         o.total,
         o.type_payment,
         u.name AS user_name,
         u.lastname AS user_lastname,
         u.email AS user_email
       FROM "order" o
       JOIN "user" u ON u.id = o.id_user
       WHERE o.id = $1`
      : `SELECT
         o.id,
         o.id_user,
         o.order_date,
         o.customer_details,
         o.items,
         o.total,
         o.type_payment,
         u.name AS user_name,
         u.lastname AS user_lastname,
         u.email AS user_email
       FROM "order" o
       JOIN "user" u ON u.id = o.id_user
       WHERE o.id = $1 AND o.id_user = $2`;

    const params = req.isAdmin ? [orderId] : [orderId, userId];

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Orden no encontrada" });
    }

    res.status(200).json(mapOrderRow(result.rows[0]));
  } catch (error) {
    console.error("Error al obtener la orden:", error);
    res.status(500).json({ message: "Error al obtener la orden" });
  }
});

app.get("/api/users/:userId/orders", async (req, res) => {
  const userId = parseIdParam(req.params.userId);
  if (!userId) {
    return res.status(400).json({ message: "ID de usuario invalido" });
  }

  if (!req.isAdmin && userId !== req.auth?.userId) {
    return res
      .status(403)
      .json({ message: "No puedes consultar ordenes de otro usuario" });
  }

  try {
    const result = await pool.query(
      `SELECT
         o.id,
         o.id_user,
         o.order_date,
         o.customer_details,
         o.items,
         o.total,
         o.type_payment,
         u.name AS user_name,
         u.lastname AS user_lastname,
         u.email AS user_email
       FROM "order" o
       JOIN "user" u ON u.id = o.id_user
       WHERE o.id_user = $1
       ORDER BY o.order_date DESC`,
      [userId]
    );

    const orders = result.rows.map(mapOrderRow);
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error al obtener las ordenes del usuario:", error);
    res
      .status(500)
      .json({ message: "Error al obtener las ordenes del usuario" });
  }
});

app.put("/api/orders/:id", async (req, res) => {
  const orderId = parseIdParam(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: "ID de orden invalido" });
  }

  const {
    userId: bodyUserId,
    id_user: bodyIdUser,
    customer,
    customer_details: customerDetailsBody,
    items,
    total,
    paymentType,
    type_payment: bodyTypePayment,
  } = req.body;

  try {
    const existingOrder = await pool.query(
      `SELECT id_user FROM "order" WHERE id = $1`,
      [orderId]
    );

    if (existingOrder.rowCount === 0) {
      return res.status(404).json({ message: "Orden no encontrada" });
    }

    if (existingOrder.rows[0].id_user !== req.auth.userId) {
      return res
        .status(403)
        .json({ message: "No puedes modificar esta orden" });
    }

    const updates = [];
    const values = [];
    let index = 1;

    if (bodyUserId !== undefined || bodyIdUser !== undefined) {
      const newUserId = parseIdParam(bodyUserId ?? bodyIdUser);
      if (!newUserId) {
        return res
          .status(400)
          .json({ message: "id_user proporcionado es invalido" });
      }

      if (newUserId !== req.auth.userId) {
        return res
          .status(403)
          .json({ message: "No puedes reasignar la orden a otro usuario" });
      }
      updates.push(`id_user = $${index++}`);
      values.push(newUserId);
    }

    const customerDetails = customerDetailsBody || customer;
    let typePayment = paymentType ?? bodyTypePayment;

    if (customerDetails !== undefined) {
      if (
        !customerDetails ||
        !customerDetails.name ||
        !customerDetails.email
      ) {
        return res
          .status(400)
          .json({ message: "Datos del cliente incompletos" });
      }

      const finalTypePayment =
        typePayment || customerDetails.paymentMethod;
      if (!finalTypePayment) {
        return res
          .status(400)
          .json({ message: "type_payment es requerido" });
      }

      const customerPayload = {
        ...customerDetails,
        paymentMethod: customerDetails.paymentMethod || finalTypePayment,
      };

      updates.push(`customer_details = $${index++}`);
      values.push(customerPayload);

      typePayment = finalTypePayment;
    }

    if (items !== undefined) {
      if (!Array.isArray(items)) {
        return res
          .status(400)
          .json({ message: "items debe ser un arreglo" });
      }
      updates.push(`items = $${index++}`);
      values.push(items);
    }

    if (total !== undefined) {
      const parsedTotal = Number(total);
      if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
        return res
          .status(400)
          .json({ message: "total debe ser un numero positivo" });
      }
      updates.push(`total = $${index++}`);
      values.push(parsedTotal);
    }

    if (typePayment !== undefined) {
      if (!typePayment) {
        return res
          .status(400)
          .json({ message: "type_payment es requerido" });
      }
      updates.push(`type_payment = $${index++}`);
      values.push(typePayment);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: "No hay campos para actualizar" });
    }

    values.push(orderId);

    const result = await pool.query(
      `UPDATE "order"
       SET ${updates.join(", ")}
       WHERE id = $${index}
       RETURNING id, id_user, order_date, customer_details, items, total, type_payment`,
      values
    );

    res.status(200).json(normalizeOrderRow(result.rows[0]));
  } catch (error) {
    console.error("Error al actualizar la orden:", error);
    if (error.code === "23503") {
      return res
        .status(409)
        .json({ message: "El usuario asociado no existe" });
    }
    res.status(500).json({ message: "Error al actualizar la orden" });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  const orderId = parseIdParam(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: "ID de orden invalido" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM "order" WHERE id = $1 AND id_user = $2`,
      [orderId, req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Orden no encontrada" });
    }

    res.sendStatus(204);
  } catch (error) {
    console.error("Error al eliminar la orden:", error);
    res.status(500).json({ message: "Error al eliminar la orden" });
  }
});
app.get("/api/categories", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         fp.picture AS first_product_image
       FROM category c
       LEFT JOIN LATERAL (
         SELECT picture
         FROM product
         WHERE id_category = c.id
           AND stock > 0
         ORDER BY id ASC
         LIMIT 1
       ) fp ON true
       ORDER BY c.name ASC`
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error al obtener las categorias:", error);
    res.status(500).json({ message: "Error al obtener las categorias" });
  }
});

app.get("/api/categories/:id", async (req, res) => {
  const categoryId = parseIdParam(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: "ID de categoria invalido" });
  }

  try {
    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         fp.picture AS first_product_image
       FROM category c
       LEFT JOIN LATERAL (
         SELECT picture
         FROM product
         WHERE id_category = c.id
           AND stock > 0
         ORDER BY id ASC
         LIMIT 1
       ) fp ON true
       WHERE c.id = $1`,
      [categoryId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Categoria no encontrada" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error al obtener la categoria:", error);
    res.status(500).json({ message: "Error al obtener la categoria" });
  }
});

app.get("/api/categories/:id/products", async (req, res) => {
  const categoryId = parseIdParam(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: "ID de categoria invalido" });
  }

  try {
    const result = await pool.query(
      `SELECT
         p.slug,
         p.id,
         p.name,
         p.brand,
         p.description,
         p.picture,
         p.price,
         p.money,
         p.stock,
         p.new,
         p.badge,
         p.segments,
         p.features,
         p.related_ids,
         p.id_category,
         c.name AS category_name
       FROM product p
       INNER JOIN category c ON c.id = p.id_category
       WHERE p.id_category = $1
         AND p.stock > 0
       ORDER BY p.id DESC`,
      [categoryId]
    );

    res.status(200).json(result.rows.map(mapProductRow));
  } catch (error) {
    console.error(
      "Error al obtener los productos por categoria:",
      error
    );
    res.status(500).json({
      message: "Error al obtener los productos por categoria",
    });
  }
});

app.post("/api/categories", requireAdmin, async (req, res) => {
  const { name } = req.body;
  const trimmedName =
    typeof name === "string" ? name.trim() : "";

  if (!trimmedName) {
    return res.status(400).json({ message: "name es requerido" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO category (name) VALUES ($1) RETURNING id, name",
      [trimmedName]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error al crear la categoria:", error);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "Ya existe una categoria con ese nombre" });
    }
    res.status(500).json({ message: "Error al crear la categoria" });
  }
});

app.put("/api/categories/:id", requireAdmin, async (req, res) => {
  const categoryId = parseIdParam(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: "ID de categoria invalido" });
  }

  const { name } = req.body;
  const trimmedName =
    typeof name === "string" ? name.trim() : "";

  if (!trimmedName) {
    return res.status(400).json({ message: "name es requerido" });
  }

  try {
    const result = await pool.query(
      "UPDATE category SET name = $1 WHERE id = $2 RETURNING id, name",
      [trimmedName, categoryId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Categoria no encontrada" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error al actualizar la categoria:", error);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "Ya existe una categoria con ese nombre" });
    }
    res.status(500).json({ message: "Error al actualizar la categoria" });
  }
});

app.delete("/api/categories/:id", requireAdmin, async (req, res) => {
  const categoryId = parseIdParam(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: "ID de categoria invalido" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM category WHERE id = $1",
      [categoryId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Categoria no encontrada" });
    }

    res.sendStatus(204);
  } catch (error) {
    console.error("Error al eliminar la categoria:", error);
    if (error.code === "23503") {
      return res.status(409).json({
        message:
          "No se puede eliminar la categoria porque tiene productos asociados",
      });
    }
    res.status(500).json({ message: "Error al eliminar la categoria" });
  }
});

app.get("/api/users", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, lastname, email, cellphone, terms
       FROM "user"
       ORDER BY id DESC`
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error al obtener los usuarios:", error);
    res.status(500).json({ message: "Error al obtener los usuarios" });
  }
});

app.get("/api/users/:id", async (req, res) => {
  const userId = parseIdParam(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "ID de usuario invalido" });
  }

  if (!req.isAdmin && req.auth?.userId !== userId) {
    return res.status(403).json({ message: "No puedes acceder a este usuario" });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, lastname, email, cellphone, terms
       FROM "user"
       WHERE id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error al obtener el usuario:", error);
    res.status(500).json({ message: "Error al obtener el usuario" });
  }
});

app.post("/api/users", async (req, res) => {
  const {
    name,
    lastname,
    email,
    cellphone,
    password,
    terms,
  } = req.body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedLastname =
    typeof lastname === "string" ? lastname.trim() : "";
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  const trimmedPassword =
    typeof password === "string" ? password.trim() : "";
  const trimmedCellphone =
    typeof cellphone === "string" ? cellphone.trim() : null;

  if (!trimmedName || !trimmedLastname || !trimmedEmail || !trimmedPassword) {
    return res.status(400).json({
      message:
        "name, lastname, email y password son requeridos",
    });
  }

  const termsValue = terms !== undefined ? coerceBoolean(terms) : false;

  try {
    const hashedPassword = await hashPassword(trimmedPassword);

    const result = await pool.query(
      `INSERT INTO "user" (name, lastname, email, cellphone, password, terms)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, lastname, email, cellphone, terms`,
      [
        trimmedName,
        trimmedLastname,
        trimmedEmail,
        trimmedCellphone || null,
        hashedPassword,
        termsValue,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error al crear el usuario:", error);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "El email ya esta registrado" });
    }
    res.status(500).json({ message: "Error al crear el usuario" });
  }
});

app.put("/api/users/:id", async (req, res) => {
  const userId = parseIdParam(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "ID de usuario invalido" });
  }

  if (!req.isAdmin && req.auth?.userId !== userId) {
    return res
      .status(403)
      .json({ message: "No puedes modificar este usuario" });
  }

  const {
    name,
    lastname,
    email,
    cellphone,
    password,
    terms,
  } = req.body;

  try {
    const updates = [];
    const values = [];
    let index = 1;

    if (name !== undefined) {
      const trimmed =
        typeof name === "string" ? name.trim() : "";
      if (!trimmed) {
        return res.status(400).json({ message: "name no puede estar vacio" });
      }
      updates.push(`name = $${index++}`);
      values.push(trimmed);
    }

    if (lastname !== undefined) {
      const trimmed =
        typeof lastname === "string" ? lastname.trim() : "";
      if (!trimmed) {
        return res
          .status(400)
          .json({ message: "lastname no puede estar vacio" });
      }
      updates.push(`lastname = $${index++}`);
      values.push(trimmed);
    }

    if (email !== undefined) {
      const trimmed =
        typeof email === "string" ? email.trim() : "";
      if (!trimmed) {
        return res.status(400).json({ message: "email no puede estar vacio" });
      }
      updates.push(`email = $${index++}`);
      values.push(trimmed);
    }

    if (cellphone !== undefined) {
      const trimmed =
        typeof cellphone === "string" ? cellphone.trim() : null;
      updates.push(`cellphone = $${index++}`);
      values.push(trimmed || null);
    }

    if (password !== undefined) {
      const trimmed =
        typeof password === "string" ? password.trim() : "";
      if (!trimmed) {
        return res
          .status(400)
          .json({ message: "password no puede estar vacio" });
      }
      updates.push(`password = $${index++}`);
      const hashed = await hashPassword(trimmed);
      values.push(hashed);
    }

    if (terms !== undefined) {
      updates.push(`terms = $${index++}`);
      values.push(coerceBoolean(terms));
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: "No hay campos para actualizar" });
    }

    values.push(userId);

    const result = await pool.query(
      `UPDATE "user"
       SET ${updates.join(", ")}
       WHERE id = $${index}
       RETURNING id, name, lastname, email, cellphone, terms`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error al actualizar el usuario:", error);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "El email ya esta registrado" });
    }
    res.status(500).json({ message: "Error al actualizar el usuario" });
  }
});

app.delete("/api/users/:id", requireAdmin, async (req, res) => {
  const userId = parseIdParam(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "ID de usuario invalido" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM "user" WHERE id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.sendStatus(204);
  } catch (error) {
    console.error("Error al eliminar el usuario:", error);
    if (error.code === "23503") {
      return res.status(409).json({
        message:
          "No se puede eliminar el usuario porque tiene ordenes asociadas",
      });
    }
    res.status(500).json({ message: "Error al eliminar el usuario" });
  }
});
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         p.slug,
         p.id,
         p.name,
         p.brand,
         p.description,
         p.picture,
         p.price,
         p.money,
         p.stock,
         p.new,
         p.badge,
         p.segments,
         p.features,
         p.related_ids,
         p.id_category,
         c.name AS category_name
       FROM product p
       LEFT JOIN category c ON c.id = p.id_category
       WHERE p.stock > 0
       ORDER BY p.id DESC`
    );

    const products = result.rows.map(mapProductRow);

    res.status(200).json(products);
  } catch (error) {
    console.error("Error al obtener los productos:", error);
    res.status(500).json({ message: "Error al obtener los productos" });
  }
});

app.get("/api/products/best-sellers", async (req, res) => {
  try {
    const result = await pool.query(
      `WITH flagged AS (
         SELECT
           p.slug,
           p.id,
           p.name,
           p.brand,
           p.description,
           p.picture,
           p.price,
           p.money,
           p.stock,
           p.new,
           p.badge,
           p.segments,
           p.features,
           p.related_ids,
           p.id_category,
           c.name AS category_name,
           ((p.badge ->> 'label') ILIKE 'mas comprado%') AS is_badge_best,
           EXISTS (
             SELECT 1
             FROM unnest(COALESCE(p.segments, ARRAY[]::text[])) AS seg(value)
             WHERE lower(value) = 'best-sellers'
           ) AS is_segment_best
         FROM product p
         LEFT JOIN category c ON c.id = p.id_category
       )
       SELECT
         slug,
         id,
         name,
         brand,
         description,
         picture,
         price,
         money,
         stock,
         new,
         badge,
         segments,
         features,
         related_ids,
         id_category,
         category_name
       FROM flagged
       WHERE (is_badge_best OR is_segment_best)
         AND stock > 0
       ORDER BY
         CASE
           WHEN is_badge_best THEN 0
           WHEN is_segment_best THEN 1
           ELSE 2
         END,
         id DESC
       LIMIT 3`
    );

    res.status(200).json(result.rows.map(mapProductRow));
  } catch (error) {
    console.error(
      "Error al obtener los productos mas vendidos:",
      error
    );
    res.status(500).json({
      message: "Error al obtener los productos mas vendidos",
    });
  }
});

app.get("/api/products/new-arrivals", async (req, res) => {
  try {
    const result = await pool.query(
      `WITH flagged AS (
         SELECT
           p.slug,
           p.id,
           p.name,
           p.brand,
           p.description,
           p.picture,
           p.price,
           p.money,
           p.stock,
           p.new,
           p.badge,
           p.segments,
           p.features,
           p.related_ids,
           p.id_category,
           c.name AS category_name,
           p.new AS flag_new,
           EXISTS (
             SELECT 1
             FROM unnest(COALESCE(p.segments, ARRAY[]::text[])) AS seg(value)
             WHERE lower(value) = 'new-arrivals'
           ) AS flag_segment
         FROM product p
         LEFT JOIN category c ON c.id = p.id_category
       )
       SELECT
         slug,
         id,
         name,
         brand,
         description,
         picture,
         price,
         money,
         stock,
         new,
         badge,
         segments,
         features,
         related_ids,
         id_category,
         category_name
       FROM flagged
       WHERE (flag_new OR flag_segment)
         AND stock > 0
       ORDER BY
         CASE
           WHEN flag_new THEN 0
           WHEN flag_segment THEN 1
           ELSE 2
         END,
         id DESC
       LIMIT 4`
    );

    res.status(200).json(result.rows.map(mapProductRow));
  } catch (error) {
    console.error("Error al obtener los productos nuevos:", error);
    res
      .status(500)
      .json({ message: "Error al obtener los productos nuevos" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  const productId = parseIdParam(req.params.id);
  if (!productId) {
    return res.status(400).json({ message: "ID de producto invalido" });
  }

  try {
    const result = await pool.query(
      `SELECT
         p.slug,
         p.id,
         p.name,
         p.brand,
         p.description,
         p.picture,
         p.price,
         p.money,
         p.stock,
         p.new,
         p.badge,
         p.segments,
         p.features,
         p.related_ids,
         p.id_category,
         c.name AS category_name
       FROM product p
       LEFT JOIN category c ON c.id = p.id_category
       WHERE p.id = $1`,
      [productId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const row = result.rows[0];
    const product = mapProductRow(row);

    res.status(200).json(product);
  } catch (error) {
    console.error("Error al obtener el producto:", error);
    res.status(500).json({ message: "Error al obtener el producto" });
  }
});

app.post("/api/products", requireAdmin, async (req, res) => {
  const {
    name,
    title,
    slug,
    brand,
    description,
    picture,
    price,
    money,
    stock,
    new: newFlag,
    isNew,
    badge,
    segments,
    features,
    related_ids,
    relatedIds,
    id_category,
    categoryId,
  } = req.body;

  const baseName =
    typeof name === "string" && name.trim()
      ? name
      : typeof title === "string"
      ? title
      : "";
  const trimmedName = typeof baseName === "string" ? baseName.trim() : "";
  if (!trimmedName) {
    return res.status(400).json({ message: "name es requerido" });
  }

  const normalizedPrice =
    price === undefined || price === null ? 0 : Number(price);
  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
    return res.status(400).json({ message: "price invalido" });
  }

  const rawStock =
    stock === undefined || stock === null ? 0 : Number.parseInt(stock, 10);
  if (!Number.isFinite(rawStock) || rawStock < 0) {
    return res.status(400).json({ message: "stock invalido" });
  }

  const normalizedMoney =
    typeof money === "string" && money.trim().length === 3
      ? money.trim().toUpperCase()
      : "PEN";

  const normalizedNew =
    (newFlag === undefined && isNew === undefined)
      ? true
      : coerceBoolean(newFlag ?? isNew);

  const normalizedSlug = (() => {
    const raw = typeof slug === "string" ? slug.trim() : "";
    const s = raw || slugify(trimmedName);
    if (!s) return "";
    return s.slice(0, 150);
  })();
  if (!normalizedSlug) {
    return res.status(400).json({ message: "slug es requerido o derivable" });
  }

  const categoryIdValue = parseIdParam(id_category ?? categoryId);
  if (!categoryIdValue) {
    return res.status(400).json({ message: "id_category es requerido" });
  }

  try {
    const badgeObj = (() => {
      if (badge === undefined || badge === null) return {};
      if (typeof badge === "object") return badge;
      if (typeof badge === "string") {
        try {
          const parsed = JSON.parse(badge);
          if (parsed && typeof parsed === "object") return parsed;
        } catch (_) {}
      }
      return {};
    })();

    const segmentsArr = ensureStringArray(segments);
    const featuresArr = ensureStringArray(features);
    const relatedArr = ensureBigIntArray(related_ids ?? relatedIds);

    const result = await pool.query(
      `INSERT INTO product (
         slug, name, brand, description, picture,
         price, money, stock, "new",
         badge, segments, features, related_ids,
         id_category
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12, $13,
         $14
       )
       RETURNING slug, id, name, brand, description, picture, price, money, stock, new, badge, segments, features, related_ids, id_category`,
      [
        normalizedSlug,
        trimmedName,
        typeof brand === "string" ? brand.trim() : null,
        typeof description === "string" ? description.trim() : null,
        typeof picture === "string" ? picture.trim() : null,
        normalizedPrice,
        normalizedMoney,
        rawStock,
        normalizedNew,
        badgeObj,
        segmentsArr,
        featuresArr,
        relatedArr,
        categoryIdValue,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error al crear el producto:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        message:
          "Producto duplicado (slug o nombre por categoria ya existe)",
      });
    }
    if (error.code === "23503") {
      return res
        .status(409)
        .json({ message: "La categoria asociada no existe" });
    }
    res.status(500).json({ message: "Error al crear el producto" });
  }
});

app.put("/api/products/:id", requireAdmin, async (req, res) => {
  const productId = parseIdParam(req.params.id);
  if (!productId) {
    return res.status(400).json({ message: "ID de producto invalido" });
  }

  const {
    name,
    title,
    slug,
    brand,
    description,
    picture,
    price,
    money,
    stock,
    new: newFlag,
    isNew,
    badge,
    segments,
    features,
    related_ids,
    relatedIds,
    id_category,
    categoryId,
  } = req.body;

  try {
    const updates = [];
    const values = [];
    let index = 1;

    if (slug !== undefined) {
      const trimmedSlug =
        typeof slug === "string" && slug.trim()
          ? slug.trim().slice(0, 150)
          : "";
      if (!trimmedSlug) {
        return res.status(400).json({ message: "slug no puede estar vacio" });
      }
      updates.push(`slug = $${index++}`);
      values.push(trimmedSlug);
    }

    if (name !== undefined || title !== undefined) {
      const candidate =
        typeof name === "string" ? name : typeof title === "string" ? title : "";
      const trimmed = typeof candidate === "string" ? candidate.trim() : "";
      if (!trimmed) {
        return res.status(400).json({ message: "name no puede estar vacio" });
      }
      updates.push(`name = $${index++}`);
      values.push(trimmed);
    }

    if (brand !== undefined) {
      const val = typeof brand === "string" ? brand.trim() : null;
      updates.push(`brand = $${index++}`);
      values.push(val || null);
    }

    if (description !== undefined) {
      const val = typeof description === "string" ? description.trim() : null;
      updates.push(`description = $${index++}`);
      values.push(val || null);
    }

    if (picture !== undefined) {
      const val = typeof picture === "string" ? picture.trim() : null;
      updates.push(`picture = $${index++}`);
      values.push(val || null);
    }

    if (price !== undefined) {
      const normalized = Number(price);
      if (!Number.isFinite(normalized) || normalized < 0) {
        return res.status(400).json({ message: "price invalido" });
      }
      updates.push(`price = $${index++}`);
      values.push(normalized);
    }

    if (money !== undefined) {
      if (typeof money !== "string" || money.trim().length !== 3) {
        return res
          .status(400)
          .json({ message: "money debe tener 3 caracteres" });
      }
      updates.push(`money = $${index++}`);
      values.push(money.trim().toUpperCase());
    }

    if (stock !== undefined) {
      const normalized = Number.parseInt(stock, 10);
      if (!Number.isFinite(normalized) || normalized < 0) {
        return res.status(400).json({ message: "stock invalido" });
      }
      updates.push(`stock = $${index++}`);
      values.push(normalized);
    }

    if (newFlag !== undefined || isNew !== undefined) {
      updates.push(`"new" = $${index++}`);
      values.push(coerceBoolean(newFlag ?? isNew));
    }

    if (badge !== undefined) {
      let obj = {};
      if (typeof badge === "object" && badge !== null) obj = badge;
      else if (typeof badge === "string") {
        try {
          const parsed = JSON.parse(badge);
          if (parsed && typeof parsed === "object") obj = parsed;
        } catch (_) {}
      }
      updates.push(`badge = $${index++}`);
      values.push(obj);
    }

    if (segments !== undefined) {
      updates.push(`segments = $${index++}`);
      values.push(ensureStringArray(segments));
    }

    if (features !== undefined) {
      updates.push(`features = $${index++}`);
      values.push(ensureStringArray(features));
    }

    if (related_ids !== undefined || relatedIds !== undefined) {
      updates.push(`related_ids = $${index++}`);
      values.push(ensureBigIntArray(related_ids ?? relatedIds));
    }

    if (id_category !== undefined || categoryId !== undefined) {
      const categoryValue = parseIdParam(id_category ?? categoryId);
      if (!categoryValue) {
        return res.status(400).json({ message: "id_category invalido" });
      }
      updates.push(`id_category = $${index++}`);
      values.push(categoryValue);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: "No hay campos para actualizar" });
    }

    values.push(productId);

    const result = await pool.query(
      `UPDATE product
       SET ${updates.join(", ")}
       WHERE id = $${index}
       RETURNING slug, id, name, brand, description, picture, price, money, stock, new, badge, segments, features, related_ids, id_category`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error al actualizar el producto:", error);
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Ya existe un producto con ese nombre en la categoria",
      });
    }
    if (error.code === "23503") {
      return res
        .status(409)
        .json({ message: "La categoria asociada no existe" });
    }
    res.status(500).json({ message: "Error al actualizar el producto" });
  }
});

app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  const productId = parseIdParam(req.params.id);
  if (!productId) {
    return res.status(400).json({ message: "ID de producto invalido" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM product WHERE id = $1",
      [productId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    res.sendStatus(204);
  } catch (error) {
    console.error("Error al eliminar el producto:", error);
    res.status(500).json({ message: "Error al eliminar el producto" });
  }
});

app.listen(port, () => {
  console.log(`Servidor backend corriendo en http://localhost:${port}`);
});
