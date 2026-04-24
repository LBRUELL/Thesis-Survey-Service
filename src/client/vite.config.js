import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "https://fortunate-vision-production-3ab3.up.railway.app",
        changeOrigin: true,
      },
      "/uploads": {
        target: "https://fortunate-vision-production-3ab3.up.railway.app",
        changeOrigin: true,
      },
      "/videos": {
        target: "https://fortunate-vision-production-3ab3.up.railway.app",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
