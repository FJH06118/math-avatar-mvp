import { z } from "zod";

import { createApiSuccessSchema } from "./api";
import { LessonPlanRevisionSchema } from "./lesson-plan";
import { ParsedSlideSummarySchema } from "./parse";

export const WorkspaceSlideSchema = z
  .object({
    parsed: ParsedSlideSummarySchema,
    currentRevision: LessonPlanRevisionSchema.optional(),
    isLocked: z.boolean(),
  })
  .strict();

export const WorkspaceSnapshotSchema = z
  .object({ slides: z.array(WorkspaceSlideSchema).max(100) })
  .strict();

export const WorkspaceSnapshotResponseSchema = createApiSuccessSchema(
  WorkspaceSnapshotSchema,
);

export const WorkspaceLockInputSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    locked: z.boolean(),
  })
  .strict();

export const WorkspaceLockResultSchema = z
  .object({ revisionId: z.string().min(1), revision: z.number().int().min(1), locked: z.boolean() })
  .strict();

export const WorkspaceLockResponseSchema = createApiSuccessSchema(
  WorkspaceLockResultSchema,
);

export type WorkspaceSlide = z.infer<typeof WorkspaceSlideSchema>;
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;
export type WorkspaceLockInput = z.infer<typeof WorkspaceLockInputSchema>;
