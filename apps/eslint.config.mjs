import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/app/(marketing)",
              from: "./src/app/(app)",
              message:
                "(marketing) must not import from (app). Move shared code to src/components/ instead.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
