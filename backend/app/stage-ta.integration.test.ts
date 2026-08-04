import "dotenv/config";

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { after, before, beforeEach, test } from "node:test";
import { serve } from "@hono/node-server";
import {
  ApiErrorSchema,
  TracerTaskResponseSchema,
  TracerUploadResponseSchema,
} from "@ppt-digital-human/contracts";
import { createApplication } from "./app.ts";
import { clearProductState, createProductPrismaClient } from "./database.ts";

const databaseUrl = process.env.PPT_DH_DATABASE_URL ?? process.env.PPT_DH_T0_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("PPT_DH_DATABASE_URL is required for stage T-A integration tests.");
}

const prisma = createProductPrismaClient(databaseUrl);
const internalToken = "stage-ta-integration-token";
const principal = "internal-test-user";
let assetRoot = "";
let baseUrl = "";
let server: ReturnType<typeof serve>;
let fixture: Uint8Array;

before(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "ppt-dh-stage-ta-"));
  const fixturePath = process.env.PPT_DH_TRACER_FIXTURE
    ? resolve(process.env.PPT_DH_TRACER_FIXTURE)
    : fileURLToPath(new URL("../tests/fixtures/tracer-3.pptx", import.meta.url));
  fixture = await readFile(fixturePath);
  const app = createApplication({ prisma, assetRoot, internalToken });
  server = serve({ fetch: app.fetch, port: 0 });
  if (!server.listening) {
    await once(server, "listening");
  }
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

function uploadForm(title = "导数的概念"): FormData {
  const form = new FormData();
  const bytes = fixture.buffer.slice(
    fixture.byteOffset,
    fixture.byteOffset + fixture.byteLength,
  ) as ArrayBuffer;
  form.set("title", title);
  form.set(
    "file",
    new File([bytes], "导数前三页.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
  );
  return form;
}

function internalHeaders(key?: string, selectedPrincipal = principal): HeadersInit {
  return {
    "X-Internal-Token": internalToken,
    "X-Principal": selectedPrincipal,
    ...(key ? { "Idempotency-Key": key } : {}),
  };
}

test("HTTP upload persists one project, task and outbox without exposing internal paths", async () => {
  const first = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: internalHeaders("upload-stage-ta-001"),
    body: uploadForm(),
  });
  assert.equal(first.status, 201);
  const firstBody = TracerUploadResponseSchema.parse(await first.json());
  assert.equal(firstBody.data.created, true);
  assert.equal(firstBody.data.task.status, "QUEUED");
  assert.equal(await prisma.project.count(), 1);
  assert.equal(await prisma.generationTask.count(), 1);
  assert.equal(await prisma.taskOutbox.count(), 1);
  assert(!/storageKey|backend[\\/]|[A-Z]:\\/i.test(JSON.stringify(firstBody)));

  const duplicate = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: internalHeaders("upload-stage-ta-001"),
    body: uploadForm(),
  });
  assert.equal(duplicate.status, 200);
  const duplicateBody = TracerUploadResponseSchema.parse(await duplicate.json());
  assert.equal(duplicateBody.data.created, false);
  assert.equal(duplicateBody.data.task.id, firstBody.data.task.id);
  assert.equal(await prisma.project.count(), 1);

  const taskResponse = await fetch(`${baseUrl}/v1/tasks/${firstBody.data.task.id}`, {
    headers: internalHeaders(),
  });
  assert.equal(taskResponse.status, 200);
  TracerTaskResponseSchema.parse(await taskResponse.json());
});

test("same key with another payload conflicts and another principal cannot read the task", async () => {
  const created = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: internalHeaders("upload-stage-ta-002"),
    body: uploadForm(),
  });
  const createdBody = TracerUploadResponseSchema.parse(await created.json());

  const conflict = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: internalHeaders("upload-stage-ta-002"),
    body: uploadForm("被修改的标题"),
  });
  assert.equal(conflict.status, 409);
  assert.equal(ApiErrorSchema.parse(await conflict.json()).error.code, "IDEMPOTENCY_KEY_REUSED");

  const hidden = await fetch(`${baseUrl}/v1/tasks/${createdBody.data.task.id}`, {
    headers: internalHeaders(undefined, "another-internal-user"),
  });
  assert.equal(hidden.status, 404);
  assert.equal(ApiErrorSchema.parse(await hidden.json()).error.code, "TASK_NOT_FOUND");
});

test("invalid ZIP content is rejected before persistence", async () => {
  const form = new FormData();
  form.set("title", "损坏课件");
  form.set(
    "file",
    new File(["not-a-pptx"], "损坏.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
  );
  const response = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: internalHeaders("upload-stage-ta-invalid"),
    body: form,
  });
  assert.equal(response.status, 422);
  assert.equal(ApiErrorSchema.parse(await response.json()).error.code, "INVALID_PPTX_STRUCTURE");
  assert.equal(await prisma.project.count(), 0);
});

test("truncated legacy PPT is rejected before persistence", async () => {
  const form = new FormData();
  form.set("title", "旧版导数课件");
  form.set(
    "file",
    new File(
      [new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])],
      "旧版导数课件.ppt",
      { type: "application/vnd.ms-powerpoint" },
    ),
  );
  const response = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: internalHeaders("upload-stage-4-legacy"),
    body: form,
  });
  assert.equal(response.status, 422);
  const body = ApiErrorSchema.parse(await response.json());
  assert.equal(body.error.code, "INVALID_PPT_STRUCTURE");
  assert.equal(await prisma.project.count(), 0);
});

test("extension and MIME mismatch is rejected before persistence", async () => {
  const form = uploadForm();
  const file = form.get("file");
  assert(file instanceof File);
  form.set(
    "file",
    new File([await file.arrayBuffer()], file.name, {
      type: "application/vnd.ms-powerpoint",
    }),
  );
  const response = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: internalHeaders("upload-stage-4-spoof"),
    body: form,
  });
  assert.equal(response.status, 400);
  assert.equal(ApiErrorSchema.parse(await response.json()).error.code, "INVALID_REQUEST");
  assert.equal(await prisma.project.count(), 0);
});

test("encrypted PPTX returns a distinct actionable error", async () => {
  const encrypted = Uint8Array.from(fixture);
  let centralOffset = -1;
  for (let index = 0; index < encrypted.byteLength - 4; index += 1) {
    if (
      encrypted[index] === 0x50 &&
      encrypted[index + 1] === 0x4b &&
      encrypted[index + 2] === 0x01 &&
      encrypted[index + 3] === 0x02
    ) {
      centralOffset = index;
      break;
    }
  }
  assert(centralOffset >= 0);
  encrypted[centralOffset + 8] |= 0x01;
  const form = new FormData();
  form.set("title", "加密课件");
  form.set(
    "file",
    new File([encrypted], "加密课件.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
  );
  const response = await fetch(`${baseUrl}/v1/projects`, {
    method: "POST",
    headers: internalHeaders("upload-stage-4-encrypted"),
    body: form,
  });
  assert.equal(response.status, 422);
  const body = ApiErrorSchema.parse(await response.json());
  assert.equal(body.error.code, "ENCRYPTED_PPTX");
  assert.match(body.error.message, /取消密码保护/);
  assert.equal(await prisma.project.count(), 0);
});
