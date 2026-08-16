import "dotenv/config";

import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";

import { serve } from "@hono/node-server";
import {
  ApiErrorSchema,
  ProjectListResponseSchema,
  ProjectResponseSchema,
  TracerUploadResponseSchema,
} from "@ppt-digital-human/contracts";

import { createApplication } from "./app.ts";
import { clearProductState, createProductPrismaClient } from "./database.ts";

const databaseUrl =
  process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) throw new Error("PPT_DH_DATABASE_URL is required for stage 3 tests.");

const prisma = createProductPrismaClient(databaseUrl);
const internalToken = "stage-3-project-token";
const principal = "stage-3-user";
let assetRoot = "";
let baseUrl = "";
let server: ReturnType<typeof serve>;
let fixture: Uint8Array;

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-3-"));
  fixture = await readFile(
    fileURLToPath(new URL("../tests/fixtures/tracer-3.pptx", import.meta.url)),
  );
  server = serve({
    fetch: createApplication({ prisma, assetRoot, internalToken }).fetch,
    port: 0,
  });
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => clearProductState(prisma));

after(async () => {
  server.close();
  await prisma.$disconnect();
  await rm(assetRoot, { recursive: true, force: true });
});

function headers(selectedPrincipal = principal): HeadersInit {
  return {
    "X-Internal-Token": internalToken,
    "X-Principal": selectedPrincipal,
  };
}

async function uploadProject() {
  const form = new FormData();
  const bytes = fixture.buffer.slice(
    fixture.byteOffset,
    fixture.byteOffset + fixture.byteLength,
  ) as ArrayBuffer;
  form.set("title", "导数项目");
  form.set(
    "file",
    new File([bytes], "中文导数课件.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
  );
  const response = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: { ...headers(), "Idempotency-Key": "stage_3_upload" },
    body: form,
  });
  assert.equal(response.status, 201);
  return TracerUploadResponseSchema.parse(await response.json()).data;
}

test("project list, copy, archive and delete keep principal and version boundaries", async () => {
  const uploaded = await uploadProject();
  await prisma.generationTask.update({
    where: { id: uploaded.task.id },
    data: { status: "SUCCEEDED", progressCompleted: 1 },
  });
  await prisma.project.update({
    where: { id: uploaded.project.id },
    data: { status: "READY" },
  });

  const listed = await fetch(`${baseUrl}/v1/projects?search=导数`, {
    headers: headers(),
  });
  assert.equal(listed.status, 200);
  const listedBody = ProjectListResponseSchema.parse(await listed.json());
  assert.deepEqual(listedBody.data.map((project) => project.id), [uploaded.project.id]);

  const copied = await fetch(`${baseUrl}/v1/projects/${uploaded.project.id}/copy`, {
    method: "POST",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "stage_3_copy" }),
  });
  assert.equal(copied.status, 201);
  const copiedProject = ProjectResponseSchema.parse(await copied.json()).data;
  assert.notEqual(copiedProject.id, uploaded.project.id);
  assert.match(copiedProject.title, /副本/);

  const archive = await fetch(
    `${baseUrl}/v1/projects/${uploaded.project.id}/archive`,
    {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
  );
  assert.equal(archive.status, 200);
  assert.equal(ProjectResponseSchema.parse(await archive.json()).data.status, "archived");

  const hidden = ProjectListResponseSchema.parse(
    await (
      await fetch(`${baseUrl}/v1/projects`, { headers: headers() })
    ).json(),
  );
  assert(!hidden.data.some((project) => project.id === uploaded.project.id));

  const archived = ProjectListResponseSchema.parse(
    await (
      await fetch(`${baseUrl}/v1/projects?status=archived&includeArchived=true`, {
        headers: headers(),
      })
    ).json(),
  );
  assert.deepEqual(archived.data.map((project) => project.id), [uploaded.project.id]);

  const crossPrincipal = await fetch(`${baseUrl}/v1/projects/${uploaded.project.id}`, {
    headers: headers("another-stage-3-user"),
  });
  assert.equal(crossPrincipal.status, 404);
  assert.equal(
    ApiErrorSchema.parse(await crossPrincipal.json()).error.code,
    "PROJECT_NOT_FOUND",
  );

  const staleDelete = await fetch(`${baseUrl}/v1/projects/${uploaded.project.id}`, {
    method: "DELETE",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 1 }),
  });
  assert.equal(staleDelete.status, 409);

  const deleted = await fetch(`${baseUrl}/v1/projects/${uploaded.project.id}`, {
    method: "DELETE",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 2 }),
  });
  assert.equal(deleted.status, 204);
  assert.equal(await prisma.project.count({ where: { id: uploaded.project.id } }), 0);
  assert.equal(await prisma.project.count({ where: { id: copiedProject.id } }), 1);
});

test("active project cannot be archived or deleted", async () => {
  const uploaded = await uploadProject();
  for (const [path, method] of [
    [`/v1/projects/${uploaded.project.id}/archive`, "POST"],
    [`/v1/projects/${uploaded.project.id}`, "DELETE"],
  ] as const) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(response.status, 409);
    assert.equal(
      ApiErrorSchema.parse(await response.json()).error.code,
      "PROJECT_HAS_ACTIVE_TASKS",
    );
  }
});
