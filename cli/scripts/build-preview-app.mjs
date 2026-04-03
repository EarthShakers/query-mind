import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function run() {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    console.warn(
      "[spark] skip preview-app build: esbuild is not installed yet. " +
        "Install deps then run `pnpm --dir cli run build:preview-app`."
    );
    return;
  }

  await esbuild.build({
    entryPoints: [path.join(root, "src/preview-app/main.tsx")],
    outfile: path.join(root, "dist/preview-app/app.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    sourcemap: false,
    minify: true,
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    loader: {
      ".tsx": "tsx",
      ".ts": "ts",
    },
  });
}

run().catch((err) => {
  console.error("[spark] build preview-app failed:", err);
  process.exit(1);
});
