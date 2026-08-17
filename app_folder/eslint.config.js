import js from "@eslint/js";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";

// ========== 5. LOGIC ==========
export default defineConfigWithVueTs(
  {
    ignores: ["dist/**", "src-tauri/**", "node_modules/**"],
  },
  js.configs.recommended,
  vueTsConfigs.recommended,
  {
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
);
