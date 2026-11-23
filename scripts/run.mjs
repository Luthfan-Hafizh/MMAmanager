// Bundle a TypeScript check with esbuild and run it in Node.
//   node scripts/run.mjs scripts/check-engine.ts [args]
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { mkdirSync } from "node:fs";

const [entry, ...args] = process.argv.slice(2);
if (!entry) {
  console.error("usage: node scripts/run.mjs <file.ts> [args]");
  process.exit(2);
}
mkdirSync("node_modules/.cache", { recursive: true });
const out = `node_modules/.cache/${basename(entry).replace(/\.tsx?$/, "")}.mjs`;
await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  logLevel: "warning",
  jsx: "automatic",
  external: ["react", "react-dom", "react-dom/server"],
  define: { "import.meta.env.BASE_URL": '"/"', "import.meta.env.DEV": "false" },
});
const r = spawnSync(process.execPath, [out, ...args], { stdio: "inherit" });
process.exit(r.status ?? 1);
