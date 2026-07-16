import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:7433", ws: true },
      "/api": { target: "http://127.0.0.1:7433" },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
