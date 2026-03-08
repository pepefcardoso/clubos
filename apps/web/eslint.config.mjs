import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([{
    extends: [...nextCoreWebVitals, ...nextTypescript],

    rules: {
        "import/no-restricted-paths": ["error", {
            zones: [{
                target: "./src/app/(marketing)",
                from: "./src/app/(app)",
                message: "(marketing) must not import from (app). Move shared code to src/components/ instead.",
            }],
        }],
    },
}]);