import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,       // Porta do Vite (ajuste combinando com o backend CORS)
    strictPort: true, // Se 5174 estiver ocupada, dá erro em vez de mudar a porta
    cors: {
      origin: ["http://127.0.0.1:5174", "http://localhost:5174"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      credentials: true,
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
});
