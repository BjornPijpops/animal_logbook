import { spawnSync } from "node:child_process";
import { build } from "esbuild";

// The services import "server-only" and the feature index files (React, next/*), which plain
// Node cannot load. Bundling with an alias for "server-only" and a ".js" suffix for next/* lets
// the seeder run the real service layer from a script, in the source tree and in the image.
const nextSuffix = {
  name: "next-js-suffix",
  setup(b) {
    b.onResolve({ filter: /^next\/[a-z-]+$/ }, (args) => ({
      path: `${args.path}.js`,
      external: true,
    }));
  },
};

const outfile = process.env.DEMO_SEED_OUT ?? "dist/seed-demo.mjs";
await build({
  entryPoints: ["src/demo/seed-demo.ts"],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  jsx: "automatic",
  plugins: [nextSuffix],
  alias: { "server-only": "./src/test/server-only.ts" },
  tsconfig: "tsconfig.json",
  logLevel: "warning",
});

const result = spawnSync(
  process.execPath,
  ["--env-file-if-exists=.env.local", outfile, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
