import type {
  MockRequestOptions,
  ParsedSlide,
  UpdateSlideScriptInput,
} from "@/types";
import { ProjectIdSchema, SlideIdSchema } from "@ppt-digital-human/contracts";

import { mockDb } from "./mock-client";
import {
  parseSlide,
  parseSlides,
  parseUpdateSlideScriptInput,
} from "./contracts";
import { requireRecord, simulateRequest } from "./shared";

export async function listSlides(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<ParsedSlide[]> {
  await simulateRequest(options, 620);
  const id = ProjectIdSchema.parse(projectId);
  requireRecord(mockDb.projects.get(id), "项目");
  return parseSlides(
    [...mockDb.slides.values()]
      .filter((slide) => slide.projectId === id)
      .sort((a, b) => a.slideNumber - b.slideNumber)
      .map((slide) => structuredClone(slide)),
  );
}

export async function updateSlideScript(
  slideId: string,
  input: UpdateSlideScriptInput,
  options: MockRequestOptions = {},
): Promise<ParsedSlide> {
  await simulateRequest(options, 460);
  const id = SlideIdSchema.parse(slideId);
  const validInput = parseUpdateSlideScriptInput(input);
  const slide = requireRecord(mockDb.slides.get(id), "幻灯片");
  slide.teachingScript = validInput.teachingScript;
  slide.updatedAt = new Date().toISOString();
  const project = mockDb.projects.get(slide.projectId);
  if (project) {
    project.updatedAt = slide.updatedAt;
  }
  return parseSlide(structuredClone(slide));
}
