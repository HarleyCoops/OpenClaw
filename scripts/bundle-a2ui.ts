import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function logBundleFailure(): void {
  // Keep this aligned with the old bash script so CI/user guidance stays familiar.
  console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
  console.error("If this persists, verify pnpm deps and try again.");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(entryPath: string, out: string[]): Promise<void> {
  const st = await fs.stat(entryPath);
  if (st.isDirectory()) {
    const entries = await fs.readdir(entryPath);
    for (const entry of entries) {
      await walkFiles(path.join(entryPath, entry), out);
    }
    return;
  }
  out.push(entryPath);
}

function normalizeForSorting(p: string): string {
  // Match the old bash/node hash logic: normalize path separators.
  return p.split(path.sep).join("/");
}

async function computeHash(rootDir: string, inputs: string[]): Promise<string> {
  const files: string[] = [];
  for (const input of inputs) {
    await walkFiles(input, files);
  }

  files.sort((a, b) => normalizeForSorting(a).localeCompare(normalizeForSorting(b)));

  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = normalizeForSorting(path.relative(rootDir, filePath));
    hash.update(rel);
    hash.update("\0");
    hash.update(await fs.readFile(filePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}

function run(command: string, args: string[], cwd: string): void {
  const res = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    // On Windows, pnpm is typically a .cmd shim. Let the shell resolve it.
    shell: process.platform === "win32",
    windowsHide: true,
  });

  if (res.error) throw res.error;
  if (typeof res.status === "number" && res.status !== 0) {
    throw new Error(`${command} exited with code ${res.status}`);
  }
  if (res.status === null) {
    throw new Error(`${command} terminated by signal`);
  }
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");

  const hashFile = path.join(rootDir, "src", "canvas-host", "a2ui", ".bundle.hash");
  const outputFile = path.join(rootDir, "src", "canvas-host", "a2ui", "a2ui.bundle.js");
  const a2uiRendererDir = path.join(rootDir, "vendor", "a2ui", "renderers", "lit");
  const a2uiAppDir = path.join(rootDir, "apps", "shared", "OpenClawKit", "Tools", "CanvasA2UI");

  // Docker builds exclude vendor/apps via .dockerignore.
  // In that environment we must keep the prebuilt bundle.
  if (!(await pathExists(a2uiRendererDir)) || !(await pathExists(a2uiAppDir))) {
    console.log("A2UI sources missing; keeping prebuilt bundle.");
    return;
  }

  const inputPaths = [
    path.join(rootDir, "package.json"),
    path.join(rootDir, "pnpm-lock.yaml"),
    a2uiRendererDir,
    a2uiAppDir,
  ];

  const currentHash = await computeHash(rootDir, inputPaths);
  if ((await pathExists(hashFile)) && (await pathExists(outputFile))) {
    const previousHash = (await fs.readFile(hashFile, "utf8")).trim();
    if (previousHash === currentHash) {
      console.log("A2UI bundle up to date; skipping.");
      return;
    }
  }

  const pnpm = "pnpm";

  // Compile the renderer TS first.
  run(pnpm, ["-s", "exec", "tsc", "-p", path.join(a2uiRendererDir, "tsconfig.json")], rootDir);

  // Bundle the host app.
  run(pnpm, ["-s", "exec", "rolldown", "-c", path.join(a2uiAppDir, "rolldown.config.mjs")], rootDir);

  await fs.mkdir(path.dirname(hashFile), { recursive: true });
  await fs.writeFile(hashFile, `${currentHash}\n`, "utf8");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  logBundleFailure();
  process.exitCode = 1;
});

