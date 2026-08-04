import type {
  MockRequestOptions,
  ParsedSlide,
  UpdateSlideScriptInput,
} from "@/types";
import { ProjectIdSchema, SlideIdSchema } from "@ppt-digital-human/contracts";
import type { WorkspaceSlide } from "@ppt-digital-human/contracts";

import { mockDb } from "./mock-client";
import {
  parseSlide,
  parseSlides,
  parseUpdateSlideScriptInput,
} from "./contracts";
import { requireRecord, simulateRequest } from "./shared";
import { getEnabledTracerApiAdapter } from "./tracer-adapter";
import { getRealProject, RealApiError } from "./real-tracer";

const realSlideProjects = new Map<string, string>();

function workspaceSlideToParsed(
  item: WorkspaceSlide,
  updatedAt: string,
): ParsedSlide {
  const revision = item.currentRevision;
  const isSkipped = revision?.scenes.every((scene) => scene.isSkipped) ?? false;
  return parseSlide({
    id: item.parsed.id,
    projectId: item.parsed.projectId,
    presentationId: item.parsed.presentationId,
    slideNumber: item.parsed.slideNumber,
    title: item.parsed.title,
    summary:
      (revision?.teachingGoal ?? item.parsed.extractedText.slice(0, 5_000)) ||
      "待生成讲稿",
    extractedText: item.parsed.extractedText,
    teachingScript:
      revision?.narration.map((segment) => segment.displayText).join("\n\n") ?? "待生成讲稿",
    originalPageUrl: item.parsed.originalPage.url,
    sourceAssetId: item.parsed.originalPage.assetId,
    renderAssetId: item.parsed.originalPage.assetId,
    formulas: item.parsed.formulas,
    criticalRegions: [],
    safeRegions: [],
    parseConfidence: item.parsed.parseConfidence,
    parseWarnings: item.parsed.parseWarnings,
    isSkipped,
    skipReason: isSkipped ? "当前讲稿修订已跳过本页" : undefined,
    revision: revision?.revision ?? 1,
    lessonPlanRevisionId: revision?.id,
    lessonPlanRevision: revision?.revision,
    lessonPlanApproval: revision?.approval.status,
    preservationMode: revision?.preservationMode,
    derivationSteps: revision?.derivation.map((step) => step.explanation) ?? [],
    sceneCount: revision?.scenes.length ?? 0,
    isLocked: item.isLocked,
    updatedAt: revision?.createdAt ?? updatedAt,
  });
}

export async function listSlides(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<ParsedSlide[]> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    const id = ProjectIdSchema.parse(projectId);
    const [project, workspace] = await Promise.all([
      getRealProject(id, options.signal),
      realAdapter.getWorkspace(id, options.signal),
    ]);
    return workspace.slides.map((slide) => {
      realSlideProjects.set(slide.parsed.id, id);
      return workspaceSlideToParsed(slide, project.updatedAt);
    });
  }
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
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    const id = SlideIdSchema.parse(slideId);
    const validInput = parseUpdateSlideScriptInput(input);
    const projectId = await findRealSlideProjectId(id, options.signal);
    const workspace = await realAdapter.getWorkspace(projectId, options.signal);
    const item = workspace.slides.find((candidate) => candidate.parsed.id === id);
    const revision = item?.currentRevision;
    if (!item || !revision) {
      throw new RealApiError("该页还没有可编辑讲稿。", "REVISION_NOT_FOUND", false);
    }
    await realAdapter.reviseLessonPlan(
      revision.id,
      {
        expectedRevision: revision.revision,
        teachingGoal: revision.teachingGoal,
        narration: [{
          id: revision.narration[0]?.id ?? `narration_${id}`,
          displayText: validInput.teachingScript,
          spokenText: validInput.teachingScript,
        }],
        derivation: revision.derivation,
        scenes: revision.scenes,
        preservationMode: revision.preservationMode,
        estimatedDurationMs: revision.estimatedDurationMs,
      },
      options.signal,
    );
    const refreshed = await realAdapter.getWorkspace(projectId, options.signal);
    const updated = refreshed.slides.find((candidate) => candidate.parsed.id === id);
    if (!updated) throw new RealApiError("保存后无法读取该页。", "SLIDE_NOT_FOUND", true);
    return workspaceSlideToParsed(updated, new Date().toISOString());
  }
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

export async function setSlideLocked(
  slide: ParsedSlide,
  locked: boolean,
  options: MockRequestOptions = {},
): Promise<boolean> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (realAdapter) {
    if (!slide.lessonPlanRevisionId || !slide.lessonPlanRevision) {
      throw new RealApiError("该页还没有可锁定讲稿。", "REVISION_NOT_FOUND", false);
    }
    return realAdapter.setRevisionLocked(
      slide.lessonPlanRevisionId,
      slide.lessonPlanRevision,
      locked,
      options.signal,
    );
  }
  const record = requireRecord(mockDb.slides.get(SlideIdSchema.parse(slide.id)), "幻灯片");
  record.isLocked = locked;
  return locked;
}

export async function approveSlideRevision(
  slide: ParsedSlide,
  options: MockRequestOptions = {},
): Promise<void> {
  const realAdapter = getEnabledTracerApiAdapter();
  if (!realAdapter) return;
  if (!slide.lessonPlanRevisionId || !slide.lessonPlanRevision) {
    throw new RealApiError("该页还没有可批准讲稿。", "REVISION_NOT_FOUND", false);
  }
  await realAdapter.approveLessonPlan(
    slide.lessonPlanRevisionId,
    slide.lessonPlanRevision,
    options.signal,
  );
}

async function findRealSlideProjectId(
  slideId: string,
  signal?: AbortSignal,
): Promise<string> {
  void signal;
  const projectId = realSlideProjects.get(slideId);
  if (projectId) return projectId;
  throw new RealApiError("幻灯片不存在。", "SLIDE_NOT_FOUND", false);
}
