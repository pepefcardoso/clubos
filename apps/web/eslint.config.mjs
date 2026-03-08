import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  ...coreWebVitals,
  ...nextTypescript,
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
