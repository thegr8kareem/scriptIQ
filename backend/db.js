/**
 * lowdb JSON database adapter for ScriptIQ backend.
 *
 * Stores users in backend/db.json (gitignored). The file is created
 * automatically on first run. No external database required.
 *
 * Schema:
 *   { users: [{ id, email, passwordHash, createdAt }] }
 */

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbFile = join(__dirname, "db.json");

const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { users: [] });

/** Initialise — read existing data or write defaults. */
export async function initDb() {
  await db.read();
  db.data ||= { users: [] };
  await db.write();
}

export default db;
