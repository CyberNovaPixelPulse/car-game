import { defineConfig } from "vite";
export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: { input: { racing: "index.html", tank: "tank.html" } },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.WEB_PORT || 4273),
    strictPort: true,
  },
});
