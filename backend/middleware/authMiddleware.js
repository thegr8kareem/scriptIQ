/**
 * JWT verification middleware.
 *
 * Reads the Bearer token from the Authorization header, verifies it,
 * and attaches `req.user = { id, email }` for downstream handlers.
 */

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "scriptiq-dev-secret-change-in-production";

/**
 * @param {import("express").Request}  req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
}
