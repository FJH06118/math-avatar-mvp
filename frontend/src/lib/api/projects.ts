import type {
  CreateProjectInput,
  MockRequestOptions,
  Project,
  TeachingSettings,
  UpdateProjectInput,
} from "@/types";
import { ProjectIdSchema } from "@ppt-digital-human/contracts";

import {
  getDefaultTeachingSettings,
  mockDb,
} from "./mock-client";
import {
  parseCreateProjectInput,
  parseProject,
  parseProjects,
  parseTeachingSettings,
  parseUpdateProjectInput,
} from "./contracts";
import { requireRecord, simulateRequest } from "./shared";

export async function listProjects(
  options: MockRequestOptions = {},
): Promise<Project[]> {
  await simulateRequest(options, 650);
  return parseProjects(
    [...mockDb.projects.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((project) => structuredClone(project)),
  );
}

export async function getProject(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<Project> {
  await simulateRequest(options, 420);
  const id = ProjectIdSchema.parse(projectId);
  return parseProject(structuredClone(requireRecord(mockDb.projects.get(id), "项目")));
}

export async function createProject(
  input: CreateProjectInput,
  options: MockRequestOptions = {},
): Promise<Project> {
  await simulateRequest(options, 600);
  const validInput = parseCreateProjectInput(input);
  const timestamp = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    title: validInput.title,
    status: "parsing",
    fileName: validInput.fileName,
    slideCount: 0,
    uploadedFileId: validInput.uploadedFileId,
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: getDefaultTeachingSettings(),
    version: 1,
  };
  const validatedProject = parseProject(project);
  mockDb.projects.set(validatedProject.id, validatedProject);
  return structuredClone(validatedProject);
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
  options: MockRequestOptions = {},
): Promise<Project> {
  await simulateRequest(options, 380);
  const id = ProjectIdSchema.parse(projectId);
  const validInput = parseUpdateProjectInput(input);
  const project = requireRecord(mockDb.projects.get(id), "项目");
  if (validInput.title !== undefined) {
    project.title = validInput.title;
  }
  project.version += 1;
  project.updatedAt = new Date().toISOString();
  return parseProject(structuredClone(project));
}

export async function updateTeachingSettings(
  projectId: string,
  settings: TeachingSettings,
  options: MockRequestOptions = {},
): Promise<TeachingSettings> {
  await simulateRequest(options, 420);
  const id = ProjectIdSchema.parse(projectId);
  const project = requireRecord(mockDb.projects.get(id), "项目");
  project.settings = parseTeachingSettings(settings);
  project.version += 1;
  project.updatedAt = new Date().toISOString();
  return parseTeachingSettings(structuredClone(project.settings));
}

export async function deleteProject(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<void> {
  await simulateRequest(options, 480);
  const id = ProjectIdSchema.parse(projectId);
  requireRecord(mockDb.projects.get(id), "项目");
  mockDb.projects.delete(id);
  for (const [slideId, slide] of mockDb.slides) {
    if (slide.projectId === id) {
      mockDb.slides.delete(slideId);
    }
  }
}
