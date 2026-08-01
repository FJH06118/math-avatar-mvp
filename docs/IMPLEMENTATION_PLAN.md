# PPT 数字人授课视频生成系统实施计划

> 状态：规划复核完成；阶段 1 仅等待目录重组基线授权  
> 制定日期：2026-07-30  
> 最近复核：2026-07-30  
> 需求依据：`docs/product/PPT-Digital-Human-Video-PRD-v1.0.md`（已完整阅读 1705 行）  
> 架构依据：`docs/ARCHITECTURE_DECISIONS.md`  
> 当前轮次范围：项目分析、架构与实施计划；不实现业务功能

## 1. 结论与执行建议

当前仓库不是空项目：

- `frontend/` 已经形成阶段 3～9 的较完整交互 Mock 原型，正常路由、主要页面和大部分 UI 状态都存在。
- `backend/` 已经形成可本地运行的 V0.1 命令行技术验证，能够完成 PPTX 基础解析、讲稿审核、Edge TTS、静态数字人合成和 ffprobe 验证。
- 两端尚未通过共享 Contract、HTTP API、数据库、队列和对象存储连成产品闭环。

因此不应重新生成整套页面，也不应马上横向铺开 PostgreSQL、Redis、OSS 和全部 Worker。推荐先完成“阶段 1 的收口与基线稳定”，再只建立纵向切片实际消费的最小 Zod Contract。第一个真实产品里程碑采用一条 tracer bullet：

```text
一份 3 页固定 PPTX（普通文本、OMML 公式、拥挤图文各一页）
→ HTTP 创建任务
→ 持久化真实状态
→ 原页 PNG
→ 一个真实的模块化 Agent 调用并通过 Zod
→ 人工确认
→ Edge TTS
→ 至少一个真实 Overlay 和数字人避让
→ 每页原图至少完整展示 1.5 秒
→ 确定性渲染
→ ffprobe 验证
→ HTTP 下载地址
```

这条切片优先复用现有 Python 解析、Sharp、Edge TTS 和 FFmpeg；只为真实 HTTP、持久任务、边界 Contract 和最小 Overlay 增加必要代码。它不是 no-op 基础设施演示，也不要求先完成全部数据模型、全部页面类型、Remotion、生产对象存储或正式 TTS Provider。

### 1.1 强制执行顺序

章节编号用于保存 PRD 对应关系，实际执行顺序必须是：

```text
规划收尾
→ 阶段 1：安全基线与测试保护
→ 阶段 2：纵向切片实际需要的最小 Contract
→ 阶段 T：3 页真实产品 tracer bullet
→ 阶段 3～10：只补现有产品与真实切片暴露的差距
→ 阶段 11A～11F：恢复、覆盖面、规模和质量硬化
→ 阶段 12：经确认的生产化
```

阶段 3～10 不得重做已经存在的 Mock 页面；它们是差距增量。阶段 T 可以先用 no-op Worker 做候选基础设施连通性预检，但同一阶段必须换成真实产品 Worker 并跑完整闭环后才算通过。每个字母子阶段仍按“单阶段、串行门禁、结束即停”的规则执行。

在真实切片通过前，不建设多 Agent、自由时间线、图片公式 OCR、写实数字人、高并发 GPU 集群或完整云基础设施。图片公式 OCR 是否从 Web MVP 延期仍需产品明确批准；阶段 T 不覆盖它不等于从 PRD 删除它。

## 2. 当前仓库检查结果

### 2.1 仓库与目录

当前分支为 `main`，最近提交为：

```text
f4f0dfb Redesign course creation experience
5571a2f Initial project backup
```

当前目录：

```text
/
├── frontend/                 Next.js 前端与 Mock API
├── backend/                  Python PPT 解析和 Node 音视频流水线
├── docs/                     产品、计划、状态和交接文档
├── package.json              npm workspaces 与全仓命令
├── package-lock.json
├── AGENTS.md
└── README.md
```

文件规模（排除生成物）：

- 前端约 97 个文件。
- 后端约 19 个文件。
- 本计划创建前共有 5 个文档文件。

### 2.2 未提交改动

当前存在大规模未提交目录重组：

- 原根目录 `src/`、`public/` 和前端配置在 Git 中显示为删除。
- 对应内容在 `frontend/` 中显示为未跟踪。
- 整个 `backend/` 当前显示为未跟踪。
- `docs/` 的新分类、根 `package.json`、锁文件、README、AGENTS 和 `.gitignore` 均有未提交改动。

这些改动是当前有效工作，后续实现不得覆盖、重置或误删。进入阶段 1 前应先人工确认重组结果，然后建立一个可回退的 Git 基线。禁止用 `git reset --hard` 处理当前状态。

### 2.3 当前依赖

前端当前主要版本和能力：

- Next.js `16.2.11`
- React `19.2.4`
- TypeScript 严格模式
- Tailwind CSS 4
- shadcn/ui（Base UI）
- TanStack Query
- React Hook Form + Zod
- Motion

后端当前主要依赖：

- Python：`python-pptx`、OpenAI Python SDK、Windows 下可选 `pywin32`
- Node：Sharp、`node-edge-tts`、FFmpeg/ffprobe 静态包
- Docker 镜像：LibreOffice、Poppler、FFmpeg、Noto CJK 字体

尚未安装：

- Prisma、PostgreSQL 驱动
- BullMQ、Redis/Valkey 客户端
- OpenAI Agents SDK JavaScript 版
- JSZip、fast-xml-parser
- Remotion、KaTeX
- 前端单元/组件测试框架
- 生产对象存储与正式 TTS Provider（具体供应商均待确认）

2026-07-30 重新执行 `npm audit --registry=https://registry.npmjs.org --json`，结果仍为 23 条依赖告警（3 条 moderate、20 条 high），直接依赖涉及 Next.js、ESLint、eslint-config-next 和 shadcn。阶段 1 需要先建立测试保护，再逐个直接依赖评估兼容升级；不能直接运行破坏性的自动修复，也不能在同一修改中批量升级多个无关依赖。

外部服务时效检查：

- OpenAI Agents SDK 官方文档确认 `OpenAIProvider` 支持 OpenAI-compatible `baseURL`，并可用 `useResponses: false` 选择 Chat Completions；这只证明接口方向可行，不证明 DeepSeek 的结构化输出、工具流、超时和重试完全兼容。
- DeepSeek 官方更新日志说明 `deepseek-chat` 与 `deepseek-reasoner` 已于 2026-07-24 停用。当前 `backend/prepare.py`、`backend/.env.example` 和 `backend/README.md` 仍使用 `deepseek-chat`，因此真实 LLM 路径当前是阻断状态。阶段 T 的 Provider 预检必须先删除代码默认值、改为必填环境配置，并用当前受支持模型做真实集成测试。

### 2.4 当前质量基线

2026-07-30 接管轮次已串行执行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:test
npm.cmd run build
```

结果：

- Next.js 生产构建通过。
- TypeScript 检查通过。
- ESLint 以零警告门槛通过。
- 后端 4 个 Python 单元测试通过。
- 本地生产服务下 `/`、`/upload`、工作台、解析、生成和结果页 6 条实际路由均返回 HTTP 200；探针服务已回收。
- 当前没有 `routes:check` 脚本，本轮使用手工生产服务探针；阶段 1 才把它固化为仓库命令。

注意：`next build` 与 `tsc` 不能在同一个 `.next` 目录并行执行。本次并行检查曾导致 `.next/types` 被构建过程替换而出现假失败；质量门禁应串行。

当前缺口：

- 没有前端 `test` 脚本、组件测试和 E2E 测试。
- 没有 CI。
- 当前机器没有 Docker，尚未验证重组后的 Docker 镜像构建。

## 3. 需求摘要

### 3.1 MVP 范围

MVP 必须完成：

1. 自动识别 PPT/PPTX 的页数、顺序、比例和基础结构。
2. 提取文字、图片、基础形状、备注和常见公式；失败时保留原页截图并显式警告。
3. 生成每页教学目标、口播讲稿、公式推导、衔接语、分镜与置信度。
4. 默认使用“PPT 原页底图 + 教学增强层”。
5. 支持逐页预览、编辑、锁定、跳过和局部重生成。
6. 支持数字人、声音、字幕和生成设置。
7. 使用最终音频时长生成字幕和场景时间轴。
8. 分页渲染并合成 H.264/AAC、`yuv420p`、Fast Start MP4。
9. 保存中间结果，支持页面级定位、失败重试和恢复。
10. 通过公开 HTTP 或短期签名 URL 交付 MP4、SRT 和项目包。
11. 更换不同页数和结构的 PPT 后不修改业务代码。

### 3.2 非目标

MVP 不承诺：

- 逐帧还原 PowerPoint 内置动画。
- 完整还原宏、嵌入式程序、复杂 SmartArt 和插件对象。
- 自动保证所有学科知识和数学推导绝对正确。
- 实时直播和实时问答。
- 写实 3D 数字人、高精度音素口型。
- 专业非线性视频编辑器和自由时间线。
- 默认完全重构 PPT。
- 当前阶段建设复杂多 Agent 系统。

以下是建议削减项，不是已确认的产品决策：

- 阶段 T 不实现图片公式 OCR，以原图保留和人工确认验证最小闭环；是否从完整 Web MVP 延期必须由产品确认。
- 建议首版不做自定义数字人上传。
- 建议首版不做 9:16、1:1、背景音乐和品牌片头。
- 建议团队权限、计费和批量课程进入生产化阶段。
- GPU 生成式视频不属于当前 PRD MVP。

这些项目在第 13 节逐项保留，不得因为本计划建议削减就从验收范围中静默消失。

### 3.3 用户流程

```text
新建项目
→ 上传并校验 PPT/PPTX
→ 解析结构、页数和原页图
→ 页面语义分类
→ 单 Agent 分模块生成讲稿、推导和分镜
→ Zod 校验、规则检查和必要的降级
→ 用户逐页审核、编辑、跳过或锁定
→ 配置数字人、声音和字幕
→ 试听音频与预览关键帧
→ 创建真实生成任务
→ TTS 和字幕时间轴
→ 每页独立渲染
→ 全片合成
→ ffprobe、完整解码与抽帧质检
→ 公开 HTTP 或签名下载
```

用户可在上传、审核、试听、关键帧预览和失败恢复节点中断。

### 3.4 功能模块

- 项目管理。
- PPT 上传、安全校验与 `.ppt` 转换。
- PPTX XML/布局/公式解析和原页渲染。
- 页面分类与置信度。
- 教学目标、讲稿、推导和视觉分镜。
- 原页保留模式和增强层。
- 安全区、遮挡检测和自动布局。
- 卡通数字人和简化口型。
- TTS Provider、文本规范化和音频检查。
- 字幕时间轴。
- 三栏审核工作台。
- 分页视频渲染、合成和验证。
- 持久化任务、进度、取消、重试和恢复。
- 输出资产、下载签名和项目包。
- 评测、日志和可观测性。

### 3.5 技术栈

目标方向（带验证门，不等于一次性安装清单）：

- Web/API：Next.js App Router、TypeScript
- UI：Tailwind CSS、shadcn/ui、TanStack Query
- Contract：Zod
- 数据候选：PostgreSQL、Prisma；阶段 T 验证事务、迁移和真实查询
- 异步任务候选：BullMQ、Redis 或 Valkey；先证明幂等、lease、恢复和 outbox
- PPT：优先复用现有 Python 解析与 LibreOffice；只有明确缺口才引入 JSZip/fast-xml-parser，避免两套主解析器
- Agent：Provider 接口；OpenAI Agents SDK + DeepSeek OpenAI-compatible 必须先通过兼容性 spike
- 渲染：阶段 T 优先复用 Sharp + FFmpeg；Remotion/KaTeX 在基准与许可通过后引入；“React SVG”指 React 原生 SVG 组件，不是独立依赖
- TTS：开发 Edge TTS；生产使用通过区域、条款、配额、SLA 和质量 POC 的主/备 Provider，CosyVoice 仅为候选
- 资产：阶段 T 使用本地 HTTP 适配器；阿里云 OSS 取决于部署确认
- 部署候选：Docker；本地可用单机 Compose，但必须先验证当前环境与最终区域，生产部署再决定 Worker 拆分

### 3.6 Agent 架构

MVP 只建设一个“课程视频导演 Agent”，但内部必须有六个可独立测试的步骤：

1. 内容理解。
2. 教学规划。
3. 讲稿生成。
4. 公式推导。
5. 视觉分镜。
6. 结果审核。

每一步的输入和输出都通过共享 Zod Schema。模型 Provider、Prompt、模型名和 Schema 版本可追踪。编排先选能通过阶段 T 兼容测试的最小实现；OpenAI Agents SDK 不是在验证前强制安装的前置层。后续若拆分多 Agent，只替换编排层，不改变 Contract 和确定性渲染器。

PPT 解析、TTS、通过门禁的渲染器、Sharp、FFmpeg 和 ffprobe 都是普通 Worker/工具，不是 Agent。

### 3.7 PPT 原页保留规则

不可违反的规则：

- 默认模式为 `PRESERVE_WITH_OVERLAY`。
- 未经用户主动授权，不得使用 `FULL_REDESIGN`。
- 每个未跳过的 `slideId` 至少对应一个完整原页镜头。
- 完整镜头持续至少 1.5 秒。
- 原页使用 `contain`，不得裁掉边缘。
- 局部放大后回到完整原页或保留清楚的空间关系。
- 标题、公式、图表、关键文字和字幕优先级高于数字人。
- 数字人无法避让时必须移动、缩小或隐藏。
- 解析或增强失败时降级为完整原页 + 基础框选 + 讲稿 + 字幕，而不是生成无依据的新页面。

### 3.8 视频生成流程

```text
审核完成
→ 文本规范化
→ TTS 分句生成及音频检查
→ 基于真实音频生成字幕时间轴
→ 计算每页和每场景时长
→ 经门禁确认的分页渲染器（阶段 T 复用 Sharp/FFmpeg）
→ FFmpeg 统一参数合成
→ 响度与 Fast Start
→ ffprobe 技术校验
→ 完整解码
→ 抽帧和原页覆盖/遮挡检查
→ 生成验证报告
→ 上传资产并签发下载 URL
```

输出默认：

- 1920×1080，可选 1280×720。
- 首版 16:9。
- 25 或 30 FPS；阶段 11E 完成性能与兼容基准后再确定默认值。
- H.264 + AAC + `yuv420p` + Fast Start。

### 3.9 验收标准

关键硬门槛：

- 可打开文件页数识别 100%。
- 所有页面有原页预览。
- 未跳过页面完整展示覆盖率 100%。
- 严重遮挡 0。
- Agent 原始输出全部经过 Zod；首次通过率目标 ≥90%，修复/降级后 ≥99%。
- 音频和最终 MP4 可解码率 100%。
- 公式失败有可见降级，不静默丢失。
- 页面级失败可定位、取消和重试。
- Worker 重启后任务状态不丢。
- 最终结果只有公开 HTTP 或签名地址，不暴露服务器路径。
- 浏览器、Windows 播放器、VLC 或移动端至少三种播放器抽检。

## 4. 现有代码与需求差距

### 4.1 已完成功能

前端原型：

- 正常 App Router 路由：首页、上传、解析、工作台、生成、结果。
- 项目列表的加载、空、错误、成功和删除确认。
- 上传扩展名、100 MB 限制、进度、取消、失败和重试的 Mock 交互。
- 解析和生成任务的阶段 UI、取消与重试。
- 三栏工作台、稳定 `slide.id` 选择、讲稿草稿和自动保存。
- 数字人、音色、语速、字幕、位置、背景设置。
- 结果页的加载、播放错误、下载不可用和重新生成状态。
- 浏览器端没有调用 LLM、TTS 或 FFmpeg，也没有暴露 API Key。

后端技术验证：

- PPTX 文本、表格、备注、坐标和 OOXML 公式候选提取。
- PowerPoint 或 LibreOffice/Poppler 原页 PNG。
- DeepSeek/OpenAI-compatible 单次规划和规则降级。
- 人工批准文件门。
- Edge TTS 逐句配音、重试、并发和缓存。
- 依据真实音频生成字幕和时间轴。
- Sharp 原页 `contain`、两帧卡通口型和 FFmpeg 合成。
- ffprobe、字幕重叠、时长差和完整解码检查。
- 子进程阶段前后写入本地真实状态。

### 4.2 部分完成功能

| 能力 | 当前实现 | 还缺什么 |
|---|---|---|
| 前端阶段 3～9 | 交互和状态较完整 | 数据都来自内存 Mock，没有生产 Contract |
| Zod | 只校验授课设置 | Agent、API、项目、页面、任务均无共享 Schema |
| PPT 解析 | 文本、备注、粗糙公式候选 | 图片/图表语义、主题、z-index、安全区、OMML→LaTeX |
| 原页 | 能生成并静态放入画面 | 前端不展示真实原页；没有覆盖证明和跳过模型 |
| Agent | 一次全局 Prompt | 六模块边界、视觉分镜、风险审核、版本记录、修复循环 |
| 审核 | 本地 JSON 人工批准 | 修订、锁定、审批人、并发控制、单页重生成 |
| TTS | Edge TTS 可用 | Provider 接口、待确认的正式主/备 Provider、异常音频检测和 ASR 回转 |
| 渲染 | 静态原页 + 固定数字人 + 字幕 | 经门禁确认的渲染方案、KaTeX、SVG 增强层、遮挡检测、目标 FPS |
| 状态 | 本地 JSON 的真实阶段 | 通过 POC 的 DB/队列、心跳、取消、幂等键、页面进度、Worker 恢复 |
| 验证 | 媒体技术检查 | 原页覆盖、1.5 秒镜头、黑帧、响度、遮挡和抽帧质量 |

### 4.3 尚未开始

- 持久化与迁移候选（首测 PostgreSQL/Prisma）。
- 队列/lease 候选（首测 BullMQ + Redis/Valkey）。
- Next.js HTTP API 与统一错误响应。
- 共享 `packages/contracts`。
- 生产对象存储资产和签名下载。
- OpenAI Agents SDK 的模块化单 Agent。
- 经门禁确认的渲染系统、React 原生 SVG 组件和 KaTeX。
- 页面级安全区、遮挡评分和自动避让。
- `.ppt` 自动转换和安全解包防护。
- 生产鉴权、用户隔离、监控、正式 TTS Provider 和云端部署。
- 前端单元、组件、路由 E2E、PPT 金样和 Agent 评测集。

### 4.4 需求与现有代码的直接冲突

1. **原页覆盖冲突**  
   合并场景可引用多个 `sourceSlides`，但 `backend/contracts.py` 只写入第一张 `slideImage`，`render-frames.mjs` 也只渲染 `sourceSlides[0]`。其余页面可能永远不出现。

2. **Agent Contract 冲突**  
   当前 Agent 输出由 Python 手写规范化器处理，不是共享 Zod。未知场景类型会静默变为 `concept`，不能满足严格拒绝和自动修复要求。

3. **稳定 ID 冲突**  
   后端解析结果以页码 `index` 为主，没有持久化稳定 `slideId`；场景引用页码整数。

4. **默认重构冲突**  
   前端 `slide-preview.tsx` 重新排版标题、摘要和公式，并未展示真实 PPT 原页。

5. **遮挡冲突**  
   后端数字人固定在 `(1500, 570)`，没有关键区域和字幕碰撞计算；前端也只有全局 left/right。

6. **下载契约冲突**  
   后端 `result.json` 和 `verification.json` 写入服务器绝对路径。它们可以作为内部 Worker 数据，但绝不能直接成为 API 响应。

7. **任务状态冲突**  
   前端生产形态尚不存在，Mock 进度由 `Date.now()` 推算；后端百分比是固定阶段点且只写本地 JSON。

8. **渲染规格冲突**  
   当前视频固定 12 FPS，而 PRD 要求 25 或 30 FPS；尚无受控增强层、遮挡避让和目标规格硬门禁。

9. **模型配置冲突**  
   `backend/prepare.py` 仍含 `deepseek-chat` 默认字符串。模型名必须由环境配置或 Mock Provider 提供，业务代码不得内置生产模型名。

10. **回退字段错误**  
    PPT 解析写 `slide.index`/`textBlocks`，渲染回退读取 `slide.number`/`texts`；原图缺失时回退内容不完整。

11. **批准后页面覆盖元数据可能陈旧**  
    `backend/approve.py` 在重新规范化用户编辑后的场景时，原样复制旧 `sourceSlideCoverage`，没有依据新 `sourceSlides` 重算。覆盖必须是派生校验结果，审批时重新计算并硬拒绝未授权漏页。

12. **原页渲染全失败后仍继续生成重排文本页**  
    `backend/prepare.py` 将 PowerPoint/LibreOffice 都失败记录为 `unavailable` 后继续规划，`render-frames.mjs` 再生成重排文本页。阶段 T 必须把原页缺失变为阻断状态或显式、可审计的人工降级；不得静默冒充“保留原页”。

13. **媒体规格检查不是硬门**  
    当前验证器把非 H.264/AAC 只记为 warning，也没有硬验 FPS、`yuv420p` 和 Fast Start。目标验证必须将编码、像素格式、帧率、流式封装和完整解码全部设为失败门。

## 5. 推荐目录结构

保留现有 `frontend/` 与 `backend/`，只增加一个真正跨端共享的 Contract workspace：

```text
/
├── frontend/
│   ├── src/app/                         页面和薄 Route Handlers
│   │   └── api/                         鉴权、Zod、调用后端应用服务
│   ├── src/components/
│   ├── src/features/                    按项目/上传/审核/生成/结果组织
│   ├── src/lib/api/                     Mock/HTTP 客户端适配器
│   └── src/test/
├── backend/
│   ├── src/
│   │   ├── application/                 用例服务和事务边界
│   │   ├── agent/
│   │   │   ├── modules/                 六个单 Agent 模块
│   │   │   ├── providers/               DeepSeek/Mock Provider
│   │   │   └── prompts/                 版本化 Prompt
│   │   ├── ppt/                         解包、解析、原页渲染适配
│   │   ├── audio/                       文本规范化与 TTS Provider
│   │   ├── render/
│   │   │   ├── renderer/                Sharp/FFmpeg 起步；其他实现通过门禁后替换
│   │   │   ├── overlays/
│   │   │   └── validation/
│   │   ├── queue/                       通过阶段 T POC 的队列/lease Worker、状态机
│   │   ├── storage/                     本地测试/对象存储 Provider
│   │   └── db/                          通过阶段 T POC 的 client 与 repository
│   ├── prisma/schema.prisma
│   ├── python/                          暂留 python-pptx/COM 适配器
│   ├── legacy/                          经金样保护的现有 CLI，迁移后删除
│   └── tests/
├── packages/
│   └── contracts/
│       ├── src/domain/
│       ├── src/agent/
│       ├── src/api/
│       └── src/task/
├── tests/
│   ├── fixtures/ppt/
│   ├── golden/
│   └── e2e/
├── infra/
│   ├── docker/
│   └── compose/
├── docs/
│   ├── product/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── ARCHITECTURE_DECISIONS.md
│   ├── planning/
│   ├── status/
│   └── handoffs/
├── package.json
└── AGENTS.md
```

约束：

- `packages/contracts` 是唯一允许同时被前后端依赖的业务结构包。
- 前端 Route Handler 保持薄层；Agent、TTS、解析和渲染绝不进入浏览器 bundle。
- 当前 Python 流水线先作为受控适配器和金样参考，不立即整套重写。
- 新增目录只在对应阶段创建，不能一次性创建空骨架。

## 6. 系统架构方案

```text
Browser
  → Next.js Web / public BFF Route Handlers
      → private HTTP client + shared Zod
      → backend application HTTP service
          → persistence candidate / repository
          → storage adapter signed upload/download
          → queue candidate / workers
          ├── PPT Parse Worker
          ├── Single-Agent Worker
          ├── Audio Worker
          ├── Render Worker
          └── Validation Worker
```

### 6.1 Web/API 边界

Next Route Handlers 作为公开 BFF 只负责：

- 浏览器会话与初步用户/项目范围检查。
- 公共请求与响应 Zod 校验。
- 把 `Idempotency-Key`、principal/scope 和业务请求通过私有 HTTP client 转发给 backend application service。
- 代理状态查询、资产授权结果和下载续签；不直接导入 `backend/**` 源文件。

`backend/` 的 application HTTP service 重新校验 principal/scope，并拥有业务事务、outbox、幂等任务创建、Repository 和存储授权。BFF 与 application service 都不得同步执行 LibreOffice、LLM、TTS、任何分页渲染器或 FFmpeg；这些只由 Worker 执行。

若 P-02 选择内部单用户，阶段 T 使用仅限本机/测试环境的固定内部 principal，并让 BFF 和 application service 的所有 Project/Asset 查询经过同一 scope Contract；固定 principal 不得在生产启用。若 P-02 选择个人账号或机构团队，进入阶段 T 前必须先修订本阶段范围并加入最小真实 identity；机构分支还必须加入 tenantId、租户隔离和越权测试，不能继续套用内部 principal 非目标。阶段 12 可替换身份 Provider 来源，但不改变已确认的 scope Contract。

### 6.2 Worker 边界

- PPT Parse Worker：文件校验、`.ppt` 转换、XML/布局解析、原页 PNG。
- Agent Worker：六模块单 Agent、Schema 修复、规则审核。
- Audio Worker：TTS 文本规范化、Provider、缓存、音频校验、字幕。
- Render Worker：经门禁确认的分页渲染器、增强层、数字人、字幕和 FFmpeg 合成。
- Validation Worker：ffprobe、完整解码、覆盖、遮挡、黑帧/静音和质量报告。

### 6.3 Agent 与确定性执行边界

Agent 只能返回 `unknown` JSON；系统立即用 Zod `.strict()` 校验。失败时最多执行受限的 JSON 修复循环，仍失败则降级到规则模板或等待人工。

Agent 不得输出并直接执行：

- JavaScript/TypeScript。
- Shell/PowerShell。
- HTML。
- FFmpeg 参数。
- 文件系统路径。

渲染器只接受枚举模板、动画白名单、受限数学表达式和经过边界检查的数值。

### 6.4 本地与云端

- 阶段 1：保持现有 Mock，只建立安全基线和测试。
- 阶段 2：建立阶段 T 实际消费的最小 Contract，避免提前定义无人使用的全量 Schema。
- 阶段 T：本地真实纵向闭环；使用最小 PostgreSQL/队列候选和本地 HTTP 资产适配器，浏览器不接触磁盘路径。当前机器没有 Docker，因此正式进入门包含 Docker/Compose 可用性或经批准的等价本地服务方案。
- 阶段 3～10：Mock adapter 继续用于确定性组件测试，但真实 adapter 和阶段 T 不能被删除；只补差距，不重建同一流程。
- 阶段 11：在真实切片上增加恢复、覆盖面、性能和质量，不第一次创建产品闭环。
- 阶段 12：根据产品确认选择生产区域、对象存储、正式 TTS、数据库/队列托管、分离 Worker 和监控；不得预先把阿里云当作已确认事实。

### 6.5 依赖决策与最小代码阶梯

| 当前需求 | 先复用 | 新候选 | 为什么现有能力不够 | 进入门与最小 POC | 失败时 |
|---|---|---|---|---|---|
| 共享边界 Contract | 前端已安装 Zod | `packages/contracts` workspace | 当前只有前端设置 Schema，Python/Node/API 结构会漂移 | 阶段 2 只实现阶段 T 消费的 Slide/Scene/Task/Asset 子集；Contract tests 拒绝未知字段、漏页和未授权重构 | 不换库；缩小 Schema 范围 |
| 持久事务和迁移 | 无数据库 | PostgreSQL + Prisma | 任务幂等、修订、唯一约束和恢复不能由浏览器 Map/JSON 文件承担 | 阶段 T 用真实事务验证同 key 同 payload、同 key 异 payload、部分唯一索引和 forward-only migration | Prisma 不能表达的索引用审查过的 migration SQL；若核心查询不可行再比较最小 `pg` 层 |
| 可恢复异步任务 | 当前只有串行 CLI | BullMQ + Redis/Valkey | 需要并发上限、稳定 jobId、延迟重试和 Worker 恢复 | 阶段 T 验证 outbox、重复投递、lease、取消、Worker kill；记录进程/内存开销 | 若 POC 不能满足语义，先比较 PostgreSQL lease worker，不同时维护两套队列 |
| 模块化 Agent | Python OpenAI SDK + 单次 Prompt | OpenAI Agents SDK JS | 只有在模块编排、可测试 Runner 和追踪收益超过双运行时成本时才值得增加 | 阶段 T 前用 DeepSeek 真实请求验证 Chat Completions、结构化输出、工具调用、超时、重试；官方能力参考 <https://openai.github.io/openai-agents-js/guides/models/> 与 <https://api-docs.deepseek.com/zh-cn/> | 保留相同 Zod 模块 Contract，使用最小 OpenAI SDK Provider；不并行建设两套编排 |
| PPT 结构解析 | `python-pptx`、OOXML 候选、LibreOffice | JSZip + fast-xml-parser | 仅在 Python 适配器无法提供所需关系/z-index/主题信息时需要 | 用 1/10/50/100 页和 14 页导数金样逐字段比较，再决定具体缺口 | 继续把 Python 作为受控适配器；禁止整套重复解析 |
| 分页动画渲染 | Sharp + FFmpeg 已可生成静态视频 | Remotion + KaTeX + React 原生 SVG | 需要可组合时间轴、公式和白名单动画，但性能与许可尚未证明 | 先由阶段 T 用现有栈完成一个 Overlay；阶段 11E 再基准中文字体、25/30 FPS、缓存、许可和资源占用 | 保留相同 Scene/Overlay Contract，用 Sharp/FFmpeg 组件逐步扩展 |
| 资产交付 | 本地磁盘 | 本地 HTTP adapter；生产对象存储待定 | 浏览器不能收到磁盘路径，云端还需生命周期和签名 | 阶段 T 验证 HTTP 下载、范围检查、哈希和链接过期；部署确认后再做云 POC | 保持本地 HTTP，不提前绑定 OSS |
| 中文 TTS | Edge TTS 已可用 | 正式 TTS/备用 Provider 待产品部署确认 | Edge TTS 没有产品所需正式 SLA | 阶段 12 前验证区域、条款、配额、音频质量和故障切换 | 供应商不可用时阻断生产发布，不把开发 Provider 冒充 SLA |
| 前端测试 | 当前无框架 | 阶段 1 选择与 Next 16 官方指南兼容的单元/组件工具；E2E 延后 | 目录重组和 Contract 迁移缺少回归保护 | 先用 2～3 个现有组件和一个 API adapter 测试证明配置；一次只引入一组测试依赖 | 配置不兼容则撤回该依赖选择，保留已写行为用例 |

每个候选在引入前记录固定版本、官方能力、许可/服务条款、POC 命令和结果。许可检查必须发生在对应依赖进入阶段之前，不能统一拖到阶段 12。

## 7. 数据模型设计计划

### 7.1 核心模型

#### Project

- `id`：稳定 UUID/CUID。
- `ownerId`：预留用户隔离。
- `name`、`courseName`、`chapterName`。
- `targetAudience`、`language`。
- `status`：项目聚合状态，不代替任务状态。
- `settingsJson`：通过 `ProjectSettingsSchema`。
- `version`：乐观并发。
- `createdAt`、`updatedAt`、`archivedAt`、`deletedAt`。

#### Presentation

- `id`、`projectId`、`sourceAssetId`。
- `originalFileName`、`sha256`、`fileSize`、`mimeType`。
- `slideCount`、`width`、`height`、`aspectRatio`。
- `parseStatus`、`parserVersion`。
- `revision`：替换课件时递增。

#### Slide

- `id`：数据库稳定 ID，禁止使用数组下标替代。
- `presentationId`。
- `sourceRelId`：PPT 内关系标识。
- `slideNumber`：展示顺序，可变化但不是 ID。
- `thumbnailAssetId`、`renderAssetId`。
- `rawText`、`notes`。
- `elementJson`、`formulaJson`、`layoutJson`、`semanticJson`。
- `criticalRegionsJson`、`safeRegionsJson`。
- `parseConfidence`、`parseWarningsJson`。
- `isSkipped`、`skipReason`。
- `revision`、`updatedAt`。

#### LessonPlan

- `id`、`slideId`。
- `currentRevision`、`locked`、`lockedAt`、`lockedBy`。
- 指向当前 `LessonPlanRevision`。

#### LessonPlanRevision

- `id`、`lessonPlanId`、`revision`。
- `teachingGoal`、`narrationJson`、`derivationJson`、`scenePlanJson`。
- `preservationMode`、`estimatedDurationMs`。
- `modelProvider`、`modelName`、`promptVersion`、`schemaVersion`。
- `inputHash`、`outputHash`。
- `createdBy`（agent/user/rule）、`createdAt`。

#### GenerationTask

- `id`、`projectId`、`presentationId`。
- `kind`：PARSE、PLAN、PREVIEW、GENERATE、VALIDATE 等。
- `status`、`stage`。
- `progressCompleted`、`progressTotal`。
- `currentSlideId`。
- `idempotencyKey`、`inputHash`、`configHash`。
- `presentationRevision`、`lessonPlanSnapshotHash`、`settingsHash`：任务创建时冻结；运行中编辑只影响下一任务。
- `errorCode`、`errorMessage`。
- `retryCount`、`cancellationRequestedAt`。
- `heartbeatAt`、`leaseExpiresAt`、`statusVersion`、`startedAt`、`completedAt`。
- `createdAt`、`updatedAt`。

唯一约束建议：

```text
(projectId, kind, idempotencyKey)
```

#### TaskStep

- `id`、`taskId`、`stage`、可选 `slideId`。
- `status`、`currentAttempt`。
- `inputHash`、`outputHash`。
- `progressCompleted`、`progressTotal`。
- `workerId`、`heartbeatAt`、`leaseExpiresAt`。
- `errorCode`、`errorMessage`。
- `startedAt`、`completedAt`。

若阶段 T 接受 PostgreSQL，逻辑步骤唯一性不能只依赖 `(taskId, stage, slideId)`，因为 PostgreSQL 允许多条 `slideId = NULL`。该候选迁移需要两个部分唯一索引（Prisma 无法表达时使用受审查的 migration SQL）：

```text
UNIQUE (taskId, stage) WHERE slideId IS NULL
UNIQUE (taskId, stage, slideId) WHERE slideId IS NOT NULL
```

#### TaskStepAttempt

- `id`、`taskStepId`、`attemptNumber`。
- `workerId`、`status`、`startedAt`、`heartbeatAt`、`completedAt`。
- `inputHash`、`outputHash`、`errorCode`、`errorMessage`。
- 唯一约束 `(taskStepId, attemptNumber)`。

`TaskStep` 保存当前逻辑状态，`TaskStepAttempt` 保存不可变尝试历史；重试不得覆盖上一 attempt 的诊断证据。

#### AgentRun

- `id`、`taskId`、`slideId`、`module`。
- `provider`、`modelName`、`promptVersion`、`schemaVersion`。
- `inputHash`、`outputHash`、`tokenUsageJson`。
- `status`、`validationErrorsJson`、`createdAt`。

不保存明文 API Key。

#### Asset

统一保存输入、中间和输出资产，避免重复的生命周期逻辑：

- `id`、`projectId`、可选 `taskId`/`slideId`。
- `kind`：SOURCE_PPT、SLIDE_THUMBNAIL、SLIDE_RENDER、AUDIO、CAPTION、PAGE_VIDEO、FINAL_VIDEO、PROJECT_PACKAGE、VALIDATION_REPORT。
- `storageProvider`、`storageKey`。
- `sha256`、`mimeType`、`fileSize`、`durationMs`。
- `validationJson`、`createdAt`、`expiresAt`。
- `lifecycleStatus`、`orphanedAt`、`deletedAt`，用于临时对象和失败 attempt 的有界回收。

PRD 中的 `OutputAsset` 对外表现为 `Asset` 的输出类型视图。数据库和 Worker 永远保存 `storageKey`；API 根据 `assetId` 签发 URL。

### 7.2 迁移原则

- 阶段 T 只创建真实纵切所需的最小开发数据库 Schema，不对当前 Mock Map 做数据迁移。
- 阶段 11 在阶段 T Schema 上使用向前、可兼容的 migration 扩展模型，不重新创建第二套数据库基线。
- 当前 CLI `backend/work` 只作为测试 fixture 来源，不直接导入生产表。
- 通过 POC 的持久化 migration 必须进 Git，开发数据库使用独立测试实例；若选择 Prisma，无法表达的约束使用受审查的 migration SQL。
- 所有 JSON 字段在写入前经过对应 Zod Schema。

## 8. 任务状态和幂等性设计

### 8.1 状态机

PRD 中的用户可见聚合状态：

```text
CREATED
UPLOADING
UPLOADED
PARSING
PLANNING
WAITING_FOR_REVIEW
GENERATING_AUDIO
RENDERING_SLIDES
COMPOSITING
VALIDATING
COMPLETED
FAILED
CANCELLED
```

数据库不把这条列表当作所有任务类型共享的假线性状态机。`GenerationTask.status` 只保存通用生命周期：

```text
CREATED → QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED
```

`kind` 区分 `PARSE`、`PLAN`、`PREVIEW`、`GENERATE`、`VALIDATE`，`stage` 由各 kind 的显式转换表约束；API 再投影为上面的用户可见项目状态。这样解析任务不会被迫经过音频/合成阶段，预览任务也不会冒充完整生成。

规则：

- 终态 `SUCCEEDED`、`CANCELLED` 不允许自动回退；项目聚合 `COMPLETED` 只在最终生成与验证任务成功后出现。
- `FAILED` 重试创建新的 attempt，但复用同一个业务 task 和已通过哈希验证的产物。
- `cancellationRequestedAt` 由 API 写入；Worker 在每个可中断边界检查。
- Worker 通过带版本的 lease 领取步骤；心跳超时后 reconciler 只有在 lease 过期且 attempt 未完成时才能回收。超过最大 attempt 的步骤进入 dead-letter 状态并要求人工处理。
- 取消与完成竞态通过同一事务中的 `statusVersion` 比较解决：已提交成功终态后取消返回 409；已接受取消后，迟到的 Worker 结果只能登记为孤儿候选，不能把任务改回成功。
- 状态转换由服务端状态机函数控制，不能由前端任意 PATCH。
- 运行任务冻结 `presentationRevision + lessonPlanSnapshotHash + settingsHash`；运行中的用户编辑不会悄悄混入当前视频，只为下一任务产生新快照。

### 8.2 真实进度

生产进度不能使用定时器模拟。计算方式：

```text
stageProgress = 已完成工作单元 / 总工作单元
taskProgress  = 各阶段权重 × stageProgress
```

工作单元例子：

- 解析：已解析页数 / 总页数。
- Agent：已通过审核模块数 / 页面总模块数。
- TTS：已完成句数 / 总句数。
- 分页渲染：已完成 slideId 数 / 待渲染 slideId 数。
- 合成和验证：明确的离散步骤。

预计剩余时间只基于历史耗时和当前速率估算，并标记为估算值。

### 8.3 幂等性

- 创建耗时任务的 POST 必须接受 `Idempotency-Key`。
- 相同项目、任务类型、幂等键、输入哈希和配置哈希返回既有任务；同一幂等键配不同请求体返回 409 `IDEMPOTENCY_KEY_REUSED`。
- 若 BullMQ 通过 POC，`jobId` 使用稳定的 TaskStep ID；其他队列/lease 实现必须提供等价稳定去重键。
- 资产用内容哈希去重；数据库唯一约束防止重复记录。
- 页面锁定或修订变化后，按 `parse → plan → audio → page-render → composite → validate` 失效 DAG 只使受影响页面及下游产物失效；测试必须证明未受影响页面资产哈希不变。
- Worker 写资产采用临时对象 → 校验 → 原子记录的顺序。
- 数据库事务与队列发布之间使用 transactional outbox；独立 dispatcher 可安全重放，避免“DB 已提交但队列未发布”造成永久卡住。
- 对象存储与数据库不能跨系统原子提交。未登记临时对象、失败 attempt 和取消后的迟到对象进入有界 orphan 扫描；只有超过保留期且没有 Asset 引用时才删除。

## 9. API 设计计划

### 9.1 响应约定

成功：

```json
{
  "data": {},
  "meta": {
    "requestId": "req_xxx"
  }
}
```

错误：

```json
{
  "error": {
    "code": "TASK_ALREADY_RUNNING",
    "message": "该项目已有生成任务。",
    "retryable": false,
    "details": {}
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

所有请求、响应和错误结构均用共享 Zod 校验。内部堆栈、存储键和磁盘路径不进入响应。

### 9.2 项目与课件

```text
POST   /api/projects
GET    /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
POST   /api/projects/:projectId/archive
DELETE /api/projects/:projectId

POST   /api/projects/:projectId/presentation/upload-url
POST   /api/projects/:projectId/presentation/complete
POST   /api/projects/:projectId/parse
GET    /api/projects/:projectId/slides
```

- `complete` 必须再次检查对象大小、MIME、哈希和 PPTX ZIP 结构。
- `parse` 返回 `{ taskId }`，不等待解析完成。

### 9.3 页面与审核

```text
GET    /api/slides/:slideId
PATCH  /api/slides/:slideId
POST   /api/slides/:slideId/generate-plan
PATCH  /api/slides/:slideId/lesson-plan
POST   /api/slides/:slideId/lock
POST   /api/slides/:slideId/unlock
POST   /api/slides/:slideId/skip
POST   /api/slides/:slideId/preview
```

- 修改计划携带 `revision`；冲突返回 409，避免覆盖用户修改。
- `FULL_REDESIGN` 请求必须包含显式 `userAuthorized: true`。
- 预览是异步任务，并返回预览资产 ID。

### 9.4 任务

```text
POST   /api/projects/:projectId/generate
GET    /api/tasks/:taskId
POST   /api/tasks/:taskId/cancel
POST   /api/tasks/:taskId/retry
```

MVP 使用 TanStack Query 轮询，先不增加 WebSocket/SSE。任务响应包含真实计数、当前 `slideId`、错误码和可重试性。

### 9.5 输出和下载

```text
GET    /api/projects/:projectId/outputs
POST   /api/outputs/:assetId/download-url
```

返回：

```json
{
  "data": {
    "assetId": "asset_xxx",
    "url": "https://...",
    "expiresAt": "2026-07-30T12:00:00Z"
  }
}
```

签发前检查资产存在、哈希、大小和验证状态。URL 过期只重新签发，不重新渲染。

## 10. 核心 Zod Schema 计划

### 10.1 包结构

```text
packages/contracts/src/
├── primitives.ts
├── project.ts
├── presentation.ts
├── slide.ts
├── lesson-plan.ts
├── scene.ts
├── overlays.ts
├── agent.ts
├── task.ts
├── asset.ts
├── api.ts
└── index.ts
```

类型一律由 `z.infer` 生成，不再手写同形状 interface。

### 10.2 关键枚举

- `PreservationModeSchema`
  - `FULL_PRESERVE`
  - `PRESERVE_WITH_OVERLAY`
  - `LOCAL_REBUILD`
  - `FULL_REDESIGN`
- `SlideTypeSchema`
- `MathRiskSchema`：L0～L3
- `TaskStatusSchema`
- `TaskStageSchema`
- `SceneTemplateSchema`
- `AnimationSchema`：仅 PRD 白名单
- `AssetKindSchema`
- `AgentModuleSchema`

### 10.3 页面和原页

`SlideSchema` 至少包含：

- `slideId`、`slideNumber`。
- 原页资产。
- 元素边界框。
- 关键区域和安全区。
- 解析置信度和警告。
- `isSkipped`。

`BaseSlideSchema`：

- `assetId`。
- `preservationMode`。
- `fit: "contain"`。
- `mustShowFullSlide`。
- `fullSlideDurationMs`。
- `fullRedesignAuthorizedByUser`。

`superRefine` 硬规则：

- 未跳过时 `mustShowFullSlide === true`。
- 完整展示时 `fullSlideDurationMs >= 1500`。
- 未授权时拒绝 `FULL_REDESIGN`。
- `fit` 不允许 `cover`。

### 10.4 Agent 输出

每个模块独立 Schema：

- `ContentUnderstandingOutputSchema`
- `TeachingPlanOutputSchema`
- `NarrationOutputSchema`
- `DerivationOutputSchema`
- `VisualStoryboardOutputSchema`
- `ReviewOutputSchema`
- 汇总 `SlideLessonPlanSchema`

统一要求：

- `.strict()` 拒绝未知字段。
- 以 `slideId` 关联，不使用数组下标。
- 公式推导包含输入、输出、变换类型、解释、风险和前后关系。
- 视觉分镜只引用白名单模板和 Overlay 元素。
- 不存在 `script`、`shell`、`html`、`ffmpegCommand` 等可执行字段。
- 所有时间和坐标有上下界。
- L3 或低置信度强制 `requiresHumanReview`。

### 10.5 Overlay

使用 discriminated union：

- `highlightBox`
- `arrow`
- `formula`
- `functionGraph`
- `zoomRegion`
- `callout`

每种元素只接受受控参数。函数表达式使用受限数学语法，不允许 `eval` 或任意 JavaScript。

### 10.6 API 与任务

- `ApiSuccessSchema`
- `ApiErrorSchema`
- `TaskSchema`
- `TaskProgressSchema`
- `TaskEventSchema`
- `SignedDownloadSchema`
- 各端点 Input/Output Schema

网络响应先作为 `unknown`，通过 Zod 后才进入 UI。

## 11. 分阶段实施计划

### 通用阶段门禁

每个阶段开始前必须：

1. 重读本计划对应章节和 PRD相关章节。
2. 输出本阶段目标。
3. 列出准备修改的文件。
4. 列出明确不处理的内容。
5. 检查 `git status`，说明会不会覆盖现有修改。

每个阶段结束后串行执行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

阶段 1 必须把根 `npm.cmd run test` 固化为后端单测与当时适用的前端 unit/component/contract 测试编排，后续不得在新增前端测试时丢掉 `backend:test`。阶段 T 起还需执行验证矩阵中适用的后端集成、3 页金样、媒体和 E2E 命令；阶段 11B 再增加 14 页导数金样。任一门禁缺失或失败，不进入下一阶段。

### 阶段 1：项目初始化与基础设计系统收口

目标：

- 保留现有设计和页面，不重新搭建前端。
- 确认并建立目录重组 Git 基线。
- 补齐测试框架、基础组件测试和路由检查脚本。
- 处理直接依赖安全告警中的可兼容升级。

计划修改：

- 根 `package.json`、`package-lock.json`。
- `frontend/package.json`。
- 新增前端测试配置与 setup。
- 新增路由 HTTP smoke 脚本。
- 少量基础布局/组件测试。

内部顺序：

1. 用户确认目录重组后建立可回退 Git 基线。
2. 先建立并跑通 unit/component/route 测试保护。
3. 直接依赖一次只升级一个，每次单独审查 lockfile diff 并跑完整阶段门；不运行 `npm audit fix --force`。

不处理：

- 不改业务流程和页面视觉。
- 不接真实 API、数据库、Agent、TTS。
- 不批量重写现有组件。

完成标准：

- 现有路由全部 HTTP 200。
- TypeScript、lint、单元/组件测试、生产构建全部通过。
- 有可复用的 `test` 和 `routes:check` 命令。
- 当前目录重组已被用户确认并建立安全基线。

### 阶段 2：数据类型、Zod Schema 和 Mock API

目标：

- 创建 `packages/contracts`，让 Zod 成为唯一业务 Contract 来源。
- 只建立阶段 T 实际消费的项目、页面、原页、最小讲稿/场景、一个 Overlay、任务和资产 Schema；其他字段随真实消费者扩展。
- 让现有 Mock API 返回经过 Zod 校验的数据。

计划修改：

- 新增 `packages/contracts/`。
- 根 workspace 配置。
- `frontend/src/types/` 改为重导出或逐步删除重复 interface。
- `frontend/src/lib/api/` 适配共享 Schema。
- Schema 与状态机单元测试。

不处理：

- 不创建 Prisma 数据库。
- 不运行真实 Agent。
- 不接真实文件上传和视频。

完成标准：

- 非法 Agent JSON、页码/ID、未授权全页重构和漏掉完整原页镜头均被测试拒绝。
- `sourceSlideCoverage` 必须由审核后的场景重新派生；用户修改 `sourceSlides` 后复制旧 coverage 的 fixture 被测试拒绝。
- Mock API 输入输出全部通过共享 Zod。
- 不存在同一结构的 interface + Zod 双份定义。
- 未被阶段 T 消费的 Provider、Overlay 或未来权限抽象没有提前创建。

### 阶段 T：3 页真实产品 tracer bullet

目标：

- 用最薄的一条真实路径证明浏览器、HTTP、持久任务、现有媒体流水线和下载边界可以组成产品。
- 复用现有 CLI 能力，先证明接口和恢复语义；不以重写解析器或渲染器作为成功条件。

进入条件：

- 阶段 1、2 的全部门禁通过，目录重组基线已由用户确认。
- P-01 与 P-02 已分别记录产品决定；阶段 T 的评测范围和 identity/scope 边界与决定一致。
- `docker compose version` 可用，或用户批准了等价、可复现的本地 PostgreSQL/队列方案；当前机器没有 Docker，不能假定此条件已满足。
- 使用当前支持的 DeepSeek 模型完成 Provider 兼容预检；代码和示例中不存在 `deepseek-chat` 生产默认值。
- 固定 3 页 fixture 包含普通文本、OMML 公式、拥挤图文，且有人工确认的原页 PNG 和期望覆盖区域。

最小路径：

```text
P-02 决定对应的测试 principal/identity
→ HTTP 上传 3 页 PPTX 到 Next BFF
→ 私有 HTTP 调用 backend application service
→ 服务端 MIME/大小/哈希/PPTX 结构校验
→ 通过 POC 的持久化候选保存任务快照 + outbox（首测 PostgreSQL/Prisma）
→ 通过 POC 的队列/lease 候选 + Worker（首测 BullMQ/Redis）
→ 现有 Python/LibreOffice 适配器生成原页
→ 一个真实 Agent 模块调用 + 最小 Zod Scene
→ 用户批准
→ Edge TTS + 最终音频时间轴
→ 一个 highlight/arrow Overlay + 数字人候选避让
→ 现有 Sharp/FFmpeg 分页合成
→ ffprobe + 完整解码 + 3/3 页面覆盖 + 1.5 秒镜头
→ 本地 HTTP 下载 MP4/SRT/项目元数据包
```

计划修改：

- 阶段 T 需要的最小 Next Route Handler/BFF client、独立 backend application HTTP service、已接受候选的迁移、outbox、Worker 和本地 HTTP asset adapter；候选 POC 失败时先更新 ADR 与本计划，不静默换栈。
- 现有 Python/Node CLI 外围适配器；CLI 原入口保留用于金样对照。
- 只增加阶段 T 消费的 Contract、fixture、集成与 E2E 测试。
- 前端增加一个受内部 feature flag 控制的真实 adapter；Mock adapter 继续用于独立 UI 测试。

不处理：

- 不引入完整 Remotion、JS PPT 主解析器、OSS、CosyVoice、多 Agent或计费。只有 P-02 选择内部单用户时，正式账号和团队权限才是非目标；其他 P-02 分支必须先修订阶段 T 并实现相应最小身份/租户边界。
- 不承诺任意 PPT、100 页、60 分钟、图片公式 OCR 或完整 Overlay 白名单。
- 不以 no-op Worker、假音频、data URL 或手工复制文件替代路径中的真实边界。

故障验证：

- 同一 key + 同一 payload 两次请求返回同一 task；同 key + 不同 payload 返回 409。
- 在 parse、Agent、TTS、render 各阶段强制终止 Worker，任务由同一业务 task 恢复，资产不重复。
- 取消与 Worker 完成同时发生时只产生一个合法终态。
- 数据库提交后模拟队列发布失败，outbox dispatcher 恢复任务。
- 用户批准后修改讲稿，当前任务仍使用冻结快照，新任务使用新 revision。
- 原页渲染失败时任务阻断并显示明确错误，不生成重排文本页冒充原页。
- 下载另一个项目的 assetId 返回 404/403，响应不含 storage key 或磁盘路径。

完成标准：

- 3/3 未跳过页面完整展示，全部不少于 1.5 秒；严重遮挡 0。
- H.264、AAC、`yuv420p`、Contract 声明的测试 FPS（25/30 枚举之一）、Fast Start、完整解码和音视频时长差全部为硬门；默认 FPS 仍由阶段 11E 基准决定。
- 真实任务进度来自工作单元；页面重载不重复创建任务。
- MP4、SRT 和项目元数据包只通过 HTTP 下载，内部路径扫描为 0。
- 固定输入快照和固定渲染版本连续运行两次时，结构化场景、页面覆盖证据和媒体规格一致；不要求重新调用 LLM 得到字节级相同文本。
- 现有 CLI 金样仍通过；真实 adapter 可关闭并安全回到 Mock/CLI，不迁移任何生产数据。

回滚：

- 阶段 T 只使用可丢弃开发数据库、队列和本地资产命名空间；迁移失败时停止并重建测试环境，不对生产数据执行 down migration。
- 新真实 adapter 默认关闭；回滚应用代码后现有 Mock 和 CLI 仍可运行。
- 已登记的临时资产保留到诊断期结束，再由引用检查后的清理任务回收。

阶段 3～10 的共同约束：先用代码和测试列出现有实现与目标的差距，只修改缺口；已有状态和视觉不重写。Mock adapter 用于确定性状态测试，真实 adapter 用于阶段 T 回归，两者必须消费同一 Contract。任何阶段若没有实际缺口，记录证据后直接通过，不为满足编号制造修改。

### 阶段 3：首页与项目列表

目标：

- 在现有首页上补齐搜索、筛选、新建、复制、归档和删除，并让真实 adapter 覆盖阶段 T 固定项目之外的项目生命周期。

计划修改：

- `frontend/src/components/projects/`。
- 共享 Project Contract、真实 Project API/repository 与 Mock fixture adapter。
- 对应 Contract、组件和真实 API 集成测试。

不处理：

- 不超出 P-02 已确认的身份范围：内部单用户分支继续使用阶段 T 固定 principal；个人/机构分支使用阶段 T 已建立的最小 identity/tenant principal。本阶段不新增团队权限层或计费。
- 不更换现有首页视觉方向。

完成标准：

- 初始、加载、空、成功、错误、重试和删除确认可测试。
- 所有项目操作通过同一 API 适配层；真实 adapter 在开发数据库完成 CRUD，Mock adapter 只提供确定性 fixture。
- 同一 Contract suite 同时覆盖真实与 Mock adapter，页面代码不直接操作 Mock Map。

### 阶段 4：PPT 上传流程

目标：

- 把阶段 T 的固定 3 页 `.pptx` 上传扩展为 100 MB、中文名、MIME、错误、取消和重试的真实用户流程；`.ppt` 在本阶段完成上传与明确状态，实际转换能力归阶段 11B。

计划修改：

- `frontend/src/app/upload/`。
- `frontend/src/components/upload/`。
- 上传 Contract、真实 Route Handler/asset adapter 与 Mock fixture adapter。
- 服务端文件校验、幂等和取消集成测试。

不处理：

- 浏览器不解包 PPT、不调用 LibreOffice。
- 不上传到生产对象存储。

完成标准：

- 状态覆盖完整。
- 前端只做快速提示；真实服务端重新执行 MIME、大小、哈希和 PPTX 结构校验。
- 同一幂等键与相同 payload 返回同一 task，不同 payload 返回 409。
- `.pptx` 可进入真实解析；`.ppt` 在阶段 11B 转换未完成前返回稳定的“转换能力未就绪”状态，不得伪装为解析成功。
- Mock adapter 只复现相同状态和错误 Contract，不替代真实上传验收。

### 阶段 5：解析流程

目标：

- 把阶段 T 的真实解析状态接入现有页面，并扩展原页缩略图、公式、元素警告、低置信度和显式降级。

计划修改：

- 解析路由和 `components/parsing/`。
- 真实 `ParsedSlide`/`Task` API adapter 与原页资产访问。
- Mock fixture 只用于错误、低置信度和重试等确定性组件状态。

不处理：

- 不在浏览器解析 PPT。
- 不调用 LLM。

完成标准：

- 真实响应中的每一页使用稳定 `slideId`，页面数、当前页、警告和真实工作单元进度可表达。
- 原页失败进入阻断或可审计人工降级，不生成重排文字页冒充原页。
- 定时进度只留在显式 Mock adapter，真实 adapter 不推算进度。

### 阶段 6：课程编辑工作台

目标：

- 在现有三栏工作台中使用原页作为默认预览。
- 把阶段 T 的真实项目修订接入原页/增强预览、讲稿、推导、分镜、保留模式、跳过、锁定和单页重生成表单。

计划修改：

- `frontend/src/components/workspace/`。
- 课程计划、场景和 Overlay Contract。
- 真实 revision/approval/regeneration API、Mock fixture adapter、Contract 与组件测试。

不处理：

- 不做自由时间线和任意拖拽。
- 不扩展阶段 T 白名单之外的复杂关键帧动画；新增 Overlay 按阶段 11E 门禁执行。

完成标准：

- 默认预览真实原页资产，不再重新设计页面作为默认画面。
- `FULL_REDESIGN` 需要显式二次确认。
- revision 冲突返回 409；锁定页面不会被真实或 Mock 重生成覆盖。
- 单页修改只失效该页及下游资产，未受影响页哈希保持不变。

### 阶段 7：数字人与声音配置

目标：

- 在阶段 T 的真实音频/渲染边界上补全数字人站位、安全区预览、音色、语速、字幕和试听。

计划修改：

- `teaching-settings-form.tsx` 及拆分后的单一职责组件。
- Avatar、Voice、Caption Contract、真实设置/试听 API 与 Mock fixture adapter。

不处理：

- 不绑定生产 TTS 供应商；开发继续使用阶段 T 已验证的 Edge TTS。
- 自定义数字人是否实施由 P-04 决定；未确认时不建设上传和素材审核。
- 不做音素级口型。

完成标准：

- 表单 Schema 来自共享 Contract。
- 真实 adapter 返回受检 HTTP 音频资产；Mock HTTP fixture 只用于组件测试，不使用纯计时器冒充试听。
- 能表达并保存 per-slide 候选站位和“允许隐藏”，拥挤页真实预览不发生严重遮挡。

### 阶段 8：视频生成任务页面

目标：

- 让 UI 完整消费阶段 T 的持久任务状态、真实进度和恢复语义。

计划修改：

- `components/generation/`。
- 真实 Task API adapter、取消、重试、幂等和错误码；Mock adapter 只保留状态 fixture。

不处理：

- UI 不同步执行渲染；真实渲染继续由 Worker 完成。
- 不实现 WebSocket；使用 TanStack Query 轮询。

完成标准：

- 状态、当前 `slideId`、完成/总计、错误码和可重试性全部展示。
- 页面重新挂载通过真实幂等边界不会重复创建任务。
- 定时器只存在于 Mock adapter 内。
- Worker 重启和取消竞态用真实 integration fixture 回归，UI 只显示服务端合法终态。

### 阶段 9：视频结果页

目标：

- 把阶段 T 的真实 MP4/SRT/项目元数据包接入播放器、验证报告和下载链接续签，并补齐错误恢复。

计划修改：

- `components/result/`。
- 真实输出资产/下载 API、授权和续签；Mock HTTP fixture 只服务组件测试。

不处理：

- 不返回磁盘路径。
- 不接生产对象存储。

完成标准：

- 浏览器通过真实受控 HTTP 地址播放和下载阶段 T 资产，不使用 data URL、storage key 或内部路径。
- 链接过期只重新签发，不触发重渲染；跨项目 assetId 返回 403/404。
- 播放、下载和验证失败有重试状态。

### 阶段 10：统一审查与优化

目标：

- 对阶段 T 与阶段 3～9 扩展后的真实产品流进行可访问性、响应式、错误状态、性能和回归审查。

计划修改：

- 只修改审查发现的具体文件。
- 增加 Playwright 关键流程 E2E。

不处理：

- 不在审查阶段新增数据库、队列、渲染器或生产 Provider。
- 不借审查重做视觉风格。

完成标准：

- 核心流程桌面和移动端通过。
- 键盘、焦点、对比度和错误恢复通过。
- 上传失败恢复、审核冲突、任务取消/恢复和下载续签等高风险路径有自动化覆盖；其余展示组合由组件测试覆盖，不追求为每个视觉排列编写重复 E2E。
- 固定 3 页真实 tracer 与至少一条扩展真实项目流通过 E2E；Mock 与真实 adapter 的 Contract suite 相同，切换 adapter 不需要重写页面测试。

### 阶段 11：真实流水线硬化与覆盖面扩展

阶段 T 已经建立最小真实闭环。阶段 11 只扩展恢复语义、PPT 覆盖面、教学质量、渲染能力和规模；内部仍需按小里程碑逐个完成。每个字母阶段门禁通过后停止，不一次性提交。

#### 11A：持久化与任务恢复硬化

- 完成 Task/TaskStep/TaskStepAttempt、幂等、snapshot、lease、心跳、取消、重试和 dead-letter 语义。
- transactional outbox、dispatcher 和 reconciler。
- 重复投递、Worker kill、DB/队列短暂不可用、取消/完成竞态的故障注入。
- 阶段 T 留下的 no-op 连接预检只用于诊断候选基础设施；阶段 11A 的恢复测试必须继续使用真实产品 Worker 和真实资产边界。

#### 11B：PPT Parse Worker

- 安全上传完成校验。
- `.ppt` 转换。
- 先扩展现有 Python 适配器；只为已证明的缺口引入 JSZip/fast-xml-parser。
- 图片公式 OCR 是否纳入本阶段由 P-11 决定；若未获延期批准，它是 Web MVP 必需能力，必须有金样和人工标注准确率门。
- 原页 PNG、稳定 `slideId`、元素坐标和解析警告。
- 1/10/50/100 页 fixture。
- 原页渲染全失败时阻断或进入显式人工降级，不继续生成重排文本页。

#### 11C：模块化单 Agent

- 使用阶段 T 兼容 spike 通过的最小 Provider；只有证据支持时采用 OpenAI Agents SDK。
- 六模块接口和版本化 Prompt。
- `LLM_FAST_MODEL`/`LLM_REASONING_MODEL` 必填配置。
- Zod 校验、最多两次修复、规则降级和人工审核。
- Agent 评测集。

#### 11D：Audio Worker

- TTS 文本规范化。
- Edge TTS Provider、缓存和音频验证。
- 扩展供应商中性的正式 TTS Provider Contract；具体主/备供应商只在 P-08 与区域、条款、配额、SLA、质量 POC 通过后实现，不提前创建 CosyVoice 专用占位层。
- 基于最终音频的 SRT。

#### 11E：确定性分页渲染

- 在许可与基准通过后决定是否采用 Remotion；目标统一为经确认的 25 或 30 FPS。
- 原页 Layer 1。
- 白名单 Overlay、React 原生 SVG 组件、KaTeX。
- 数字人安全区、移动/缩小/隐藏。
- 每页独立片段和局部重渲染。
- 每个 attempt 使用隔离目录并清理/拒绝哈希不匹配的旧帧。

#### 11F：合成、验证和交付

- FFmpeg 合成与 Fast Start。
- ffprobe、完整解码、H.264/AAC、`yuv420p`、目标 FPS、Fast Start、原页覆盖、1.5 秒完整镜头、遮挡、黑帧、静音/响度和抽帧报告；目标规格不符合时必须失败，不能只记 warning。
- 本地/对象存储 adapter；阶段 12 或部署确认前不把 OSS 设为必需。
- HTTP/签名下载和孤儿资产回收。
- 10 页真实高数 PPT 的端到端验收。

阶段 11 不处理：

- 多 Agent。
- 高精度口型和 GPU。
- 团队权限和计费。

完成标准：

- 阶段 T 回归、10 页样本和 14 页导数金样均通过。
- 未跳过页覆盖率 100%，严重遮挡 0。
- 失败可定位到 stage + slideId。
- Worker 重启后可恢复。
- API 不暴露内部路径。
- 冻结讲稿、分镜、素材、字体、模板、运行时和 seed 后产生视觉一致结果；重新调用 LLM 不承诺原始文本完全相同。

### 阶段 12：生产化部署

目标：

- 从本地纵向闭环升级为经 P-08 确认的可控云环境；阿里云只是中国大陆方向下的候选之一。

计划内容：

- 硬化阶段 T/11 已有的本地 Compose；生产镜像与 Worker 角色拆分。
- 非 root Worker、资源限制、健康检查。
- 根据已确认区域和阶段 T 接受的技术选择部署持久化、队列/lease 和对象存储；中国大陆部署确认后才考虑绑定 RDS/OSS。
- 正式 TTS 主 Provider 和备用 Provider；CosyVoice 取决于区域、条款、配额和质量 POC。
- 日志、指标、告警、清理与成本统计。
- 账号、权限和用户隔离。
- 内部 feature flag、固定 fixture canary、版本固定、旧 CLI/静态原页降级、向后兼容迁移和回滚触发器。
- 商业许可复核。

不处理：

- 除非产品确认，不建设团队计费、多 Agent 或 GPU Worker。

完成标准：

- 云端真实任务、失败恢复和下载通过。
- 密钥只在服务端环境变量/密钥服务。
- 监控能定位每阶段耗时、Token、TTS、渲染、重试和失败码。

## 12. 当前主要风险

| 风险 | 等级 | 影响 | 缓解 |
|---|---|---|---|
| 整个前后端目录尚未被 Git 跟踪 | P0 | 后续修改难以区分移动、删除和覆盖 | 阶段 1 前确认并建立基线 |
| 原页覆盖规则当前会漏掉合并场景的后续页 | P0 | 违反核心产品原则 | Contract、渲染和验证三层硬门 |
| Agent 输出不是共享 Zod | P0 | 不可控字段和 Schema 漂移 | 阶段 2 先建唯一 Contract |
| 输出 JSON 含绝对路径 | P0 | 未来 API 泄漏内部结构 | 内部 Asset ID + 签名 URL |
| 数字人无避障 | P0 | 遮挡标题/公式/字幕 | 安全区模型、布局评分、渲染后验证 |
| 前后端数据结构双份维护 | P1 | 联调和迁移失败 | `packages/contracts` |
| Python/TypeScript 双运行时 | P1 | Contract 和部署复杂 | Python 只做受控解析适配，TS 边界 Zod |
| PowerPoint 与 LibreOffice 渲染差异 | P1 | 原页视觉不一致 | 金样、多环境对比、字体容器化 |
| Edge TTS 无正式 SLA | P1 | 生产语音中断 | 仅开发使用；生产选择通过区域、条款、配额、SLA 和质量 POC 的主/备 Provider |
| 任务重试非幂等 | P1 | 重复计费/重复资产 | DB 唯一键、哈希和稳定队列/lease 去重键 |
| 当前依赖有安全告警 | P1 | 构建链与运行风险 | 阶段 1 兼容升级、锁文件审查 |
| Remotion/字体/FFmpeg 许可 | P1 | 商业化阻断 | 每项依赖引入前完成许可清单；Remotion 最晚在阶段 11E 门禁前完成 |
| 数学错误 | P1 | 教学内容风险 | 风险等级、推理模型复核、人工确认 |
| 100 页/长视频性能未测 | P2 | 超时和成本不可控 | 阶段 T 先做 3 页真实链路，再做 10/50/100 页基准 |

## 13. 假设、产品决策账本与 STOP 条件

状态只使用 `VERIFIED`、`UNVERIFIED`、`REJECTED`。`UNVERIFIED` 不是默认需求；到截止阶段仍未确认时执行表中的保守 fallback 或停止。

### 13.1 产品决策账本

| ID | 决策 | 状态 | 当前证据 | Owner | 最晚截止 | 失效信号与 fallback |
|---|---|---|---|---|---|---|
| P-01 | 首发评测是否高等数学优先，而不承诺全部学科同等效果 | UNVERIFIED | 当前 PRD 场景与已有金样偏数学，但目标用户包含普通理论课程 | 产品 | 阶段 T 前 | 若要求全学科同效，停止并重做数据集、Prompt、指标和范围；推荐数学优先、Contract 保持通用 |
| P-02 | 首发用户是内部单用户、个人教师还是机构团队 | UNVERIFIED | 当前没有账号、权限或数据库 | 产品 | 阶段 T 前 | 内部单用户可用测试 principal；个人账号需最小真实 identity；机构多租户必须先修订阶段 T 范围并补 tenantId、租户隔离和越权测试，不能沿用内部 principal 非目标 |
| P-03 | 单视频最大时长 | UNVERIFIED | 60 分钟只是计划假设，没有容量基准 | 产品 | 阶段 11 性能基准前 | 未确认时只承诺 3/10 页测试范围，不发布长视频上限；确认后设 Worker timeout、磁盘和成本预算 |
| P-04 | 是否支持自定义数字人上传 | UNVERIFIED | PRD 待确认；当前只有内置 PNG | 产品 | 阶段 7/8 差距实施前 | 未确认时保留内置授权素材，不建设上传、裁切和素材审核 |
| P-05 | 是否支持 9:16 和 1:1 | UNVERIFIED | PRD 已明确首版 16:9，但额外比例待确认 | 产品 | 阶段 7/11E 前 | 未确认时只实现已明确的 16:9；Contract 不为未来比例创建无人使用的布局分支 |
| P-06 | 是否需要背景音乐和品牌片头 | UNVERIFIED | PRD 待确认 | 产品 | 阶段 7/11E 前 | 未确认时不建设多轨混音和品牌模板 |
| P-07 | L2 数学风险是否强制人工确认 | UNVERIFIED | PRD 要求高能力模型复核，但“是否强制人工”仍待定 | 产品/教学审核 | 阶段 11C 前 | 未确认时 L2 不自动进入最终生成；界面显示待审核，L3 始终强制人工 |
| P-08 | 是否必须中国大陆部署 | UNVERIFIED | PRD 只给出阿里云建议 | 产品/运维 | 阶段 12 的供应商 POC 前 | 未确认时使用 Provider-neutral Contract、本地 HTTP 资产和开发服务，不绑定 OSS/CosyVoice |
| P-09 | “项目包”是元数据导出，还是可离线完整复现工程 | UNVERIFIED | MVP 要求项目包，PRD 又单列离线复现待确认 | 产品 | 阶段 9/11F 前 | 未确认时只交付版本化项目元数据、讲稿、场景和资产清单；不宣称离线可重新渲染 |
| P-10 | 是否需要用量计费和团队权限 | UNVERIFIED | PRD 待确认，当前无账号 | 产品 | 阶段 12 前 | 未确认时不建设；若提前要求，停止并重做身份、审计、配额和账单范围 |
| P-11 | 是否批准把图片公式 OCR 从 Web MVP 延期 | UNVERIFIED | PRD 的公式链包含数学 OCR；阶段 T 只是不覆盖，并不构成范围删除授权 | 产品/教学审核 | 阶段 11B 前 | 未批准延期时，阶段 11B 必须实现并通过版本化图片公式金样；批准延期时保留原图与人工确认，但明确不宣称图片公式可编辑 |

P-01～P-10 是 PRD 十项待确认；P-11 是本计划提出的额外范围变更请求。各项必须分别确认，不能把“部署地区、16:9、时长”或“用户画像、账号架构”捆成一个不可拆决定。

### 13.2 技术假设账本

| ID | 假设 | 状态 | 证据 | 截止阶段 | 失效动作 |
|---|---|---|---|---|---|
| T-01 | 当前 `frontend/` 97 文件、`backend/` 19 文件和大规模目录重组是用户认可的有效基线 | UNVERIFIED | 2026-07-30 `git status` 和文件计数只证明物理现状，不能证明用户授权 | 阶段 1 | 禁止重置、暂存或提交；由用户确认意图和授权后建立基线 |
| T-02 | 当前依赖审计为 3 moderate、20 high | VERIFIED | 2026-07-30 官方 npm registry audit | 阶段 1 | 先测试保护，再一次一个直接依赖升级；不运行 force fix |
| T-03 | Agents SDK 可连接 OpenAI-compatible Chat Completions | VERIFIED | 官方 SDK 支持 `baseURL` 与 `useResponses: false` | 阶段 T | 只说明传输能力；DeepSeek 端到端仍需 T-04 |
| T-04 | DeepSeek 与选定编排层完整兼容 | UNVERIFIED | 官方 DeepSeek 支持 OpenAI Chat Completions，但当前代码默认模型已停用 | 阶段 T | 真实测试结构化输出、工具、超时和重试；失败则用最小 OpenAI SDK Provider |
| T-05 | PostgreSQL/Prisma + BullMQ/Redis 满足任务恢复语义 | UNVERIFIED | 目标方案尚未安装或运行 | 阶段 T | 用 outbox/lease/kill 测试证明；失败则比较 PostgreSQL lease worker |
| T-06 | Remotion 比现有 Sharp/FFmpeg 更适合目标动画 | UNVERIFIED | 尚未安装、未做性能或许可验证 | 阶段 11E | 先用现有栈完成 T；失败时保留 Scene Contract，比较最小替代 |
| T-07 | 当前机器可运行 Docker Compose | REJECTED | 2026-07-30 `Get-Command docker` 返回 missing | 阶段 T | 阶段 1/2 可继续；进入 T 前必须提供 Docker 或经批准的等价可复现环境 |
| T-08 | 30 FPS 是首版最终选择 | UNVERIFIED | PRD 允许 25 或 30，当前没有足够基准偏向任一值 | 阶段 11E | 以资源/播放兼容基准选择；选择前 Contract 使用受限枚举而非单值 |

### 13.3 STOP 条件

- 目录重组未获用户确认或工作区出现来源不明的重叠改动：不得进入阶段 1 或建立 Git 基线。
- P-01 或 P-02 尚未确认：不阻断可逆的阶段 1/2，但不得进入阶段 T。
- P-08 尚未确认：不阻断供应商中性的阶段 1～11；不得执行阶段 12 的供应商绑定或生产发布。
- T-07 未解决：不得进入阶段 T，但不阻止纯文档、阶段 1 或阶段 2。
- 同一阶段任一 typecheck、lint、测试、build、route、golden、media 或 E2E 门失败：不得进入下一阶段。
- PRD 原页优先原则、首版用户范围或部署约束被改变：先更新 ADR、数据/权限/容量计划，再继续。
- 没有合法可用的模型、TTS、字体、数字人素材、视频库或存储服务条款：不得发布依赖该能力的生产版本。
- 产品要求首版实时直播、多路高并发生成或全学科同等准确率：当前计划失效，停止并重新定范围。

## 14. 范围挑战：还能删掉什么

在不删除当前需求的前提下，已主动削减：

- 不建设多 Agent，只保留可替换的模块接口。
- 不建设 WebSocket，MVP 使用轮询。
- 不重写全部 Python 原型，先包成适配器并用金样保护。
- 阶段 T 不做图片公式 OCR，先以原图和人工确认验证纵切；完整 Web MVP 是否延期由 P-11 单独确认。
- 不做自由时间线、任意 HTML/代码生成。
- 建议不做自定义数字人、9:16、1:1、背景音乐和品牌系统；这些削减等待 P-04～P-06 确认。
- 不做 GPU 口型和生成式视频。
- 不为 UI Mock 横向铺开全量数据库与 Worker；只在阶段 T 建设纵向切片需要的最小真实边界。

不能删除：

- Zod Contract。
- 原页完整展示硬门。
- 幂等任务和真实状态。
- 安全上传、资产隔离和公开 HTTP/签名下载。
- ffprobe/解码/覆盖/遮挡验证。
- 人工审核和可追溯版本。

## 15. 建议优先开始的阶段

等待目录重组意图与安全 Git 基线授权确认后，优先执行**阶段 1：项目初始化与基础设计系统收口**。P-01、P-02 在阶段 T 前确认，P-08 在阶段 12 供应商 POC 前确认，不阻断阶段 1。

原因：

- 当前页面已经很多，重新搭建会覆盖有效工作。
- 整个 `frontend/`、`backend/` 和文档重组尚未建立 Git 基线。
- 前端没有自动化测试，无法安全进入 Contract 迁移。
- 当前依赖有安全告警。
- 阶段 1 完成后，阶段 2 才能用测试保护最小共享 Zod Schema；随后必须先完成阶段 T 的真实纵向切片，再按证据补阶段 3～10 的差距。

本计划获确认前，不自动开始阶段 1。

## 16. 失败恢复、清理与回滚契约

### 16.1 跨边界失败恢复矩阵

下表的次数是 MVP 默认上限；只有基准或供应商 SLA 证据才能在对应阶段调整。所有重试使用同一业务 task、新的 `TaskStepAttempt`，不得新建重复资产。

| 边界 | 失败前持久化 | 状态与用户可见行为 | 默认恢复/重试 | 清理 | 故障注入验收 |
|---|---|---|---|---|---|
| 上传/完成回调 | upload session、临时 asset、已收字节和哈希状态 | `UPLOAD_FAILED`；显示损坏、超限、MIME 或网络错误 | 网络可续传；结构/MIME/加密错误不自动重试，要求重选文件 | 未完成对象 24 小时后按引用检查删除 | 截断、错误 MIME、ZIP Bomb、断网、重复 complete |
| Task + outbox 事务 | 请求哈希、幂等键、冻结 revision、task、outbox 同事务 | `CREATED/QUEUED`；dispatcher 延迟时显示“排队中” | dispatcher 指数退避，最多 10 次/15 分钟；reconciler 扫描未发布 outbox | 无外部对象时无需清理 | DB commit 后阻断队列，恢复后只出现一个 job |
| Worker lease | TaskStep、Attempt、lease、输入哈希 | `RUNNING/RECOVERING`；心跳过期显示“正在恢复” | lease 过期后新 attempt 接管；每逻辑步骤最多 3 attempts，之后 dead-letter | attempt 隔离目录保留诊断期，再按引用清理 | kill 进程、暂停心跳、重复投递 |
| LibreOffice/PowerPoint | 已验证 source asset、parse step | `FAILED` 或显式 `WAITING_FOR_REVIEW`；定位到文件/页 | 进程崩溃最多重启 1 次；确定性损坏/加密不重试 | 终止子进程树，删除 attempt 临时 PDF/PNG | kill LibreOffice、缺字体、损坏 PPTX、全页 PNG 缺失 |
| Agent Provider | 冻结 slide input、Prompt/Schema/model version、AgentRun | `PLANNING` 重试或 `WAITING_FOR_REVIEW`；显示 provider/校验错误码 | HTTP 限流/5xx 最多 3 attempts，带抖动退避；每次响应最多 2 次受限 JSON 修复，之后规则降级或人工 | 不落盘密钥；无效原始输出按脱敏保留期保存 | 429、超时、非法 JSON、未知字段、模型名无效 |
| 人工编辑/批准 | LessonPlanRevision、expected revision | 409 冲突；展示“内容已被更新”，不覆盖用户文本 | 用户重新载入并显式合并；批准时重算覆盖派生值 | 无 | 两个客户端并发保存；编辑后批准；批准后生成 |
| TTS | 规范化文本、provider/version、句子哈希 | `GENERATING_AUDIO` 或 `FAILED`；定位句子 | 每句最多 4 attempts；重新切分一次后可切备用 Provider（若已配置） | 无效/零时长音频不登记，attempt 文件清理 | 0 字节、长静音、429、网络断开、错误采样率 |
| 页面渲染/FFmpeg | 冻结场景、音频、模板/字体/runtime hash | `RENDERING_SLIDES` 或 `FAILED`；定位 `slideId` | 每页最多 2 attempts；只重做失败页和失效下游 | 每 attempt 独立帧目录；旧帧哈希不符即拒绝，不能混入新任务 | kill FFmpeg、磁盘满、旧帧残留、单页坏素材 |
| 验证 | 候选视频、字幕、覆盖证据 | `VALIDATING` 或 `FAILED`；列出硬门 | 可修复封装问题最多重封装 1 次；内容/覆盖/遮挡失败回到对应上游，不盲重试验证 | 未通过资产不可签发，保留诊断期 | 非 H.264/AAC、错误 FPS/pix_fmt、无 Fast Start、漏页、黑帧 |
| 资产登记/对象存储 | 临时对象、内容哈希、期望 Asset 元数据 | task 保持运行或失败，不暴露临时 URL | 上传最多 3 attempts；DB 登记失败由 orphan reconciler 对账 | 未登记对象超过 24 小时且无引用时删除 | 对象成功/DB 失败、重复对象、跨项目 assetId |
| 下载签名/HTTP | 已验证 Asset 与项目范围 | 404/403/410 或可重试 503；不触发渲染 | 过期只重新签发；存储短暂错误由用户重试 | 无 | 过期 URL、错误 owner、文件哈希变化 |
| 取消 | `cancellationRequestedAt`、statusVersion | “正在取消”后进入单一 `CANCELLED` 或已完成 409 | 子进程先优雅终止 10 秒，再终止进程树；迟到结果不得改终态 | 未登记部分产物按 orphan 规则回收 | 取消与完成同毫秒、取消 FFmpeg、重复取消 |

### 16.2 下游失效与清理

默认依赖 DAG：

```text
source/presentation revision
→ parsed slide
→ lesson-plan revision
→ normalized TTS text
→ sentence audio
→ page timeline
→ page video
→ final composite
→ validation report
→ signed delivery
```

- 修改讲稿：失效该页音频及其下游，不失效解析和其他页计划。
- 修改 Overlay/数字人布局：失效该页视频及其下游，不重做音频。
- 替换 PPT：创建新的 Presentation revision；按内容哈希复用真正相同页面，禁止按页码误复用。
- 取消/失败：已经通过哈希与验证的上游资产可复用；未登记或未验证产物进入隔离清理。
- 清理任务先查询 Asset/TaskStep 引用，再删除超过保留期的临时对象；任何无法证明无引用的对象只告警，不自动删除。

### 16.3 变更回滚

| 变更类型 | 发布方式 | 回滚方式 |
|---|---|---|
| 阶段 1 依赖升级 | 测试保护后一次一个直接依赖，独立锁文件 diff | 回退该依赖与锁文件修改；不运行 `npm audit fix --force` |
| Contract | additive 优先，Schema 版本与兼容 fixture | 保留上一版本 reader/adapter 到旧任务完成；破坏性字段必须有迁移阶段 |
| 数据库 | expand → backfill → switch read/write → contract，向前 migration | 回滚应用到仍兼容的新旧 Schema；生产不用破坏性 down migration |
| 队列/Worker | 内部 feature flag、固定 job kind canary | 停止新 job，旧 Worker 完成/取消；dispatcher 可暂停，outbox 保留 |
| Agent Prompt/model | 版本化、离线 eval、固定样本 canary | 新任务切回上一版本；运行中的任务继续使用冻结版本 |
| 渲染器/字体/模板 | 版本化 asset 与双版本验证 | 新任务切回上一 renderer；旧资产仍可下载，必要时仅重渲染受影响页 |
| 存储/TTS Provider | Provider flag 和小流量 canary | 切回已验证 Provider；Contract、assetId 和任务快照不变 |
| 生产应用 | 内部用户 → 固定 fixture → 小流量灰度 | 错误率、漏页、严重遮挡、重复任务或下载越权触发自动停止新任务并回滚应用 |

## 17. 验证矩阵与指标定义

### 17.1 阶段命令、预期结果和产物

计划中的脚本在对应阶段创建后必须可从仓库根目录执行。当前不存在的脚本不得提前宣称通过。

| 阶段 | 命令 | 预期结果 | 必留产物 |
|---|---|---|---|
| 当前/阶段 1 | `npm.cmd run typecheck` | TypeScript 0 error | 控制台日志 |
| 当前/阶段 1 | `npm.cmd run lint` | ESLint 0 warning/error | 控制台日志 |
| 当前/阶段 1 | `npm.cmd run backend:test` | 当前 4 个测试及新增后端测试全部通过 | unittest 汇总 |
| 当前/阶段 1 | `npm.cmd run build` | Next production build 成功 | `.next/BUILD_ID` |
| 阶段 1 | `npm.cmd run test:unit` | 工具与 API adapter 边界用例全部通过 | 测试报告 |
| 阶段 1 | `npm.cmd run test:components` | 选定的现有状态组件在 loading/error/retry 下通过 | 测试报告 |
| 阶段 1 | `npm.cmd run routes:check` | `/`、`/upload`、工作台、解析、生成、结果 6 路由均为 200，服务进程正常回收 | 路由/状态码表 |
| 阶段 2 | `npm.cmd run test:contracts` | unknown 字段、错误 ID、漏页、陈旧 coverage、未授权重构全部被拒绝 | Contract fixture 与报告 |
| 阶段 T/11A | `npm.cmd run test:integration -- task-recovery` | 幂等、outbox、重复投递、Worker kill、取消竞态全部通过且无重复 Asset | DB/队列事件摘要 |
| 阶段 T | `npm.cmd run golden:ppt -- --fixture tracer-3.pptx` | 3 页 fixture 的页数、稳定 ID、原页 PNG 和已批准基线一致；现有 CLI 与新 adapter 结果可对照 | 解析 JSON、原页哈希、适配器差异报告 |
| 阶段 T | `npm.cmd run test:e2e -- tracer-bullet` | 3 页从 HTTP 上传到 HTTP 下载闭环通过 | taskId、assetIds、脱敏运行报告 |
| 阶段 3 | `npm.cmd run test:components -- projects` | 项目状态覆盖通过；真实/Mock adapter Contract suite 一致 | 组件与 Contract 报告 |
| 阶段 4 | `npm.cmd run test:integration -- upload` | `.pptx` 真实上传、校验、幂等、取消通过；`.ppt` 未转换时返回稳定状态 | 上传任务与安全校验报告 |
| 阶段 5 | `npm.cmd run test:integration -- parsing` | 真实页数、稳定 `slideId`、原页资产、警告和进度可回读 | task/slide/asset 摘要 |
| 阶段 6 | `npm.cmd run test:integration -- workspace-revisions` | 409 冲突、锁定、单页失效和未受影响页哈希不变 | revision 与资产哈希报告 |
| 阶段 7 | `npm.cmd run test:integration -- media-preview` | HTTP 试听可解码；拥挤页站位无严重遮挡 | 音频探针与遮挡报告 |
| 阶段 8 | `npm.cmd run test:integration -- task-ui` | 重挂载不重复创建；取消/恢复只显示服务端合法终态 | task 事件摘要 |
| 阶段 9 | `npm.cmd run test:integration -- asset-delivery` | 播放、续签、过期和跨项目拒绝通过，无内部路径 | 下载/授权报告 |
| 阶段 11B | `npm.cmd run golden:ppt -- --fixture derivative-14.pptx` | 页数、稳定 ID、结构字段、原页 PNG 与批准基线一致 | 解析 JSON、图像差异报告 |
| 阶段 11B（P-11 未批准延期时） | `npm.cmd run test:ocr -- --fixture math-image-labeled` | 报告检测 recall、规范化 LaTeX exact match 和人工未决率；达到 P-11 决策中批准的阈值，静默漏检/删除为 0 | 标注集版本、逐公式差异、人工确认队列 |
| 阶段 11C | `npm.cmd run eval:agent` | 记录首次/修复后 Schema 率、数学/照读/冲突错误，不因样本不足伪报百分比 | 版本化 eval 报告 |
| 阶段 11D | `npm.cmd run test:audio` | 可解码、采样率/声道、静音/削波、时间轴和缓存用例通过 | 音频检查报告 |
| 阶段 11E | `npm.cmd run test:render` | 单页修改仅改变该页资产；固定输入渲染一致；无旧帧污染 | 页面哈希和图像差异报告 |
| 阶段 T/11F | `npm.cmd run verify:media` | H.264/AAC、`yuv420p`、FPS、Fast Start、完整解码、覆盖、遮挡、黑帧、响度全部通过 | ffprobe JSON、覆盖/遮挡/抽帧报告 |
| 阶段 10 | `npm.cmd run test:e2e -- product-flow` | 真实 tracer、至少一条扩展项目流和高风险桌面/移动流程通过 | Playwright 报告/截图 |
| 阶段 12 | `npm.cmd run test:e2e -- production-canary` | 身份/权限、固定 fixture canary、停止条件和应用回滚演练通过 | canary 与回滚报告 |

最终根 `npm.cmd run test` 在阶段 1 后必须继续包含 `backend:test`，并编排当时适用的 unit、component、contract 子集；build、typecheck 和 routes 仍串行独立执行，避免共享 `.next` 竞态。

### 17.2 指标分母和测量方法

- **页数识别 100%**：分母是版本化 fixture 集中所有可打开的 1/10/50/100 页文件；损坏/加密文件计入“正确拒绝”，不混入可打开分母。
- **普通文本/图片提取 ≥95%**：分母是人工标注的、PRD MVP 支持范围内的文本和图片元素，不是文件数；分别报告 precision/recall 和按页面聚合结果， unsupported 元素单列。
- **图片公式 OCR（P-11 未批准延期时）**：分母是版本化 fixture 中人工框选并给出规范化 LaTeX 真值的每个图片公式；分别报告检测 recall、规范化 LaTeX exact match 和人工未决率。数值阈值必须写入批准后的 P-11 决策；阈值未定时阶段 11B 不能通过。任何未达到 exact match 的结果必须进入人工确认，静默漏检或删除容忍度为 0。
- **Agent 首次通过 ≥90%**：单位是“页面 × Agent 模块”的原始首次输出；至少 100 个版本化样本单元后才报告百分比。
- **修复/降级后 ≥99%**：同一分母，统计经过最多两次受限修复或规则降级后得到合法 Contract 的单元；人工未决不能伪装成通过。
- **原页覆盖 100%**：分母是 task 快照中所有 `isSkipped = false` 的稳定 `slideId`；验证报告必须给出每页完整镜头的起止时间、时长和图像匹配证据。
- **严重遮挡 0**：对所有金样和阶段 T 页面执行几何交叠硬门，并对每次 renderer/font/template 版本变更做人工关键帧抽查；检测漏判也记失败样本。
- **媒体可解码 100%**：分母是所有标记为候选完成的页面片段和最终视频；ffprobe 与完整 decode 均通过才计成功。
- **页面级失败可定位 100%**：所有注入失败都必须产生 `taskId + stage + slideId（适用时）+ errorCode + retryable`。
- **确定性**：只对冻结的讲稿、分镜、音频、素材、字体、模板、runtime 和 seed 比较结构哈希、页面哈希/相似度和媒体规格；不要求重新调用 LLM 的文本字节相同。
- **100 页性能**：分开报告解析、Agent、TTS、分页渲染、合成和验证的墙钟时间、CPU、峰值内存、磁盘与成本。完成首次基准后再由产品/运维设 SLO；在此之前不得宣称“支持 100 页完整生成”达到某时限。

## 18. 风险控制登记

| 风险 | Owner | 影响阶段/爆炸半径 | 监控或触发器 | 预防 | 恢复与验证 | 残余风险/接受人 |
|---|---|---|---|---|---|---|
| 未提交目录重组被覆盖 | 开发负责人 | 阶段 1；全仓 | `git status` 出现来源不明重叠 | 用户确认、建立基线、禁止 reset/clean | 停止；从确认基线和现有工作树人工恢复 | 基线前不接受，用户确认 |
| DB 成功、队列发布失败 | 后端 | T/11A；任务永久卡住 | outbox age、QUEUED 无 job | 同事务 outbox、dispatcher/reconciler | 阻断队列故障注入后自动恢复且仅一 job | P0，后端负责人 |
| 重复投递/重复计费和资产 | 后端 | T/11A；单任务/供应商成本 | 同 TaskStep 多活 attempt、重复 asset hash | stable jobId、lease、唯一键、内容哈希 | duplicate delivery test；隔离迟到结果 | P0，后端负责人 |
| 编辑与生成并发混合版本 | 前后端 | T/6/11；单项目成片错误 | snapshot 与 current revision 不同 | 冻结任务快照、409 乐观锁 | 并发编辑 E2E；新旧任务资产可区分 | P0，产品/后端 |
| 原页漏页或 coverage 陈旧 | Contract/渲染 | 2/T/11；教学内容缺失 | coverage report <100%、coverage hash 不符 | 稳定 ID、审批重算、渲染/验证双门 | 修改 sourceSlides fixture 必须失败 | P0，不接受残余 |
| 原页渲染失败后伪造重排页 | PPT Worker | T/11B；内容/版式错误 | renderer unavailable、原页 Asset 缺失 | 阻断或显式人工降级 | kill/缺字体测试；不得生成替代文本页 | P0，产品确认降级 |
| 恶意 PPT/ZIP/子进程逃逸 | 安全/后端 | 4/T/11B；Worker/主机 | 展开比、资源/沙箱告警 | MIME/结构/大小、无 shell 拼接、隔离容器 | ZIP Bomb、路径穿越、超时/资源测试 | P0，安全负责人 |
| 资产越权或内部路径泄漏 | API/安全 | T/9/12；跨项目数据 | 403/404 审计、路径扫描 | scope 函数、assetId、签名 URL、响应 Schema | 跨项目下载 E2E；日志/响应路径扫描 | P0，不接受残余 |
| Provider 限流/区域/条款变化 | Agent/TTS/运维 | T/11C/11D/12；生成停摆 | 429、配额、SLA/条款检查 | Provider Contract、版本化配置、发布前条款 | 限流注入、备用切换；无合法 Provider 则停止发布 | P1，产品/运维 |
| 字体/LibreOffice 差异破坏原页 | PPT/渲染 | 11B/12；多页视觉 | 金样图像差异、缺字体告警 | 字体容器化、环境版本、原页 PNG 金样 | Windows/容器对比；回退受支持环境 | P1，渲染负责人 |
| 旧帧/孤儿对象耗尽或污染 | 渲染/存储 | T/11/12；错误视频/磁盘 | orphan 数、磁盘、attempt 目录哈希 | attempt 隔离、引用清理、配额 | 旧帧注入、磁盘不足、orphan 对账 | P1，运维 |
| 遮挡检测误判/漏判 | 渲染/测试 | T/11E；可读性 | 几何门与人工抽检差异 | 关键区、阈值、金样、人工回流 | 拥挤页 fixture；每版本人工抽检 | P1，教学/设计接受 |
| 迁移/渲染升级使旧项目不可恢复 | 后端/渲染 | 11/12；所有历史项目 | 旧 fixture 读取/重渲染失败 | expand-contract、版本化 renderer/Schema | 旧版本项目 canary；应用回滚不断读 | P0，技术负责人 |
| 依赖漏洞或许可阻断 | 开发/法务 | 1/各引入阶段；构建/商业化 | audit、许可清单、条款变更 | 一次一依赖、引入前检查、固定版本 | 回退依赖/Provider；禁止带未接受风险发布 | 安全/法务接受 |

P0 残余风险没有表中指定接受人签字时不得发布。阶段 T 只面向内部 feature flag，不构成生产风险接受。

## 19. 发布与生产回滚策略

1. **内部切片**：阶段 T 的真实 adapter 默认关闭，并只允许固定 3 页 fixture；内部单用户分支使用本机固定 principal，个人/机构分支使用 P-02 已确认并通过隔离测试的最小 identity/tenant principal。
2. **固定 canary**：阶段 11 每个 Parser/Prompt/TTS/renderer/font 版本先跑 3 页、10 页、14 页导数金样。
3. **小流量灰度**：阶段 12 先内部用户，再按项目比例放量；每个任务记录完整版本快照。
4. **自动停止触发器**：页面覆盖低于 100%、严重遮挡大于 0、重复任务/资产、下载越权、媒体硬门失败或错误率超过已批准阈值时停止创建新任务。
5. **降级**：优先回到上一 Provider/renderer；教学增强失败时只能回到经验证的完整原页 + 基础增强，不能绕过审核或媒体验证。
6. **应用回滚**：保留向后兼容的数据库和 Contract 读取窗口；回滚应用不执行破坏性 down migration。运行中的冻结任务由兼容 Worker 完成或显式取消。
7. **旧资产兼容**：已验证资产在生命周期内继续可下载；URL 续签不触发重渲染。

## 20. 计划复核记录

### 20.1 独立复核轨迹

| 维度 | 初次盲审 | 结构修正前终审 | 独立就绪审 | 主要关闭内容 |
|---|---:|---:|---:|---|
| Completeness | 3/5 | 3/5 | 4/5 | 修正阶段 T/11 数据库所有权；让阶段 3～10 明确扩展真实产品流 |
| Feasibility | 3/5 | 3/5 | 4/5 | 候选基础设施、渲染器和 TTS 供应商不再写成既定；保留 POC/fallback |
| Scope | 3/5 | 3/5 | 5/5 | 真实 adapter 与 Mock fixture 分责；图片公式 OCR 延期单列 P-11，不再由计划自行删除 |
| Testability | 3/5 | 3/5 | 4/5 | 持续保留 `backend:test`；补阶段 T 的 3 页金样命令和阶段 3～12 命令 |
| Risk | 3/5 | 4/5 | 5/5 | 已有 Owner、爆炸半径、触发器、预防、恢复、残余接受与 rollout |
| Assumptions | 3/5 | 3/5 | 4/5 | T-01 改为 `UNVERIFIED`；产品决定只阻断实际受影响阶段 |

独立就绪审之后又关闭了 P-02 身份分支、P-11 OCR 条件门、云供应商中性和 Next BFF → backend application service 边界，最终短审结论为 `READY`。评分是复核轨迹，不是通过门；不得用分数替代阶段命令、POC、产品确认或用户对 Git 基线的授权。

### 20.2 实施前必须解决

- 当前目录重组是否允许建立安全 Git 基线。

### 20.3 到对应阶段前解决

- P-01/P-02 在阶段 T 前确认；P-03～P-10 按账本截止阶段逐项确认；P-11 在阶段 11B 前确认。
- P-08 在阶段 12 供应商 POC 前确认。
- T-04 Provider 兼容、T-05 持久化/队列和 T-06 渲染器均必须用 POC 证据关闭。
- T-07 Docker 当前为 `REJECTED`；只阻断阶段 T，不阻断阶段 1/2。

### 20.4 最终一致性检查

- 原始需求、十项产品待确认、核心验收和非目标均能在本计划或 PRD 找到唯一归属。
- 执行顺序先真实纵切，再扩覆盖面；no-op Worker 不再冒充产品 tracer。
- 新依赖均有当前需求、进入门、验证命令和失败 fallback。
- 每个阶段仍只允许按一个阶段或明确子阶段执行，失败不前进。
- 所有已知未解决事项都在账本或 STOP 条件中显式记录，没有隐藏的 `UNRESOLVED` 项。
