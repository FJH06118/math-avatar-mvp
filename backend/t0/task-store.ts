import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.ts";

export interface CreateT0TaskInput {
  principal: string;
  kind: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super("The idempotency key was already used with a different payload.");
    this.name = "IdempotencyKeyReusedError";
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalizeJson(nestedValue)]),
    );
  }
  return value;
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(payload)))
    .digest("hex");
}

function stableStepId(taskId: string, stage: string, slideId: string | null): string {
  return createHash("sha256")
    .update(`${taskId}:${stage}:${slideId ?? "task"}`)
    .digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function createTaskWithOutbox(
  prisma: PrismaClient,
  input: CreateT0TaskInput,
): Promise<{ taskId: string; created: boolean }> {
  const inputHash = hashPayload(input.payload);
  const existing = await prisma.t0Task.findFirst({
    where: {
      principal: input.principal,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
    },
  });

  if (existing) {
    if (existing.inputHash !== inputHash) {
      throw new IdempotencyKeyReusedError();
    }
    return { taskId: existing.id, created: false };
  }

  const taskId = randomUUID();
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.t0Task.create({
        data: {
          id: taskId,
          principal: input.principal,
          kind: input.kind,
          idempotencyKey: input.idempotencyKey,
          inputHash,
          status: "QUEUED",
        },
      });
      await transaction.t0Outbox.create({
        data: {
          id: randomUUID(),
          taskId,
          eventKey: `t0.task.created:${taskId}`,
          eventType: "T0_STEP",
          payload: input.payload,
        },
      });
    });
    return { taskId, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const concurrentTask = await prisma.t0Task.findFirst({
      where: {
        principal: input.principal,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (!concurrentTask) {
      throw error;
    }
    if (concurrentTask.inputHash !== inputHash) {
      throw new IdempotencyKeyReusedError();
    }
    return { taskId: concurrentTask.id, created: false };
  }
}

export async function deliverOutboxEvent(
  prisma: PrismaClient,
  eventId: string,
): Promise<string> {
  const event = await prisma.t0Outbox.findUniqueOrThrow({ where: { id: eventId } });
  const taskStepId = stableStepId(event.taskId, "T0_PROBE", null);

  await prisma.$transaction(async (transaction) => {
    await transaction.t0TaskStep.upsert({
      where: { id: taskStepId },
      update: {},
      create: {
        id: taskStepId,
        taskId: event.taskId,
        stage: "T0_PROBE",
        status: "QUEUED",
      },
    });
    if (!event.publishedAt) {
      await transaction.t0Outbox.update({
        where: { id: event.id },
        data: { publishedAt: new Date() },
      });
    }
  });

  return taskStepId;
}
