/**
 * Theme toggle utility for ScriptIQ.
 * Manages dark/light mode attribute on document root, preserves state in localStorage,
 * and synchronizes theme buttons across multiple active views.
 */
export function initThemeToggle(root) {
  const btn = root.querySelector("#theme-toggle-btn");
  if (!btn) return () => {};
  
  const updateIcon = (theme) => {
    btn.textContent = theme === "light" ? "☀️" : "🌙";
  };

  // Sync state initially
  const activeTheme = document.documentElement.getAttribute("data-theme") || "dark";
  updateIcon(activeTheme);

  const toggle = () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateIcon(next);
    
    // Notify other views of theme change
    window.dispatchEvent(new CustomEvent("theme-changed", { detail: { theme: next } }));
  };

  btn.addEventListener("click", toggle);

  const handleSync = (e) => {
    updateIcon(e.detail.theme);
  };
  window.addEventListener("theme-changed", handleSync);

  return () => {
    btn.removeEventListener("click", toggle);
    window.removeEventListener("theme-changed", handleSync);
  };
}
