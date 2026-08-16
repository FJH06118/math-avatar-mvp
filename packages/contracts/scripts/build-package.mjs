import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const stagingRoot = join(packageRoot, ".package");
const distributionRoot = join(stagingRoot, "dist");
const artifactRoot = join(packageRoot, "package-artifacts");
const sourcePackage = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const contractSourceStatus = runGit(["status", "--porcelain", "--", "packages/contracts/src"]);
if (contractSourceStatus) {
  process.stderr.write("Contract source has uncommitted changes; commit and version it before packaging.\n");
  process.exit(1);
}

await rm(stagingRoot, { recursive: true, force: true });
await mkdir(distributionRoot, { recursive: true });
await mkdir(artifactRoot, { recursive: true });

await build({
  entryPoints: [join(packageRoot, "src", "index.ts")],
  outfile: join(distributionRoot, "index.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  external: ["zod"],
  sourcemap: true,
});

runNode(resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), [
  "-p",
  join(packageRoot, "tsconfig.package.json"),
]);

const declarationIndexPath = join(distributionRoot, "index.d.ts");
const declarationIndex = await readFile(declarationIndexPath, "utf8");
await writeFile(
  declarationIndexPath,
  declarationIndex.replace(/from "(\.\/[^".]+)"/g, 'from "$1.js"'),
);

const sourceCommit = runGit(["rev-parse", "HEAD"]);
const manifest = {
  name: sourcePackage.name,
  version: sourcePackage.version,
  private: true,
  type: "module",
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
  },
  files: ["dist", "SOURCE.json", "README.md"],
  dependencies: {
    zod: sourcePackage.dependencies.zod,
  },
};

await writeFile(join(stagingRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  join(stagingRoot, "SOURCE.json"),
  `${JSON.stringify(
    {
      schemaVersion: "v1",
      sourceRepository: "https://github.com/FJH06118/math-avatar-mvp",
      sourceCommit,
      packageVersion: sourcePackage.version,
    },
    null,
    2,
  )}\n`,
);
await copyFile(join(packageRoot, "README.md"), join(stagingRoot, "README.md"));

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}
