import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadAvatarBundle } from "../lip-sync/avatar-assets.mjs";

const root = dirname(fileURLToPath(new URL("../assets/avatar/catalog.json", import.meta.url)));
test("strict loader verifies identity, PNG metadata, hashes and bundle fingerprint", async () => { const bundle = await loadAvatarBundle(root, "avatar-zhou"); assert.equal(bundle.manifest.bundleFingerprint, "c86ddb2aabb5b8165cd2c0eb1ca3d5adaa15de227baa1fc84450f9eeca78e2a8"); assert.deepEqual(Object.keys(bundle.poses), ["CLOSED", "SMALL", "MEDIUM", "LARGE", "ROUND"]); });
test("loader rejects unknown avatars and catalog path escape", async () => { await assert.rejects(loadAvatarBundle(root, "avatar-lin"), /AVATAR_NOT_READY/); const temp = await mkdtemp(join(tmpdir(), "avatar-loader-")); await cp(root, temp, { recursive: true }); const catalogPath = join(temp, "catalog.json"); const catalog = JSON.parse(await readFile(catalogPath, "utf8")); catalog.avatars[0].manifestPath = "../outside.json"; await writeFile(catalogPath, JSON.stringify(catalog)); await assert.rejects(loadAvatarBundle(temp, "avatar-zhou"), /AVATAR_PATH_ESCAPE/); });
