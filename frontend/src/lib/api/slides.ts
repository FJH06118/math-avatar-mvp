import type {
  MockRequestOptions,
  ParsedSlide,
  UpdateSlideScriptInput,
} from "@/types";

import { mockDb } from "./mock-client";
import { requireRecord, simulateRequest } from "./shared";

export async function listSlides(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<ParsedSlide[]> {
  await simulateRequest(options, 620);
  requireRecord(mockDb.projects.get(projectId), "项目");
  return [...mockDb.slides.values()]
    .filter((slide) => slide.projectId === projectId)
    .sort((a, b) => a.index - b.index)
    .map((slide) => structuredClone(slide));
}

export async function updateSlideScript(
  slideId: string,
  input: UpdateSlideScriptInput,
  options: MockRequestOptions = {},
): Promise<ParsedSlide> {
  await simulateRequest(options, 460);
  const slide = requireRecord(mockDb.slides.get(slideId), "幻灯片");
  slide.teachingScript = input.teachingScript;
  slide.updatedAt = new Date().toISOString();
  const project = mockDb.projects.get(slide.projectId);
  if (project) {
    project.updatedAt = slide.updatedAt;
  }
  return structuredClone(slide);
}
