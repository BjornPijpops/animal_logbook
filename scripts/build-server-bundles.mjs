import { build } from "esbuild";

// Bundles the worker, the migrate step and the email test into single files so the runtime image
// needs no tsx, drizzle-kit or full node_modules. sharp (native) is never imported by this code.
await build({
  entryPoints: {
    worker: "src/worker/index.ts",
    "run-once": "src/worker/run-once.ts",
    migrate: "src/db/migrate.ts",
    "send-test-email": "src/scripts/send-test-email.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  external: ["pg-native", "sharp"],
  tsconfig: "tsconfig.json",
  logLevel: "info",
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
