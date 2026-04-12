import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import cyberRoutes from "./routes/cyberRoutes.js";
import { attachUserIfAuthenticated, authenticate, authorize } from "./middlewares/auth.js";
import { listUploadedImages } from "./controllers/contentController.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { verifyDatabaseConnection } from "./config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "../client/dist");
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const configuredOrigins = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const fallbackOrigins = [process.env.APP_URL, process.env.ADMIN_URL, "http://localhost:5173", "http://localhost:5174"]
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length ? configuredOrigins : fallbackOrigins;

const app = express();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300
});

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS blocked for this origin"));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(limiter);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.resolve(__dirname, "uploads")));

app.get("/api/health", async (req, res) => {
  try {
    await verifyDatabaseConnection();
    res.json({
      status: "ok",
      service: "darkgorkha-api",
      database: { connected: true }
    });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      service: "darkgorkha-api",
      database: { connected: false, message: error.message }
    });
  }
});

app.get("/api/status", async (_req, res) => {
  try {
    await verifyDatabaseConnection();
    res.json({ connected: true, message: "Database connected successfully" });
  } catch (error) {
    res.status(500).json({
      connected: false,
      message: `Connection failed: ${error?.message || "Unknown database error"}`
    });
  }
});

app.get(
  "/api/uploads/gallery",
  attachUserIfAuthenticated,
  authenticate,
  authorize("admin", "editor"),
  listUploadedImages
);

app.use("/api/auth", authRoutes);
app.use("/api", contentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cyber", cyberRoutes);

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || path.extname(req.path)) {
      return next();
    }

    return res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT || 5000);

const server = app.listen(port, () => {
  console.log(`Darkgorkha API running on port ${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Another server instance is probably already running.`);
    console.error(`If you want a new instance, stop the process using port ${port} or change PORT in .env.`);
    process.exit(1);
  }

  console.error("Server failed to start.");
  console.error(error.message);
  process.exit(1);
});

verifyDatabaseConnection()
  .then(() => {
    console.log("Database connected.");
  })
  .catch((error) => {
    console.error("Database connection check failed. Server is running, but DB-backed APIs may fail until DB is reachable.");
    console.error(`DB_HOST=${process.env.DB_HOST} DB_PORT=${process.env.DB_PORT} DB_USER=${process.env.DB_USER} DB_NAME=${process.env.DB_NAME}`);
    console.error(error.message);
  });
