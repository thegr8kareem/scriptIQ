/**
 * Auth routes for ScriptIQ backend.
 *
 * POST /api/auth/register  — create a new account
 * POST /api/auth/login     — verify credentials → JWT
 * POST /api/auth/logout    — client-side (log + 200)
 * GET  /api/auth/me        — return verified user from JWT
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import db, { initDb } from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "scriptiq-dev-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS = 12;

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Enforce the same strong-password baseline as the Supabase path. */
function validatePassword(password) {
  if (!password || password.length < 12) {
    throw Object.assign(new Error("Password must be at least 12 characters."), { status: 422 });
  }
  if (!/[a-z]/.test(password)) {
    throw Object.assign(new Error("Password must contain at least one lowercase letter."), { status: 422 });
  }
  if (!/[A-Z]/.test(password)) {
    throw Object.assign(new Error("Password must contain at least one uppercase letter."), { status: 422 });
  }
  if (!/\d/.test(password)) {
    throw Object.assign(new Error("Password must contain at least one number."), { status: 422 });
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    throw Object.assign(new Error("Password must contain at least one special character (e.g. !, @, #, $, etc.)."), { status: 422 });
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function sanitize(user) {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

/* Ensure DB is ready before any handler runs. */
router.use(async (_req, _res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    next(err);
  }
});

/* ── POST /register ───────────────────────────────────────────────────── */
router.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(422).json({ error: "A valid email address is required (e.g. name@domain.com)." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    validatePassword(password);

    await db.read();
    const existing = db.data.users.find((u) => u.email === normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    db.data.users.push(user);
    await db.write();

    const token = signToken(user);
    res.status(201).json({
      token,
      user: sanitize(user),
      message: "Account created successfully.",
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST /google ─────────────────────────────────────────────────────── */
router.post("/google", async (req, res, next) => {
  try {
    const { email } = req.body || {};

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(422).json({ error: "A valid Google email address is required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    await db.read();
    
    // Find or create user
    let user = db.data.users.find((u) => u.email === normalizedEmail);
    if (!user) {
      const emailParts = normalizedEmail.split("@")[0];
      const defaultName = emailParts.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
      user = {
        id: randomUUID(),
        email: normalizedEmail,
        name: defaultName,
        createdAt: new Date().toISOString(),
      };
      db.data.users.push(user);
      await db.write();
    }

    const token = signToken(user);
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    next(err);
  }
});

/* ── POST /login ──────────────────────────────────────────────────────── */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(422).json({ error: "Email and password are required." });
    }

    const normalizedEmail = email.trim().toLowerCase();

    await db.read();
    const user = db.data.users.find((u) => u.email === normalizedEmail);

    /* Use a constant-time comparison to prevent timing attacks. */
    const dummyHash = "$2a$12$invalidhashfortimingprotection00000000000000000000";
    const hash = user ? user.passwordHash : dummyHash;
    const match = await bcrypt.compare(password, hash);

    if (!user || !match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signToken(user);
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    next(err);
  }
});

/* ── POST /logout ─────────────────────────────────────────────────────── */
router.post("/logout", (req, res) => {
  /* JWT is stateless — the client discards the token.
     This endpoint exists for audit logging and future token blocklist. */
  const auth = req.headers["authorization"] || "";
  console.log(`[auth] logout - token present: ${auth.startsWith("Bearer ")}`);
  res.json({ message: "Signed out." });
});

/* ── GET /me ──────────────────────────────────────────────────────────── */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    await db.read();
    const user = db.data.users.find((u) => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ user: sanitize(user) });
  } catch (err) {
    next(err);
  }
});

/* ── GET /profile ─────────────────────────────────────────────────────── */
router.get("/profile", requireAuth, async (req, res, next) => {
  try {
    await db.read();
    const user = db.data.users.find((u) => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const emailParts = user.email.split("@")[0];
    const defaultName = emailParts.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    res.json({
      profile: {
        id: user.id,
        email: user.email,
        name: user.name || defaultName,
        avatarUrl: user.avatarUrl || null,
        createdAt: user.createdAt,
        institution: user.institution || "University of Ghana",
        accountType: user.accountType || "Lecturer"
      }
    });
  } catch (err) {
    next(err);
  }
});

/* ── POST /profile ────────────────────────────────────────────────────── */
router.post("/profile", requireAuth, async (req, res, next) => {
  try {
    const { name, institution, accountType } = req.body || {};
    await db.read();
    const userIndex = db.data.users.findIndex((u) => u.id === req.user.id);
    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found." });
    }
    if (name !== undefined) db.data.users[userIndex].name = name;
    if (institution !== undefined) db.data.users[userIndex].institution = institution;
    if (accountType !== undefined) db.data.users[userIndex].accountType = accountType;
    await db.write();
    const user = db.data.users[userIndex];
    res.json({
      message: "Profile updated successfully.",
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl || null,
        createdAt: user.createdAt,
        institution: user.institution || "University of Ghana",
        accountType: user.accountType || "Lecturer"
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
