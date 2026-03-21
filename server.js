import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import cyberRoutes from "./routes/cyberRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { verifyDatabaseConnection } from "./config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300
});

app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "").split(",").filter(Boolean),
    credentials: true
  })
);
app.use(helmet());
app.use(limiter);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express.static("uploads"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "darkgorkha-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api", contentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cyber", cyberRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number(process.env.PORT || 5000);

try {
  await verifyDatabaseConnection();
  app.listen(port, () => {
    console.log(`Darkgorkha API running on port ${port}`);
  });
} catch (error) {
  console.error("Database connection failed.");
  console.error(`DB_HOST=${process.env.DB_HOST} DB_PORT=${process.env.DB_PORT} DB_USER=${process.env.DB_USER} DB_NAME=${process.env.DB_NAME}`);
  console.error(error.message);
  process.exit(1);
}
