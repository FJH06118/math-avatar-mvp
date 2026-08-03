-- Prisma cannot express these PostgreSQL partial unique indexes. They make the
-- logical step key unique whether `slideId` is NULL (task-scoped) or populated.
CREATE UNIQUE INDEX "T0TaskStep_task_stage_without_slide_key"
ON "T0TaskStep" ("taskId", "stage")
WHERE "slideId" IS NULL;

CREATE UNIQUE INDEX "T0TaskStep_task_stage_with_slide_key"
ON "T0TaskStep" ("taskId", "stage", "slideId")
WHERE "slideId" IS NOT NULL;
