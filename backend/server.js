/**
 * ScriptIQ Express Backend
 *
 * Provides identity-only JWT authentication for local development.
 * When VITE_SUPABASE_URL is configured in the frontend .env, Supabase
 * is used instead. This backend mirrors the same shape so switching is
 * just a config change.
 *
 * Endpoints:
 *   POST /api/auth/register  — create account
 *   POST /api/auth/login     — email + password → JWT
 *   POST /api/auth/logout    — (client-side token discard, endpoint for logging)
 *   GET  /api/auth/me        — verify token → user object
 *   GET  /api/health         — liveness probe
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRouter from "./routes/auth.js";
import aiRouter from "./routes/ai.js";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 3001;

/* ── rate limiting ────────────────────────────────────────────────────── */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login/register attempts per windowMs
  message: { error: "Too many login/registration attempts, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

/* ── security & parsing ───────────────────────────────────────────────── */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      // Allow any localhost / 127.0.0.1 origin in development
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
      ];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy error: Origin not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ── routes ───────────────────────────────────────────────────────────── */
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/ai", aiRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "scriptiq-backend", ts: new Date().toISOString() });
});

/* 404 handler */
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

/* global error handler */
app.use((err, _req, res, _next) => {
  console.error("[ScriptIQ API]", err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

/* ── start ────────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚀 ScriptIQ API running at http://localhost:${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/api/health\n`);
});
