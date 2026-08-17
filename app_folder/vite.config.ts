import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// ========== 3. CONSTANTS ==========
// (none)

// ========== 5. LOGIC ==========
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@engine": fileURLToPath(new URL("../engine_folder/src", import.meta.url)),
    },
  },
});
