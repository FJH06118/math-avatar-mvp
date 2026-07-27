import type {
  Avatar,
  Job,
  JobStage,
  JobType,
  ParsedSlide,
  Project,
  RenderResult,
  TeachingSettings,
  UploadedFile,
  Voice,
} from "@/types";

const DEFAULT_SETTINGS: TeachingSettings = {
  avatarId: "avatar-lin",
  voiceId: "voice-qinghe",
  speechRate: 1,
  captionsEnabled: true,
  captionStyle: "clear",
  avatarPosition: "right",
  background: "light",
};

export const demoRenderAssets = {
  videoUrl: undefined,
  posterUrl: "/images/math-course-editorial.webp",
  srtUrl:
    "data:text/plain;charset=utf-8,1%0A00%3A00%3A00%2C000%20--%3E%2000%3A00%3A04%2C000%0A%E6%AC%A2%E8%BF%8E%E6%9D%A5%E5%88%B0%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E8%AF%BE%E5%A0%82%E3%80%82",
  captionTrackUrl:
    "data:text/vtt;charset=utf-8,WEBVTT%0A%0A00%3A00.000%20--%3E%2000%3A04.000%0A%E6%AC%A2%E8%BF%8E%E6%9D%A5%E5%88%B0%E9%AB%98%E7%AD%89%E6%95%B0%E5%AD%A6%E8%AF%BE%E5%A0%82%E3%80%82",
} as const;

const now = new Date();
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

const seedProjects: Project[] = [
  {
    id: "project-limit",
    title: "函数极限与连续性",
    status: "ready",
    fileName: "高等数学_函数极限.pptx",
    slideCount: 8,
    createdAt: minutesAgo(1_540),
    updatedAt: minutesAgo(18),
    uploadedFileId: "file-limit",
    settings: { ...DEFAULT_SETTINGS },
  },
  {
    id: "project-derivative",
    title: "导数的几何意义",
    status: "completed",
    fileName: "导数的几何意义.pptx",
    slideCount: 6,
    createdAt: minutesAgo(5_200),
    updatedAt: minutesAgo(280),
    uploadedFileId: "file-derivative",
    renderJobId: "seed-render-derivative",
    settings: { ...DEFAULT_SETTINGS, avatarPosition: "left" },
  },
];

const seedRenderResults: RenderResult[] = [
  {
    id: "result-derivative",
    projectId: "project-derivative",
    jobId: "seed-render-derivative",
    title: "导数的几何意义",
    videoUrl: demoRenderAssets.videoUrl,
    posterUrl: demoRenderAssets.posterUrl,
    captionTrackUrl: demoRenderAssets.captionTrackUrl,
    mp4Url: demoRenderAssets.videoUrl,
    srtUrl: demoRenderAssets.srtUrl,
    durationSeconds: 276,
    fileSizeBytes: 78_200_000,
    resolution: "1920 × 1080",
    generatedAt: minutesAgo(280),
    assetsAvailable: false,
  },
];

const seedSlides: ParsedSlide[] = [
  {
    id: "slide-limit-1",
    projectId: "project-limit",
    index: 0,
    title: "函数极限的直观认识",
    summary: "从函数图像和自变量趋近过程理解极限。",
    extractedText:
      "当自变量 x 无限接近 x₀ 时，函数值 f(x) 无限接近常数 A，则称 A 为函数在 x₀ 处的极限。",
    teachingScript:
      "同学们好，这一页我们先从图像直观理解函数极限。请观察当横坐标逐渐靠近 x₀ 时，函数图像上的点如何靠近高度 A。",
    formulas: [
      {
        id: "formula-limit-1",
        latex: "\\lim_{x \\to x_0} f(x) = A",
        spokenText: "当 x 趝近 x 零时，f x 的极限等于 A。",
        status: "valid",
      },
    ],
    updatedAt: minutesAgo(18),
  },
  {
    id: "slide-limit-2",
    projectId: "project-limit",
    index: 1,
    title: "左右极限",
    summary: "区分从左侧和右侧趋近时的函数行为。",
    extractedText:
      "左极限和右极限都存在且相等，是函数极限存在的必要且充分条件。",
    teachingScript:
      "接下来把趋近方向分开讨论。从小于 x₀ 的一侧靠近得到左极限，从大于 x₀ 的一侧靠近得到右极限。",
    formulas: [
      {
        id: "formula-limit-2",
        latex:
          "\\lim_{x \\to x_0^-} f(x)=\\lim_{x \\to x_0^+} f(x)=A",
        spokenText: "左极限与右极限都等于 A。",
        status: "warning",
        message: "建议在讲稿中先解释上标加号和减号表示的趋近方向。",
      },
    ],
    updatedAt: minutesAgo(18),
  },
  {
    id: "slide-limit-3",
    projectId: "project-limit",
    index: 2,
    title: "极限运算法则",
    summary: "介绍和、差、积、商的极限运算。",
    extractedText:
      "在各极限存在且满足分母极限不为零时，可以分别进行四则运算。",
    teachingScript:
      "有了极限的定义之后，我们可以使用运算法则简化计算。需要特别注意，商的法则要求分母的极限不等于零。",
    formulas: [
      {
        id: "formula-limit-3",
        latex:
          "\\lim_{x\\to x_0}\\frac{f(x)}{g(x)}=\\frac{A}{B},\\quad B\\ne 0",
        spokenText: "f x 与 g x 的商的极限，等于 A 除以 B，其中 B 不等于零。",
        status: "valid",
      },
    ],
    updatedAt: minutesAgo(18),
  },
];

function createExtraSlide(index: number): ParsedSlide {
  return {
    id: `slide-limit-${index + 1}`,
    projectId: "project-limit",
    index,
    title: ["两个重要极限", "无穷小量", "函数的连续性", "间断点", "本节小结"][
      index - 3
    ],
    summary: "结合例题巩固本节核心概念与计算方法。",
    extractedText: "本页内容由 Mock API 提供，用于演示逐页解析和讲稿编辑。",
    teachingScript:
      "请先观察页面中的定义与例题。我们会按照条件、结论和常见错误三个层次完成这一部分的讲解。",
    formulas: [],
    updatedAt: minutesAgo(18),
  };
}

function ensureProjectSlides(projectId: string): void {
  const existingSlides = [...mockDb.slides.values()].filter(
    (slide) => slide.projectId === projectId,
  );
  if (existingSlides.length > 0) {
    return;
  }

  const templates = [...mockDb.slides.values()]
    .filter((slide) => slide.projectId === "project-limit")
    .sort((a, b) => a.index - b.index);
  for (const template of templates) {
    const slide: ParsedSlide = {
      ...structuredClone(template),
      id: crypto.randomUUID(),
      projectId,
      updatedAt: new Date().toISOString(),
      formulas: template.formulas.map((formula) => ({
        ...structuredClone(formula),
        id: crypto.randomUUID(),
      })),
    };
    mockDb.slides.set(slide.id, slide);
  }
}

interface MockJobRecord extends Job {
  startedAt: number;
  stageDurationMs: number;
  failAtProgress?: number;
}

const parsingStageTemplates = [
  ["file-check", "检查上传文件", "校验文件完整性与页面结构"],
  ["extract", "提取幻灯片", "生成每页预览与页面顺序"],
  ["text", "识别页面文本", "提取标题、正文和备注"],
  ["formula", "识别数学公式", "识别公式并生成 LaTeX"],
  ["summary", "生成页面摘要", "整理每页知识点与讲解重点"],
  ["script", "生成初始讲稿", "生成可继续编辑的逐页讲稿"],
] as const;

const renderingStageTemplates = [
  ["content", "检查课件内容", "确认讲稿、公式与页面顺序"],
  ["script", "生成授课讲稿", "整理最终讲解节奏与停顿"],
  ["voice", "生成语音", "按选定音色与语速合成语音"],
  ["avatar", "合成数字人画面", "同步口型并合成授课画面"],
  ["caption", "添加字幕", "生成并校对逐句字幕"],
  ["final", "合成最终视频", "编码 MP4 并准备下载文件"],
] as const;

function createStages(type: JobType): JobStage[] {
  const templates =
    type === "parsing" ? parsingStageTemplates : renderingStageTemplates;
  return templates.map(([id, label, description]) => ({
    id,
    label,
    description,
    status: "pending",
    progress: 0,
  }));
}

export const mockDb = {
  projects: new Map(seedProjects.map((project) => [project.id, project])),
  uploads: new Map<string, UploadedFile>(),
  slides: new Map(
    [...seedSlides, ...Array.from({ length: 5 }, (_, index) => createExtraSlide(index + 3))].map(
      (slide) => [slide.id, slide],
    ),
  ),
  avatars: [
    {
      id: "avatar-lin",
      name: "林老师",
      description: "沉稳亲切，适合概念讲解",
      genderPresentation: "female",
    },
    {
      id: "avatar-zhou",
      name: "周老师",
      description: "清晰理性，适合推导与例题",
      genderPresentation: "male",
    },
    {
      id: "avatar-yan",
      name: "严老师",
      description: "中性专业，适合正式课程",
      genderPresentation: "neutral",
    },
  ] satisfies Avatar[],
  voices: [
    {
      id: "voice-qinghe",
      name: "清和",
      description: "自然、清晰，语气平稳",
      locale: "zh-CN",
      genderPresentation: "female",
    },
    {
      id: "voice-zhiyuan",
      name: "致远",
      description: "从容、厚实，强调明确",
      locale: "zh-CN",
      genderPresentation: "male",
    },
    {
      id: "voice-mingxi",
      name: "明晰",
      description: "节奏轻快，适合例题讲解",
      locale: "zh-CN",
      genderPresentation: "neutral",
    },
  ] satisfies Voice[],
  jobs: new Map<string, MockJobRecord>(),
  renders: new Map(
    seedRenderResults.map((result) => [result.projectId, result]),
  ),
};

export function createMockJob(
  projectId: string,
  type: JobType,
  fail = false,
): Job {
  const createdAt = new Date().toISOString();
  const stages = createStages(type);
  const job: MockJobRecord = {
    id: crypto.randomUUID(),
    projectId,
    type,
    status: "running",
    progress: 0,
    currentStageId: stages[0].id,
    stages,
    createdAt,
    updatedAt: createdAt,
    startedAt: Date.now(),
    stageDurationMs: type === "parsing" ? 1_200 : 1_700,
    failAtProgress: fail ? 46 : undefined,
  };
  mockDb.jobs.set(job.id, job);
  return toPublicJob(job);
}

export function refreshMockJob(record: MockJobRecord): Job {
  if (
    record.status === "cancelled" ||
    record.status === "failed" ||
    record.status === "completed"
  ) {
    return toPublicJob(record);
  }

  const elapsed = Date.now() - record.startedAt;
  const totalDuration = record.stageDurationMs * record.stages.length;
  const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));

  if (record.failAtProgress && progress >= record.failAtProgress) {
    record.status = "failed";
    record.progress = record.failAtProgress;
    record.error =
      record.type === "parsing"
        ? "公式识别服务暂时不可用，请重新解析。"
        : "数字人画面合成失败，请重新生成。";
  } else if (progress >= 100) {
    record.status = "completed";
    record.progress = 100;
  } else {
    record.status = "running";
    record.progress = progress;
  }

  const activeIndex = Math.min(
    record.stages.length - 1,
    Math.floor((record.progress / 100) * record.stages.length),
  );
  record.stages = record.stages.map((stage, index) => {
    if (record.status === "failed" && index === activeIndex) {
      return { ...stage, status: "failed", progress: 100 };
    }
    if (index < activeIndex || record.status === "completed") {
      return { ...stage, status: "completed", progress: 100 };
    }
    if (index === activeIndex) {
      const withinStage =
        ((record.progress / 100) * record.stages.length - activeIndex) * 100;
      return {
        ...stage,
        status: "running",
        progress: Math.max(4, Math.floor(withinStage)),
      };
    }
    return { ...stage, status: "pending", progress: 0 };
  });
  record.currentStageId = record.stages[activeIndex].id;
  record.updatedAt = new Date().toISOString();

  const project = mockDb.projects.get(record.projectId);
  if (project) {
    project.status =
      record.status === "completed"
        ? record.type === "parsing"
          ? "ready"
          : "completed"
        : record.status === "failed"
          ? "failed"
          : record.type === "parsing"
            ? "parsing"
            : "rendering";
    project.updatedAt = record.updatedAt;
    if (record.status === "completed" && record.type === "parsing") {
      ensureProjectSlides(record.projectId);
      project.slideCount = [...mockDb.slides.values()].filter(
        (slide) => slide.projectId === record.projectId,
      ).length;
    }
  }

  return toPublicJob(record);
}

export function toPublicJob(record: MockJobRecord): Job {
  return structuredClone({
    id: record.id,
    projectId: record.projectId,
    type: record.type,
    status: record.status,
    progress: record.progress,
    currentStageId: record.currentStageId,
    stages: record.stages,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    error: record.error,
  });
}

export function getMockJobRecord(jobId: string): MockJobRecord | undefined {
  return mockDb.jobs.get(jobId);
}

export function resetMockJob(record: MockJobRecord): Job {
  record.status = "running";
  record.progress = 0;
  record.error = undefined;
  record.failAtProgress = undefined;
  record.startedAt = Date.now();
  record.updatedAt = new Date().toISOString();
  record.stages = createStages(record.type);
  record.currentStageId = record.stages[0].id;
  return toPublicJob(record);
}

export function getDefaultTeachingSettings(): TeachingSettings {
  return { ...DEFAULT_SETTINGS };
}
