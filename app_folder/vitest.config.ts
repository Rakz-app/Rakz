import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// ========== 5. LOGIC ==========
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@engine": fileURLToPath(new URL("../engine_folder/src", import.meta.url)),
    },
  },
});
