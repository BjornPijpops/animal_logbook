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

// The demo seeder calls the real service layer, which pulls in "server-only" and the feature index
// files (React components, next/*, next-intl). Those UI modules are never called by the seeder, so
// they are replaced with a stub and "server-only" becomes a no-op. The result runs from the runtime
// image, which has no source tree and only the traced production dependencies.
const stubFramework = {
  name: "stub-framework",
  setup(b) {
    b.onResolve({ filter: /^next(-intl)?(\/.*)?$/ }, (args) => ({
      path: args.path,
      namespace: "framework-stub",
    }));
    b.onLoad({ filter: /.*/, namespace: "framework-stub" }, () => ({
      loader: "js",
      contents:
        'module.exports = new Proxy(function () {}, { get: (_t, key) => key === "__esModule" ? false : () => { throw new Error("UI framework call in the demo seeder"); } });',
    }));
  },
};

await build({
  entryPoints: { "seed-demo": "src/demo/seed-demo.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  external: ["pg-native", "sharp"],
  jsx: "automatic",
  plugins: [stubFramework],
  alias: { "server-only": "./src/test/server-only.ts" },
  tsconfig: "tsconfig.json",
  logLevel: "info",
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
