import { createHash } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.ts";

function stableStepId(taskId: string, stage: "PARSE" | "PLAN" | "AUDIO" | "PAGE_RENDER" | "COMPOSITE", unit = "task"): string {
  return `step_${createHash("sha256").update(`${taskId}:${stage}:${unit}`).digest("hex")}`;
}

export async function dispatchOutboxEvent(prisma: PrismaClient, eventId: string): Promise<string> {
  const event = await prisma.taskOutbox.findUniqueOrThrow({
    where: { id: eventId },
    include: { task: true },
  });
  const stage = event.eventType === "PARSE_REQUESTED" ? "PARSE" : event.eventType === "PLAN_REQUESTED" ? "PLAN" : event.eventType === "AUDIO_REQUESTED" ? "AUDIO" : event.eventType === "RENDER_REQUESTED" ? "PAGE_RENDER" : event.eventType === "COMPOSITE_REQUESTED" ? "COMPOSITE" : null;
  if (!stage) {
    throw new Error(`Unsupported product outbox event: ${event.eventType}`);
  }
  if (stage === "AUDIO") {
    const payload = event.payload as { segments?: Array<{ narrationId?: string; slideId?: string; inputHash?: string }> };
    if (!Array.isArray(payload.segments) || payload.segments.length === 0 || payload.segments.some((item) => !item.narrationId || !item.slideId || !item.inputHash)) {
      throw new Error("AUDIO_REQUESTED payload is invalid.");
    }
    await prisma.$transaction(async (transaction) => {
      for (const segment of payload.segments!) {
        await transaction.generationTaskStep.upsert({
          where: { id: stableStepId(event.taskId, stage, segment.narrationId!) },
          update: {},
          create: {
            id: stableStepId(event.taskId, stage, segment.narrationId!),
            taskId: event.taskId,
            stage,
            slideId: segment.slideId,
            status: "QUEUED",
            inputHash: segment.inputHash!,
          },
        });
      }
      if (!event.publishedAt) await transaction.taskOutbox.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
    });
    return stableStepId(event.taskId, stage, payload.segments[0].narrationId!);
  }
  if (stage === "PAGE_RENDER") {
    const payload = event.payload as { pages?: Array<{ slideId?: string; inputHash?: string }> };
    if (!Array.isArray(payload.pages) || payload.pages.length === 0 || payload.pages.some((page) => !page.slideId || !page.inputHash)) throw new Error("RENDER_REQUESTED payload is invalid.");
    await prisma.$transaction(async (transaction) => {
      for (const page of payload.pages!) {
        const id = stableStepId(event.taskId, stage, page.slideId!);
        await transaction.generationTaskStep.upsert({ where: { id }, update: {}, create: { id, taskId: event.taskId, stage, slideId: page.slideId, status: "QUEUED", inputHash: page.inputHash! } });
      }
      if (!event.publishedAt) await transaction.taskOutbox.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
    });
    return stableStepId(event.taskId, stage, payload.pages[0].slideId!);
  }
  const stepId = stableStepId(event.taskId, stage);
  await prisma.$transaction(async (transaction) => {
    await transaction.generationTaskStep.upsert({
      where: { id: stepId },
      update: {},
      create: {
        id: stepId,
        taskId: event.taskId,
        stage,
        status: "QUEUED",
        inputHash: event.task.inputHash,
      },
    });
    if (!event.publishedAt) {
      await transaction.taskOutbox.update({
        where: { id: event.id },
        data: { publishedAt: new Date() },
      });
    }
  });
  return stepId;
}

export async function dispatchPendingOutbox(prisma: PrismaClient, limit = 20): Promise<number> {
  const pending = await prisma.taskOutbox.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const event of pending) {
    await dispatchOutboxEvent(prisma, event.id);
  }
  return pending.length;
}
