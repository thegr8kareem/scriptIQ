/**
 * Hash-based client router for the ScriptIQ SPA.
 *
 * Routes:
 *   #/           — marketing landing
 *   #/login      — authentication
 *   #/app        — plagiarism workflow (auth-gated)
 */
const routes = new Map();
let currentCleanup = null;

/**
 * Register a route handler.
 * @param {string} path - e.g. "/", "/login", "/app"
 * @param {(ctx: { navigate: Function, params: object }) => (void|Function)} handler
 *   May return a cleanup function called before the next navigation.
 */
export function registerRoute(path, handler) {
  routes.set(normalizePath(path), handler);
}

/**
 * Navigate to a path (updates location hash).
 * @param {string} path
 */
export function navigate(path) {
  const normalized = normalizePath(path);
  window.location.hash = normalized === "/" ? "" : `#${normalized}`;
}

/**
 * Parse the current hash into a normalized path.
 * @returns {string}
 */
export function getCurrentPath() {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  return normalizePath(hash);
}

/**
 * Boot the router and listen for hash changes.
 */
export function startRouter() {
  window.addEventListener("hashchange", renderCurrentRoute);
  renderCurrentRoute();
}

function renderCurrentRoute() {
  const path = getCurrentPath();
  const handler = routes.get(path) || routes.get("/");

  if (typeof currentCleanup === "function") {
    currentCleanup();
    currentCleanup = null;
  }

  const result = handler({ navigate, params: {}, path });
  if (typeof result === "function") currentCleanup = result;
}

function normalizePath(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.replace(/\/+$/, "") || "/";
}
