import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@/schema": path.resolve(__dirname, "src/lib/schema"),
      "@/store": path.resolve(__dirname, "src/lib/store"),
      "@/data": path.resolve(__dirname, "src/lib/data"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
