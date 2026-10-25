import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const featureNames = [
  "animals",
  "appointments",
  "medical",
  "documents",
  "medications",
  "expenses",
  "food",
  "households",
  "auth",
  "notifications",
  "dashboard",
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
    "data/**",
    "public/sw.js*",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Cross-feature imports go through `features/<x>/index.ts` only.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: featureNames.map((name) => ({
            regex: `^@/features/${name}/.+`,
            message: `Import from "@/features/${name}" (its index.ts) instead.`,
          })),
        },
      ],
    },
  },
  {
    // A feature may import its own internals through relative paths, and tests may reach in.
    files: ["src/features/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "e2e/**"],
    rules: { "no-restricted-imports": "off" },
  },
]);
