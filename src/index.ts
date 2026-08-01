import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

import documentsRouter from "./routes/documents.routes.js";
import chatRouter from "./routes/chat.routes.js";
import stocksRouter from "./routes/stocks.routes.js";
import newsRouter from "./routes/news.routes.js";
import { ensureIndexExists } from "./services/pinecone.service.js";

// Load env vars before anything else
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Build allowed-origins list from env ─────────────────────────────────────
// ALLOWED_ORIGINS: comma-separated list of allowed origins (no trailing slashes)
// e.g. "https://stockai-client-app.vercel.app,https://my-tunnel.trycloudflare.com"
function buildAllowedOrigins(): string[] {
  const origins: string[] = [
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  // Primary production origin (Vercel)
  if (process.env.ALLOWED_ORIGIN) {
    origins.push(process.env.ALLOWED_ORIGIN.replace(/\/$/, ""));
  }

  // Cloudflare Tunnel origin (optional)
  if (process.env.CLOUDFLARE_TUNNEL_ORIGIN) {
    origins.push(process.env.CLOUDFLARE_TUNNEL_ORIGIN.replace(/\/$/, ""));
  }

  // Extra comma-separated origins
  if (process.env.ALLOWED_ORIGINS_EXTRA) {
    process.env.ALLOWED_ORIGINS_EXTRA.split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean)
      .forEach((o) => origins.push(o));
  }

  return [...new Set(origins)]; // deduplicate
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

console.log("🌐 CORS Allowed Origins:", ALLOWED_ORIGINS);

// ─── Trust Cloudflare / reverse proxy ────────────────────────────────────────
// Required for correct IP detection behind Cloudflare Tunnel or any reverse proxy
app.set("trust proxy", 1);

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// ─── CORS Middleware ──────────────────────────────────────────────────────────
const corsOptions: cors.CorsOptions = {
  origin: (incomingOrigin, callback) => {
    // Allow requests with no Origin header (server-to-server, curl, Postman)
    if (!incomingOrigin) {
      return callback(null, true);
    }

    const normalized = incomingOrigin.replace(/\/$/, "");

    if (ALLOWED_ORIGINS.includes(normalized)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${incomingOrigin}`);
      callback(new Error(`CORS: Origin '${incomingOrigin}' not allowed.`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  exposedHeaders: ["Content-Type"],
  optionsSuccessStatus: 200, // IE11 compat
};

// Apply CORS globally — must be before all routes
app.use(cors(corsOptions));

// Explicitly handle OPTIONS preflight for all routes
// (cors() does this, but explicit handler avoids edge-case middleware ordering issues)
app.options("*", cors(corsOptions));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use("/api", apiLimiter);

// ─── Request Logging ──────────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} | Origin: ${req.headers.origin || "none"}`);
  next();
});

// ─── Health Endpoint ──────────────────────────────────────────────────────────
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    groq_model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    pinecone_index: process.env.PINECONE_INDEX_NAME || "(not set)",
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/documents", documentsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/stocks", stocksRouter);
app.use("/api", newsRouter);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Handle CORS errors specifically
  if (err.message && err.message.startsWith("CORS:")) {
    res.status(403).json({
      error: err.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  console.error("🔥 Global Express Error:", err.stack || err.message || err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    timestamp: new Date().toISOString(),
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 StockAI Express Server running on http://localhost:${PORT}`);
  console.log(`📡 Health Check:        http://localhost:${PORT}/api/health`);
  console.log(`💬 Chat Stream SSE:     http://localhost:${PORT}/api/chat/stream`);
  console.log(`📄 Document Upload:     http://localhost:${PORT}/api/documents/upload`);
  console.log(`🌐 Allowed Origins:     ${ALLOWED_ORIGINS.join(", ")}\n`);

  // Ensure Pinecone index exists — auto-creates if missing (non-blocking)
  ensureIndexExists().catch((e) =>
    console.warn("⚠️  Pinecone index init warning:", e.message)
  );
});
