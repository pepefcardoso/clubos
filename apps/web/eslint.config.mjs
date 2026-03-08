import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
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

export default config;
