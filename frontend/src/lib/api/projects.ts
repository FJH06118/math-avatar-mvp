import type {
  CreateProjectInput,
  MockRequestOptions,
  Project,
  ProjectCopyInput,
  ProjectListQuery,
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
import {
  archiveRealProject,
  copyRealProject,
  deleteRealProject,
  getRealProject,
  listRealProjects,
  updateRealTeachingSettings,
} from "./real-tracer";
import { normalizeSupportedTeachingSettings } from "./teaching-settings";
import { isRealTracerApiMode } from "./tracer-adapter";

function realProjectsEnabled(): boolean {
  return isRealTracerApiMode();
}

export async function listProjects(
  query: Partial<ProjectListQuery> = {},
  options: MockRequestOptions = {},
): Promise<Project[]> {
  if (realProjectsEnabled()) return listRealProjects(query, options.signal);
  await simulateRequest(options, 650);
  const search = query.search?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const projects = parseProjects(
    [...mockDb.projects.values()]
      .filter((project) => query.includeArchived || project.status !== "archived")
      .filter((project) => !query.status || project.status === query.status)
      .filter(
        (project) =>
          !search ||
          project.title.toLocaleLowerCase("zh-CN").includes(search) ||
          project.fileName.toLocaleLowerCase("zh-CN").includes(search),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((project) => structuredClone(project)),
  );
  return projects;
}

export async function getProject(
  projectId: string,
  options: MockRequestOptions = {},
): Promise<Project> {
  if (realProjectsEnabled()) return getRealProject(projectId, options.signal);
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
  if (realProjectsEnabled()) {
    const project = await getRealProject(projectId, options.signal);
    return updateRealTeachingSettings(
      project.id,
      project.version,
      settings,
      options.signal,
    );
  }
  await simulateRequest(options, 420);
  const id = ProjectIdSchema.parse(projectId);
  const project = requireRecord(mockDb.projects.get(id), "项目");
  project.settings = parseTeachingSettings(normalizeSupportedTeachingSettings(settings));
  project.version += 1;
  project.updatedAt = new Date().toISOString();
  return parseTeachingSettings(structuredClone(project.settings));
}

export async function deleteProject(
  projectId: string,
  expectedVersion?: number,
  options: MockRequestOptions = {},
): Promise<void> {
  if (realProjectsEnabled()) {
    if (expectedVersion === undefined) throw new Error("删除项目需要当前版本。");
    return deleteRealProject(projectId, expectedVersion, options.signal);
  }
  await simulateRequest(options, 480);
  const id = ProjectIdSchema.parse(projectId);
  const project = requireRecord(mockDb.projects.get(id), "项目");
  if (expectedVersion !== undefined && project.version !== expectedVersion) {
    throw new Error("项目已更新，请刷新后重试。");
  }
  mockDb.projects.delete(id);
  for (const [slideId, slide] of mockDb.slides) {
    if (slide.projectId === id) {
      mockDb.slides.delete(slideId);
    }
  }
}

export async function archiveProject(
  projectId: string,
  expectedVersion: number,
  options: MockRequestOptions = {},
): Promise<Project> {
  if (realProjectsEnabled()) {
    return archiveRealProject(projectId, expectedVersion, options.signal);
  }
  await simulateRequest(options, 420);
  const id = ProjectIdSchema.parse(projectId);
  const project = requireRecord(mockDb.projects.get(id), "项目");
  if (project.version !== expectedVersion) {
    throw new Error("项目已更新，请刷新后重试。");
  }
  project.status = "archived";
  project.version += 1;
  project.updatedAt = new Date().toISOString();
  return parseProject(structuredClone(project));
}

export async function copyProject(
  projectId: string,
  input: ProjectCopyInput,
  options: MockRequestOptions = {},
): Promise<Project> {
  if (realProjectsEnabled()) {
    return copyRealProject(projectId, input, options.signal);
  }
  await simulateRequest(options, 520);
  const id = ProjectIdSchema.parse(projectId);
  const source = requireRecord(mockDb.projects.get(id), "项目");
  const timestamp = new Date().toISOString();
  const copied = parseProject({
    ...structuredClone(source),
    id: crypto.randomUUID(),
    title: input.title ?? `${source.title}（副本）`,
    status: "parsing",
    slideCount: 0,
    parsingJobId: undefined,
    renderJobId: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
  mockDb.projects.set(copied.id, copied);
  return structuredClone(copied);
}
