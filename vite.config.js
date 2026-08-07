/**
 * Vite build configuration for ScriptIQ.
 *
 * Bundles the SPA shell (landing → login → app) while keeping legacy
 * ScriptIQ modules as ES imports that attach to window.ScriptIQ.
 */
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/gsap") || id.includes("node_modules/lenis")) {
            return "vendor-ui";
          }
        },
      },
    },
  },
});
