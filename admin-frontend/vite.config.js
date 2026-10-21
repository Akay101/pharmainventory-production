import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["VITE_", "ADMIN_"]);
  return {
    plugins: [react()],
    envPrefix: ["VITE_", "ADMIN_"],
    define: {
      "process.env.ADMIN_BASE_URL": JSON.stringify(env.ADMIN_BASE_URL || ""),
    },
    server: {
      port: 3001,
      host: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8002",
          changeOrigin: true,
        },
      },
    },
  };
});
