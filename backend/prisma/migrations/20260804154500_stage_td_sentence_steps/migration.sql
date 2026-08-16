-- AUDIO uses one durable step per narration segment, including multiple segments on one slide.
DROP INDEX "GenerationTaskStep_task_stage_with_slide_key";
CREATE UNIQUE INDEX "GenerationTaskStep_task_stage_slide_input_key"
  ON "GenerationTaskStep"("taskId", "stage", "slideId", "inputHash") WHERE "slideId" IS NOT NULL;
