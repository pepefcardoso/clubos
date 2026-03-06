// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Configurações globais: ignorar pastas de build
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  // Configuração base do ESLint (regras recomendadas)
  eslint.configs.recommended,
  // Configurações recomendadas para TypeScript
  ...tseslint.configs.recommended,
  {
    rules: {
      // Aqui pode adicionar ou sobrescrever regras personalizadas
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
