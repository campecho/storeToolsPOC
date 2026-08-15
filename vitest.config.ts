import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // publisher-prototype/ is a self-contained app with its own toolchain;
    // the host never lints/tests/builds anything inside it.
    exclude: ["publisher-prototype/**", "**/node_modules/**"],
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
