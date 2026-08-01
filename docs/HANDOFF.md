# PPT 数字人授课视频生成系统项目交接

> 交接日期：2026-07-30  
> 当前分支：`main`  
> 当前提交：`f4f0dfb Redesign course creation experience`  
> 工作区状态：存在大规模未提交目录重组和新增文件，接手后禁止重置  
> 产品依据：`docs/product/PPT-Digital-Human-Video-PRD-v1.0.md`
> 续作状态：规划收尾已完成；尚未进入阶段 1 或修改产品代码

## 0. 交接摘要

当前系统由两部分组成：

1. `frontend/`：阶段 3～9 形态的 Next.js 交互 Mock 原型。
2. `backend/`：可本地运行的 PPTX → 讲稿审核 → Edge TTS → MP4 → ffprobe 命令行技术验证。

两部分尚未通过真实 HTTP API、数据库、队列和对象存储连接起来。当前不是生产系统。

项目分析与规划收尾已经完成：

- 完整阅读 1705 行 PRD。
- 审计前端、后端、依赖、配置和未提交改动。
- 创建并复核 `docs/IMPLEMENTATION_PLAN.md`。
- 创建 `docs/ARCHITECTURE_DECISIONS.md`。
- 把长期约束补充进根 `AGENTS.md`。
- 对计划完成代码事实核验、六维评分、真实 tracer 重排、失败恢复、验证、风险和产品决策账本。
- 最终独立短审结论为 `READY`；剩余外部门仅为对应阶段的用户决定、POC 和当前 Git 基线授权。
- 未进入任何产品功能阶段。

下一步仍不是直接建设真实后端。阶段 1 的唯一当前阻断是确认当前目录重组属于预期工作，并批准建立安全 Git 基线。产品决定按受影响阶段分别确认：

- P-01（学科优先级）和 P-02（首发用户/账号形态）在阶段 T 前确认。
- P-03～P-10 按各自截止阶段确认。
- P-11 单独决定图片公式 OCR 是否可从 Web MVP 延期。
- P-08（生产部署区域方向）最晚在阶段 12 供应商 POC 前确认。

## 1. 项目目标

把用户上传的任意页数 PPT/PPTX 转换为可编辑、可复现的中文卡通数字人授课视频。

目标闭环：

```text
上传 PPT
→ 校验文件
→ 解析页数、文字、备注、公式和布局
→ 生成每页原始画面
→ 单 Agent 分模块生成教学目标、讲稿、推导和分镜
→ 用户逐页审核
→ 开发 Edge TTS / 经 POC 通过的正式主备 TTS Provider
→ 原 PPT + 教学增强层 + 数字人 + 字幕
→ 分页视频和全片合成
→ ffprobe、解码、遮挡和页面覆盖验证
→ 通过公开 HTTP 或签名地址下载 MP4、SRT 和项目包
```

核心产品价值：

- 保留用户已有 PPT 的内容、版式和审美。
- 讲稿不是机械朗读，而是包含教学目标、衔接、公式读法和推导解释。
- 画面增强由受控组件完成，保证可复现。
- 支持逐页审核、锁定、重生成和失败恢复。

## 2. 当前系统架构

### 2.1 当前实际架构

```text
Browser
  → Next.js frontend
      → TanStack Query
      → 浏览器内存 Mock API / Mock Map

命令行
  → backend/run.mjs
      → Python prepare.py
          → python-pptx / PowerPoint / LibreOffice
          → OpenAI-compatible DeepSeek 调用
          → Python 手写 JSON Contract
      → approve.py
      → Node synthesize.mjs
          → Edge TTS
          → FFmpeg/ffprobe
      → render-frames.mjs
          → Sharp
      → create-video.mjs
          → 固定两帧卡通数字人
          → FFmpeg + 硬字幕
      → verify.mjs
          → ffprobe + 完整解码
```

前端和后端当前相互独立：

- 浏览器上传不会调用 `backend/`。
- 后端结果不会写入前端项目。
- 没有服务端 HTTP API。
- 没有 PostgreSQL、Redis、BullMQ 或 OSS。

### 2.2 候选目标架构

详细方案见 `docs/IMPLEMENTATION_PLAN.md`。PostgreSQL/Prisma 与 BullMQ/Redis/Valkey 仍是 `Proposed` 候选；阶段 T POC 通过并更新 ADR 后才成为已接受架构：

```text
Browser
  → Next.js Web / 公开 BFF Route Handlers
      → 私有 HTTP client + 共享 Zod Contract
      → backend application HTTP service
          → 持久化候选 / Repository
          → 对象存储适配器
          → 队列候选 / Workers
          ├── PPT Parse Worker
          ├── Single-Agent Worker
          ├── Audio Worker
          ├── Render Worker
          └── Validation Worker
```

## 3. 技术栈

### 3.1 当前已安装

前端：

- Next.js `16.2.11`
- React `19.2.4`
- TypeScript 严格模式
- Tailwind CSS 4
- shadcn/ui / Base UI
- TanStack Query
- React Hook Form
- Zod
- Motion
- react-dropzone

后端：

- Python 3
- `python-pptx`
- OpenAI Python SDK
- Windows 可选 `pywin32`
- Node.js
- Sharp
- `node-edge-tts`
- FFmpeg/ffprobe 静态包
- LibreOffice、Poppler、Noto CJK（Docker）

工程：

- npm workspaces
- Dockerfile
- Python unittest

### 3.2 按门禁评估或增加

- `packages/contracts` 共享 Zod 包
- PostgreSQL + Prisma（阶段 T 候选）
- BullMQ + Redis/Valkey（阶段 T 候选）
- OpenAI Agents SDK JavaScript 版（Provider 兼容性和收益证明后）
- JSZip + fast-xml-parser（现有 Python 解析器出现已证明缺口后）
- Remotion（阶段 11E 性能、许可和兼容门通过后）
- React 原生 SVG 组件
- KaTeX
- 对象存储适配器（阿里云 OSS 仅为待确认候选）
- 正式主/备 TTS Provider（CosyVoice 仅为待确认候选）
- 前端单元、组件和 E2E 测试框架

## 4. 已完成功能

### 4.1 前端 Mock 原型

- 首页与最近项目。
- PPT/PPTX 上传页面。
- 文件扩展名和 100 MB 限制。
- 上传进度、取消、失败和重试。
- 解析任务页面。
- 视频生成任务页面。
- 三栏课程编辑工作台。
- 讲稿草稿和自动保存。
- 公式列表与读法提示。
- 数字人、声音、语速、字幕、位置和背景设置。
- 视频结果页、播放错误和下载错误状态。
- 项目删除二次确认。
- 全局错误页、404、加载、空和错误组件。
- 所有主要页面可通过正常路由访问。

实际路由检查均返回 HTTP 200：

```text
/
/upload
/projects/project-limit
/projects/project-limit/parsing
/projects/project-limit/generating
/projects/project-derivative/result
```

### 4.2 后端技术验证

- 读取 PPTX 页数和顺序。
- 提取文本框、组合形状、表格、坐标和备注。
- 提取粗糙的 OOXML 数学公式候选。
- PowerPoint 或 LibreOffice/Poppler 渲染原页 PNG。
- DeepSeek/OpenAI-compatible 全课件讲稿规划。
- 无 API Key 时一页一场景规则降级。
- 生成 `scenes.generated.json`。
- 人工批准为 `scenes.reviewed.json`。
- 默认拒绝未批准讲稿进入渲染。
- Edge TTS 逐句配音、缓存、并发和重试。
- 根据最终音频时长生成字幕。
- Sharp 生成静态教学画面。
- 两张 PNG 交替产生简单开闭嘴效果。
- FFmpeg 生成 H.264/AAC、`yuv420p`、Fast Start MP4。
- ffprobe 检查媒体流、分辨率、字幕数量和时长。
- FFmpeg 全片解码检查。
- 本地阶段状态 `job-status.json`。

### 4.3 已通过验证

2026-07-30 接管轮次重新串行验证：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:test
npm.cmd run build
```

结果：

- Next.js 生产构建通过。
- TypeScript 通过。
- ESLint 零警告通过。
- 后端 4 个单元测试通过。
- 启动生产构建后手工探测 `/`、`/upload`、工作台、解析、生成和结果页，6 条路由均返回 HTTP 200，探针服务已回收。
- 仓库尚无 `routes:check` 脚本；阶段 1 应把上述手工探针固化为可重复命令。
- 之前执行的静音端到端示例视频验证为 `passed`。

## 5. 未完成任务

### P0：进入真实后端前必须完成

- 创建前后端共享 Zod Contract。
- 建立稳定 `slideId`，禁止用页码或数组下标充当 ID。
- 强制每个未跳过页面至少完整展示一次且不少于 1.5 秒。
- 增加用户跳过页面和授权全页重构的数据结构。
- 修复多页场景只显示 `sourceSlides[0]`。
- 禁止把内部文件路径放入 API 响应。
- 增加数字人、字幕和关键内容遮挡检测。
- 建立真实任务状态、幂等、取消和失败恢复。
- 先建立当前目录重组的 Git 基线。

### 前端

- 统一业务类型和 Zod Schema。
- 项目搜索、筛选、复制和归档。
- 使用真实原 PPT 页面作为默认预览。
- 讲稿、推导、场景和 Overlay 表单。
- 页面跳过、锁定和单页重生成。
- 安全区和遮挡可视化。
- HTTP 音频试听。
- 公开 HTTP 或签名视频和下载地址。
- 真实任务轮询。
- 单元、组件和 E2E 测试。

### 后端

- 安全上传与 ZIP Bomb 防护。
- `.ppt` 自动转换。
- 完整 PPT XML、图片、图表、布局和安全区解析。
- OMML → LaTeX 和 KaTeX 预渲染。
- 模块化单 Agent。
- Zod 输出校验、修复和降级。
- 经门禁确认的渲染方案、React 原生 SVG 组件和 KaTeX 增强层。
- 函数曲线、框选、箭头、局部放大和推导。
- 通过阶段 T POC 的持久化候选（当前为 PostgreSQL/Prisma）。
- 通过阶段 T POC 的队列候选（当前为 BullMQ/Redis/Valkey）。
- 对象存储（具体供应商待部署决策）。
- 通过区域、条款、配额、SLA 和质量 POC 的正式主/备 TTS Provider。
- 页面级缓存、局部重渲染和整体幂等。
- 抽帧、黑帧、静音、响度、遮挡和页面覆盖验证。
- 生产 API、权限和用户隔离。

### 计划文档

- 规划收尾已完成；后续只在产品决定、架构选择或阶段证据变化时更新。
- `docs/IMPLEMENTATION_PLAN.md` 的执行顺序现为：阶段 1 → 阶段 2 → 阶段 T 真实纵切 → 差距增量 → 硬化 → 生产化。
- PRD 十项待确认已逐项进入计划第 13 节；另有 P-11 单独记录图片公式 OCR 延期请求，不再把不同决定捆绑处理。

## 6. 当前正在开发模块

当前没有业务功能处于实现中。规划工作已经从：

```text
项目分析
→ PRD 对照
→ 架构方案
→ 数据模型/API/Zod 计划
→ 12 阶段实施计划
```

收尾为：

- `docs/IMPLEMENTATION_PLAN.md`：六维复核后版本。
- `docs/ARCHITECTURE_DECISIONS.md`：长期跨模块决策。
- 根 `AGENTS.md`：可持续执行的仓库硬规则。

尚未开始阶段 1 的任何代码修改。接手者不应跳过 Git 基线、阶段 1 和阶段 2 直接进入阶段 T；P-01/P-02 必须在阶段 T 前确认，其他产品决定在计划账本的截止阶段前确认。

## 7. 最近修改的文件列表

### 7.1 本次分析任务

- `docs/IMPLEMENTATION_PLAN.md`：新建并完成六维复核、执行顺序、失败恢复、验证、风险和决策账本。
- `docs/ARCHITECTURE_DECISIONS.md`：新建长期跨模块决策记录。
- `AGENTS.md`：补充长期仓库、Contract、Agent、任务、渲染、安全和验证规则。
- `docs/README.md`：补充跨系统主文档入口。
- `docs/HANDOFF.md`：本交接文档与续作状态。

### 7.2 上一次目录整理

根目录：

- `.gitignore`
- `AGENTS.md`
- `README.md`
- `package.json`
- `package-lock.json`

前端：

- 原根 `src/**` 全部移动到 `frontend/src/**`。
- 原根 `public/**` 全部移动到 `frontend/public/**`。
- `components.json`
- `eslint.config.mjs`
- `next.config.ts`
- `postcss.config.mjs`
- `tsconfig.json`
- `open-site.ps1`
- `打开智数讲堂.cmd`
- 新增 `frontend/package.json`
- 新增 `frontend/README.md`
- 新增 `frontend/AGENTS.md`

后端：

- 原 `pipeline/` 更名并迁移为 `backend/`。
- `backend/prepare.py`
- `backend/approve.py`
- `backend/contracts.py`
- `backend/run.mjs`
- `backend/video/*.mjs`
- `backend/tests/*.py`
- `backend/Dockerfile`
- `backend/package.json`
- `backend/requirements.txt`
- `backend/.env.example`
- `backend/README.md`
- `backend/assets/avatar/*`

文档：

- PRD 移到 `docs/product/PPT-Digital-Human-Video-PRD-v1.0.md`。
- 开发计划移到 `docs/planning/FRONTEND_DEVELOPMENT_PLAN.md`。
- 阶段报告移到 `docs/status/`。
- 流水线交接移到 `docs/handoffs/PIPELINE_HANDOFF.md`。
- 新增 `docs/README.md`。

## 8. 每个文件修改原因

| 文件或文件组 | 修改原因 |
|---|---|
| `.gitignore` | 忽略 `frontend/.next`、`backend/work`、视频和 Python 缓存 |
| `AGENTS.md` | 初步规定 frontend/backend/docs 分类；长期硬规则仍需补齐 |
| `README.md` | 把仓库说明改为前后端总项目，并更新启动命令和文档入口 |
| `package.json` | 改为 npm workspace 协调器；增加前端和 `backend:*` 命令 |
| `package-lock.json` | 适配 frontend/backend workspaces |
| `frontend/package.json` | 独立保存 Next.js 前端依赖和脚本 |
| `frontend/src/**` | 从根目录归类到前端；主体业务逻辑未因移动重写 |
| `frontend/public/**` | 静态资产归入前端 |
| `frontend/open-site.ps1`、CMD | Windows 启动器随前端归类 |
| `backend/package.json` | 独立保存 Sharp、Edge TTS、FFmpeg 依赖 |
| `backend/prepare.py` | 原 PPT/LLM 解析模块改用 `backend.*` import |
| `backend/approve.py` | 审批模块路径改为 `backend.*` |
| `backend/run.mjs` | 入口路径由 `pipeline/` 改为 `backend/` |
| `backend/video/*.mjs` | 视频流水线归入后端 |
| `backend/Dockerfile` | Docker COPY、依赖和入口路径改为 `backend/` |
| `backend/tests/*.py` | 测试 import 改为 `backend.*` |
| `docs/product/PRD` | PRD 同时约束前后端，归入产品文档 |
| `docs/planning/*` | 开发计划按文档分类归档 |
| `docs/status/*` | 阶段报告按文档分类归档 |
| `docs/handoffs/*` | 流水线交接按文档分类归档 |
| `docs/IMPLEMENTATION_PLAN.md` | 记录仓库审计、目标架构、数据/API/Schema 和 12 阶段计划 |
| `docs/ARCHITECTURE_DECISIONS.md` | 固化原页保真、Contract、Agent/Worker、任务、资产、渲染和 Provider 边界 |
| `docs/HANDOFF.md` | 保存当前上下文和后续接手信息 |

## 9. 数据库结构变化

当前没有数据库，也没有执行数据库迁移。

本轮没有新增 Prisma Schema、表或迁移文件。

计划中的数据库模型记录在 `docs/IMPLEMENTATION_PLAN.md`：

- Project
- Presentation
- Slide
- LessonPlan
- LessonPlanRevision
- GenerationTask
- TaskStep
- TaskStepAttempt
- AgentRun
- Asset

关键计划：

- 当前持久化候选是 PostgreSQL + Prisma，阶段 T POC 与 ADR 接受前不是既定技术。
- 所有实体使用稳定 ID。
- `Slide.id` 与 `slideNumber` 分离。
- Task/TaskStep 保存真实状态、心跳、重试和幂等键。
- LessonPlanRevision 保存模型、Prompt、Schema 和人工修改版本。
- Asset 只保存 `storageKey`，下载 URL 由 API 临时签发。

以上都只是计划，尚未实现。

## 10. API 变化

### 10.1 当前真实 API

不存在服务端 HTTP API。

`frontend/src/lib/api/` 是浏览器内存 Mock：

- projects
- uploads
- slides
- jobs
- renders
- avatars
- voices

### 10.2 最近 CLI 变化

命令前缀由旧 `pipeline:*` 改为：

```powershell
npm.cmd run backend:prepare
npm.cmd run backend:approve
npm.cmd run backend:render
npm.cmd run backend:run
npm.cmd run backend:test
```

Python 模块由 `pipeline.*` 改为 `backend.*`。

### 10.3 计划 API

尚未实现，计划包括：

```text
POST   /api/projects
GET    /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id

POST   /api/projects/:id/presentation/upload-url
POST   /api/projects/:id/presentation/complete
POST   /api/projects/:id/parse
GET    /api/projects/:id/slides

POST   /api/slides/:id/generate-plan
PATCH  /api/slides/:id/lesson-plan
POST   /api/slides/:id/lock
POST   /api/slides/:id/skip
POST   /api/slides/:id/preview

POST   /api/projects/:id/generate
GET    /api/tasks/:id
POST   /api/tasks/:id/cancel
POST   /api/tasks/:id/retry

GET    /api/projects/:id/outputs
POST   /api/outputs/:id/download-url
```

耗时 POST 必须使用幂等键并返回 task ID。

## 11. 已知 Bug

### P0

1. **合并多页场景只显示第一页**
   - Contract 给场景写入 `sourceSlides[0]` 的图片。
   - 渲染也只使用第一来源页。
   - 结果可能漏掉后续原页。

2. **没有强制完整页面覆盖**
   - 解析只记录 uncovered 页。
   - 审批和最终验证不会因漏页失败。
   - `approve.py` 在用户修改 `sourceSlides` 后仍复制旧 `sourceSlideCoverage`，没有重新派生。
   - 没有 `isSkipped` 区分主动跳过和系统漏页。

3. **Agent 输出没有通过共享 Zod**
   - 当前使用 Python 手写规范化。
   - 未知字段和错误类型可能被静默修正。

4. **结果 JSON 包含绝对内部路径**
   - `result.json` 和 `verification.json` 写入 `videoPath` 等路径。
   - 这些结构不能直接返回浏览器。

5. **数字人没有遮挡检测**
   - 固定位置和固定尺寸。
   - 没有标题、公式、图表、正文和字幕安全区。

### P1

6. **前端默认预览不是原 PPT 页面**
   - `slide-preview.tsx` 重新排版标题、摘要和公式。

7. **回退字段名不一致**
   - 解析输出 `slide.index`、`textBlocks`。
   - 回退渲染读取 `slide.number`、`texts`。

8. **原页渲染失败后继续生成重构文本页**
   - 不符合“原页失败应阻断或明确降级”的产品原则。

9. **没有稳定后端 slideId**
   - 后端场景主要引用页码整数。

10. **任务没有整体幂等性**
    - 只有 Edge TTS 句子缓存。
    - 创建任务没有 idempotency key。

11. **旧帧可能污染重跑**
    - `frames/` 不在每次运行前按新任务隔离。
    - 场景数量变化可能使画面数校验失败。

12. **前端真实接入时可能重复创建任务**
    - 解析和生成页面在没有 jobId 时 mount 自动创建。
    - 当前没有服务端去重。

13. **视频帧率与 PRD 不一致**
    - 当前为 12 FPS。
    - 目标为 25 或 30 FPS。
    - 媒体验证对非 H.264/AAC 只给 warning，也没有把 FPS、`yuv420p` 和 Fast Start 设为硬失败。

14. **DeepSeek 模型有代码内默认值**
    - `prepare.py` 内仍有 `deepseek-chat`。

### 工程风险

15. **整个 frontend/backend 当前未跟踪**
    - Git 把旧根文件显示为删除，新目录显示为未跟踪。
    - 开始新阶段前必须先确认并建立基线。

16. **缺少前端测试**
    - 没有前端 test 脚本、组件测试和 E2E。

17. **依赖安全告警**
    - 官方 registry audit：3 moderate、20 high。

18. **Docker 未复核**
    - 当前机器未安装 Docker，重组后的镜像未实际构建。

19. **质量命令不能并发共享 `.next`**
    - `next build` 与 `tsc` 并行会产生 `.next/types` 竞态。
    - 必须串行运行。

## 12. 下一步开发计划

### 立即动作：确认，不开发功能

1. 确认当前目录重组是否为预期工作，并是否批准建立安全 Git 基线。
2. P-01（高等数学优先）和 P-02（首发用户/账号形态）在阶段 T 前分别确认。
3. P-03～P-10 在各自截止阶段前逐项确认；16:9 已由 PRD 确定，不与部署或时长捆绑。
4. P-11 在阶段 11B 前单独确认：图片公式 OCR 是否允许从 Web MVP 延期。
5. P-08 在阶段 12 供应商 POC 前确认生产部署方向。

### 用户确认后：阶段 1

只完成“项目初始化与基础设计系统收口”：

- 人工确认当前目录重组。
- 建立安全 Git 基线。
- 增加前端单元/组件测试。
- 增加路由 HTTP smoke 命令。
- 审查并兼容升级直接依赖。
- 保持现有页面和设计，不重写业务。

阶段 1 完成且所有门禁通过后停止，等待确认。

### 阶段 2 与阶段 T

- 建立 `packages/contracts`。
- 只用 Zod 建立阶段 T 实际消费的最小 Project、Slide、LessonPlan、Scene、Overlay、Task、Asset 和 API。
- 迁移前端 Mock API。
- 测试拒绝非法 Agent JSON、陈旧 coverage、漏页和未授权全页重构。
- 随后先对持久化/队列候选做连接与恢复 POC，再完成 3 页真实 HTTP → 持久任务 → 现有 CLI → HTTP 下载纵切。
- 阶段 3～10 必须通过真实 adapter 扩展完整产品流；Mock 只保留为确定性 fixture，不能再次成为阶段目标。

后续阶段详见 `docs/IMPLEMENTATION_PLAN.md`。

## 13. 开发约束和不能改变的设计决策

### 13.1 产品硬规则

1. 默认优先保留 PPT 每一页原始画面。
2. 动态效果通过公式推导、重点框、箭头、曲线和局部放大等增强层实现。
3. 未经用户主动选择，不允许默认完全重构 PPT。
4. 每个未跳过页面必须至少完整展示一次，持续不少于 1.5 秒。
5. 原页必须 `contain` 等比适配，不裁边。
6. 数字人不能遮挡标题、公式、图表、关键文字和字幕。
7. 无法避让时数字人移动、缩小或隐藏。

### 13.2 Agent 规则

1. MVP 使用模块化单 Agent。
2. 内部分为内容理解、教学规划、讲稿、推导、视觉分镜和审核。
3. 所有 Agent 输出必须通过共享 Zod。
4. Agent 输出永远先作为 `unknown` 处理。
5. Agent 不得输出并直接执行 JavaScript、Shell、HTML 或 FFmpeg 命令。
6. PPT 解析、TTS、渲染和 ffprobe 不是 Agent。
7. DeepSeek 模型名称只能来自服务端环境变量。
8. 当前阶段不得直接建设复杂多 Agent。

### 13.3 前端规则

1. 阶段 1～2 保留 Mock API；阶段 T 在 feature flag 下接入真实产品纵切，阶段 3～10 只补真实链路差距。
2. 浏览器不解析 PPT。
3. 浏览器不直接调用 DeepSeek、Edge TTS、FFmpeg、对象存储或数字人服务。
4. 所有页面必须通过正常路由访问。
5. 页面覆盖初始、加载、空、成功、错误和重试。
6. 真实接入后不得延续定时器伪进度。

### 13.4 后端和任务规则

1. 所有耗时任务持久化真实状态。
2. 所有异步任务必须幂等。
3. 使用稳定项目、任务、页面和资产 ID。
4. 数组下标不能代替 `slideId`。
5. Worker 失败只重做失败步骤和受影响下游。
6. 完成状态必须在最终验证通过后写入。

### 13.5 资产和安全规则

1. 下载接口只返回公开 HTTP 或短期签名 URL。
2. 不得返回 `/workspace`、`/tmp` 或服务器内部磁盘路径。
3. API Key 只存在服务端环境变量或密钥服务。
4. 不提交真实密钥。
5. 文件名和用户路径不得直接拼接到 Shell。
6. 上传必须防 ZIP Bomb、损坏文件和 MIME/扩展名不一致。

### 13.6 工作方式

1. 每次只完成一个阶段。
2. 阶段开始前说明目标、文件、不处理内容和现有改动风险。
3. 阶段结束后串行执行 typecheck、lint、测试、build 和路由检查。
4. 当前阶段有错误时不得进入下一阶段。
5. 不修改无关文件。
6. 不删除或覆盖用户现有修改。
7. 禁止 `git reset --hard` 等破坏性命令。
8. 重要架构决策写入 `docs/ARCHITECTURE_DECISIONS.md`。
9. 每个阶段完成后停止，等待用户确认。

## 14. 接手后的第一条命令

先查看状态，不要修改：

```powershell
git status --short --untracked-files=all
```

然后完整阅读：

```text
docs/product/PPT-Digital-Human-Video-PRD-v1.0.md
docs/IMPLEMENTATION_PLAN.md
docs/HANDOFF.md
AGENTS.md
```

在用户确认前，不进入阶段 1，不提交、不重置当前工作区。
