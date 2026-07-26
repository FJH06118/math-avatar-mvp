import type {
  CreateProjectInput,
  MockRequestOptions,
  Project,
  TeachingSettings,
  UpdateProjectInput,
} from "@/types";

import {
  getDefaultTeachingSettings,
  mockDb,
} from "./mock-client";
import { requireRecord, simulateRequest } from "./shared";

export async function listProjects(
  options: MockRequestOptions = {},
): Promise<Project[]> {
  await simulateRequest(options, 650);
  return [...mockDb.projects.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((project) => structuredClone(project));
}

export async function getProject(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<Project> {
  await simulateRequest(options, 420);
  return structuredClone(
    requireRecord(mockDb.projects.get(projectId), "项目"),
  );
}

export async function createProject(
  input: CreateProjectInput,
  options: MockRequestOptions = {},
): Promise<Project> {
  await simulateRequest(options, 600);
  const timestamp = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    title: input.title,
    status: "parsing",
    fileName: input.fileName,
    slideCount: 0,
    uploadedFileId: input.uploadedFileId,
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: getDefaultTeachingSettings(),
  };
  mockDb.projects.set(project.id, project);
  return structuredClone(project);
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
  options: MockRequestOptions = {},
): Promise<Project> {
  await simulateRequest(options, 380);
  const project = requireRecord(mockDb.projects.get(projectId), "项目");
  if (input.title !== undefined) {
    project.title = input.title;
  }
  project.updatedAt = new Date().toISOString();
  return structuredClone(project);
}

export async function updateTeachingSettings(
  projectId: string,
  settings: TeachingSettings,
  options: MockRequestOptions = {},
): Promise<TeachingSettings> {
  await simulateRequest(options, 420);
  const project = requireRecord(mockDb.projects.get(projectId), "项目");
  project.settings = structuredClone(settings);
  project.updatedAt = new Date().toISOString();
  return structuredClone(project.settings);
}

export async function deleteProject(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<void> {
  await simulateRequest(options, 480);
  requireRecord(mockDb.projects.get(projectId), "项目");
  mockDb.projects.delete(projectId);
  for (const [slideId, slide] of mockDb.slides) {
    if (slide.projectId === projectId) {
      mockDb.slides.delete(slideId);
    }
  }
}
