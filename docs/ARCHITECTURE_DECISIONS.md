# PPT 数字人授课视频生成系统架构决策

> 状态：Active  
> 首次记录：2026-07-30  
> 最近复核：2026-08-02
> 产品依据：`docs/product/PPT-Digital-Human-Video-PRD-v1.0.md`  
> 实施依据：`docs/IMPLEMENTATION_PLAN.md`

## 1. 使用方式

本文只记录会长期约束多个模块的架构决策。阶段进度、临时任务和文件清单仍写入实施计划、状态报告或交接文档。

状态含义：

- `Accepted`：当前实现必须遵守；改变前先更新本文并说明迁移和回滚影响。
- `Accepted with gate`：方向已接受，但指定验证门通过前不得扩大依赖范围。
- `Proposed`：尚未获得足够证据或产品确认，不得当作既定事实实现。
- `Superseded`：已由后续决策替代，保留历史原因。

若 PRD、本文和代码互相冲突，停止当前阶段，记录冲突并由产品或技术负责人明确哪一个需要更新，不能静默选择。

## 2. 当前事实基线

截至 2026-08-02：

- `frontend/` 是 Next.js 交互原型，业务数据来自浏览器内存 Mock。
- `backend/` 是本地 CLI 技术验证，可完成基础 PPTX 解析、人工批准、Edge TTS、静态画面、MP4 合成和媒体校验。
- 两端没有真实 HTTP 业务闭环、PostgreSQL、Redis/Valkey、BullMQ 或 OSS。用户已批准原生 PostgreSQL 等价本地方案，但代码和服务尚未安装或实现。
- 目录重组、前后端原型和上下文文档已经分组提交并推送；后续以该 Git 历史为迁移基线。
- 当前实现仍有已知硬缺口：多页场景只渲染第一来源页、批准后沿用可能陈旧的覆盖元数据、没有完整页面覆盖硬门、Python/Node Agent JSON 尚未迁移到共享 TypeScript Contract、数字人没有遮挡验证、结果 JSON 含内部路径、视频仍为 12 FPS、非 H.264/AAC 当前只记 warning。

以上是迁移起点，不代表目标架构。

## ADR-001：原 PPT 页面是默认主视觉

**状态：Accepted**
**实现：Partial**

### 决策

- 默认采用 `PRESERVE_WITH_OVERLAY`：完整原页为底图，公式、曲线、箭头、框选、局部放大、数字人和字幕为受控增强层。
- `FULL_REDESIGN` 只有在用户显式授权后才允许。
- 每个未跳过的稳定 `slideId` 必须至少有一个持续不短于 1.5 秒的完整原页镜头。
- 完整原页使用 `contain` 等比适配，不裁边；多页场景必须逐页满足覆盖要求，不能只显示 `sourceSlides[0]`。
- 标题、公式、图表、关键文字和字幕安全区优先于数字人；无法避让时移动、缩小或隐藏数字人。

### 理由

产品价值来自保留用户已有课件并进行教学增强。默认重构或漏页会直接破坏内容完整性，不能作为可接受降级。

### 后果

- Contract、渲染器和最终验证都必须独立实施页面覆盖硬门。
- 解析或增强失败时降级为“完整原页 + 基础增强 + 讲稿 + 字幕”，而不是无依据地重建页面。
- 原页资产缺失是阻断错误或明确的人工降级状态，不能静默改成重排文字页。

### 重访条件

只有产品正式修改“原页优先”原则，并给出旧项目迁移与用户授权方案时才重访。

## ADR-002：共享 Zod 是跨 TypeScript 边界的唯一业务 Contract

**状态：Accepted**
**实现：TypeScript/Mock boundary implemented; cross-language migration pending**

### 决策

- 新建 `packages/contracts` 后，项目、页面、讲稿、场景、Overlay、任务、资产和 API 结构只在该包定义。
- TypeScript 类型由 `z.infer` 生成，不维护同形状的手写 interface。
- 网络、LLM、文件、队列和 Python 适配器输出一律先视为 `unknown`，再用 `.strict()` Schema 校验。
- Python 解析器可以保留内部 Python 结构，但跨进程 JSON 必须在 TypeScript 边界通过相同的版本化 Zod Contract；Python 手写规范化器不是公共 Contract 来源。
- 所有业务实体使用稳定 ID。`slideNumber` 和数组下标只表示顺序，不能替代 `slideId`。

### 理由

当前前端 TypeScript、Python 解析和 Node 视频脚本存在字段漂移与静默修正。单一 Contract 能让非法 Agent JSON、漏页、未授权全页重构和内部路径在边界处失败。

### 后果

- Schema 变更需要版本、兼容策略和 Contract 测试。
- Agent 输出修复最多在受限 JSON 层进行；失败后进入规则降级或人工审核。
- 迁移期间允许短期适配器，但不允许长期保留两份同义领域模型。

### 重访条件

只有现有运行时无法可靠消费 Zod 生成的 JSON Schema，且替代方案仍能提供单一可执行 Contract 时才重访。

## ADR-003：MVP 使用模块化单 Agent，执行保持确定性

**状态：Accepted**
**实现：Prototype only**

### 决策

- MVP 只有一个“课程视频导演 Agent”，内部拆为内容理解、教学规划、讲稿、公式推导、视觉分镜和审核模块。
- PPT 解析、TTS、公式预渲染、遮挡计算、视频渲染、FFmpeg 和 ffprobe 是普通工具或 Worker，不是 Agent。
- Agent 只产生受 Schema 限制的意图和参数，不得直接执行 JavaScript、TypeScript、Shell、PowerShell、HTML、FFmpeg 命令或任意表达式。
- 渲染器只接受枚举模板、白名单动画、受限数学语法、有界坐标和版本化素材。

### 理由

当前目标是先证明稳定闭环。多 Agent 会增加上下文、冲突、重试、成本和评测复杂度，却不改变第一个可交付结果。

### 后果

- 六个模块必须可独立测试和追踪 Prompt、模型、Schema、输入输出哈希。
- 只有积累稳定失败样本、评测集能够区分内容/数学/视觉错误，且单 Agent 成为已测量瓶颈后，才能提出多 Agent ADR。

### 重访条件

单 Agent 在离线评测中持续无法满足质量或上下文预算，并且拆分收益有数据证明。

## ADR-004：Web/API 保持薄层，耗时工作由持久化异步任务驱动

**状态：Accepted**
**实现：Not implemented**

### 决策

- Next.js Route Handlers 是公开 BFF，只负责浏览器会话/初步项目范围、公共请求与响应 Zod 校验，以及通过私有 HTTP client 转发命令、查询和下载续签。
- `backend/` 内的 application HTTP service 重新校验 principal/scope，并拥有业务事务、outbox、幂等任务创建、Repository 与资产授权；`frontend/` 不得相对导入 `backend/**` 实现文件，两端只共享 `packages/contracts`。
- LibreOffice、LLM、TTS、通过门禁的渲染器、Sharp、FFmpeg 和验证不在 Web 请求中同步执行。
- 所有耗时 POST 接受 `Idempotency-Key`；BFF 原样转发到 application service，后者在同一事务边界内返回稳定 `taskId`。
- Task/TaskStep 持久化真实状态、工作单元进度、心跳、attempt、取消请求、错误码和输入/输出哈希。
- Worker 失败只重做失败步骤和哈希失效的下游；最终验证通过前不得写入 `COMPLETED`。
- MVP 客户端使用 TanStack Query 轮询；暂不引入 WebSocket 或 SSE。

### 理由

解析、模型、音频和视频任务耗时且易失败，必须支持恢复和去重。轮询足以满足 MVP，避免过早增加长连接基础设施。

### 后果

- 前端定时器伪进度只能存在于明确的 Mock adapter。
- 阶段 T 必须运行独立的 Next BFF 与 backend application service 进程，并对私有 API 使用最小内部鉴别；不能把 backend 源码打入前端 bundle。
- Worker 每个可中断边界检查取消状态；心跳超时进入可恢复状态，而不是创建重复任务。
- 若轮询对已测量的规模造成不可接受负载，再单独提出实时推送 ADR。

### 重访条件

真实并发与轮询频率测量证明数据库/API 压力或交互延迟无法满足目标。

## ADR-005：持久化模型以稳定 ID、修订和内容哈希为核心

**状态：Accepted**
**实现：Not implemented**

### 决策

- 使用 Project、Presentation、Slide、LessonPlan、LessonPlanRevision、GenerationTask、TaskStep、AgentRun 和 Asset 作为目标核心模型。
- LessonPlan 人工修改使用乐观 revision；锁定页面不会被后台重生成覆盖。
- Presentation 替换、页面编辑、Prompt/Schema/模板版本和配置哈希决定下游失效范围。
- Asset 统一管理输入、中间和输出资产，避免每种资产各自实现生命周期。

### 理由

产品要求逐页审核、锁定、局部重生成、失败恢复和可追溯；单一可变 JSON 文件无法安全支持这些行为。

### 后果

- 当前浏览器 Mock Map 和 `backend/work` 不迁移为生产数据，只作为 fixture/金样参考。
- 数据库迁移采用向前修复；生产中不依赖破坏性 down migration。
- 数据表和索引在 tracer bullet 中按真实查询验证后再扩展。

### 重访条件

真实查询、并发或资产生命周期证明模型边界错误，并有迁移方案和回滚影响说明。

## ADR-006：资产内部使用 storage key，对外交付只使用受控 URL

**状态：Accepted**
**实现：Partial**

### 决策

- 数据库和 Worker 保存 `assetId`、`storageKey`、哈希、类型、大小和验证结果。
- 浏览器只接收经过项目范围检查的 HTTP 地址或短期签名 URL。
- API 不返回磁盘绝对路径、`storageKey`、内部主机、堆栈或密钥。
- 输出在签发 URL 前校验存在、哈希、大小和验证状态；URL 过期只重新签发，不重新渲染。

### 理由

当前 CLI 的 `result.json` 和 `verification.json` 含绝对路径，只能作为内部数据。直接复用会泄露服务器结构并产生不可用下载地址。

### 后果

- 本地开发也通过 HTTP 存储适配器交付，不能用 `file://` 或把工作目录暴露给浏览器。
- 临时对象采用“写入 → 校验 → 原子登记”；失败和取消产生的孤儿资产由有界清理任务回收。

### 重访条件

没有。更换存储供应商只替换适配器，不改变对外资产契约。

## ADR-007：视频按页确定性渲染，验证是完成状态的一部分

**状态：Accepted with gate**
**实现：Prototype only**

### 决策

- 目标采用分页片段：原页 Layer 1，受控 Overlay、数字人和字幕在上层；修改页面只重渲染受影响片段。
- 目标规格为首版 16:9、1920×1080 或 1280×720、经性能/兼容基准选择的 25 或 30 FPS、H.264/AAC、`yuv420p`、Fast Start。
- 模板、字体、Node、Chromium、选定渲染器、FFmpeg、素材和 seed 都记录版本或哈希。
- 最终完成门包含 ffprobe、完整解码、页面覆盖、完整镜头时长、遮挡、字幕重叠、黑帧、静音/响度和抽帧报告。

### 理由

可复现、局部重渲染和技术可播放性是交付要求，不能只依赖“FFmpeg 命令退出 0”。

### 验证门

阶段 T 先用 3 页真实样本证明现有 Sharp/FFmpeg 链路能够完成分页片段、音视频时长和输出编码校验。阶段 11E 再用 10/50/100 页基准验证分页缓存、中文字体、KaTeX、片段拼接和资源占用，并在 25/30 FPS 中冻结默认值。只有门禁通过才采用 Remotion；否则保留相同 Contract，扩展最小的 React/Sharp/FFmpeg 路径。

### 后果

- 当前 12 FPS Sharp 原型是参考实现，不是目标规格。
- 每次 attempt 使用隔离目录，渲染前不得复用未通过哈希校验的旧帧。

### 重访条件

基准测试证明 Remotion 无法在目标机器、成本或时限内满足届时已确认的页数与视频时长上限。

## ADR-008：用 PostgreSQL/Prisma 与 BullMQ/Redis 作为待验证基础设施候选

**状态：Superseded by ADR-011**
**实现：Not implemented**

### 决策

- 当前候选持久化为 PostgreSQL + Prisma，候选队列为 BullMQ + Redis/Valkey；在 POC 通过并把本 ADR 状态改为 `Accepted` 前，不得称为既定架构。
- 在批量建设 Repository、Worker 类型和部署配置前，先完成一条基础设施连接验证：

```text
HTTP 创建任务
→ PostgreSQL 事务和幂等键
→ BullMQ job
→ no-op Worker 心跳/取消
→ PostgreSQL 真实进度
→ 前端轮询终态
```

- 切片必须验证重复请求、Worker 重启、取消、失败重试和数据库/队列暂时不可用。

### 理由

这些组件符合持久化任务和恢复要求，但当前仓库尚未安装或运行它们。先证明真实边界，避免在未验证连接上横向创建大量层。

### 后果

- 阶段 0 已建立 Git 基线，阶段 1A/1B 建立测试与依赖保护，阶段 2 建立 Contract；该 no-op 链路只证明候选基础设施的连接、租约和恢复机制，不能算作阶段 T 产品 tracer，也不能替代真实流水线验收。
- 开发测试数据库和队列可丢弃；生产迁移只向前并要求兼容回滚窗口。

### 重访条件

切片无法满足幂等、恢复或部署约束，或产品部署环境明确禁止这些组件。

### 替代说明

2026-08-02，Docker Desktop 的 WSL2 engine 在当前 Windows 主机上因 `HCS_E_HYPERV_NOT_INSTALLED` 无法创建 `docker-desktop` 发行版。用户明确停止继续修复 Docker，并批准无 Docker 的等价本地方案。为减少本地服务数量和恢复语义的双写风险，ADR-011 以 PostgreSQL lease worker 取代 BullMQ/Redis；本 ADR 保留为历史候选记录。

## ADR-009：模型与 TTS 都通过服务端 Provider 接入，具体供应商不得渗入 Contract

**状态：Accepted with gate**
**实现：Blocked by compatibility gate**

### 决策

- 模型名、base URL 和密钥只来自服务端配置；业务代码不提供生产模型名默认值。
- OpenAI Agents SDK 可作为单 Agent 编排层，但 DeepSeek 走 OpenAI-compatible Chat Completions，必须显式选择兼容 transport，并在集成测试中验证结构化输出、工具调用、超时、重试和流式行为。
- 若 Agents SDK 与目标 Provider 的必需能力不兼容，允许在不改变 Agent 模块 Contract 的前提下使用最小 OpenAI SDK Provider 适配器；不得为“将来也许会用”同时维护两套编排。
- 使用非 OpenAI 密钥时，不把追踪发送到 OpenAI；显式关闭默认追踪或配置经过批准的独立追踪处理器。
- 开发 TTS 使用 Edge TTS；生产 TTS 供应商和备用方案在生产化阶段通过同一 Provider Contract 验证。

### 理由

官方 Agents SDK 支持自定义 `baseURL` 和 Chat Completions transport，但供应商对 Responses、JSON Schema 和工具流的兼容程度不同，必须用真实请求验证。供应商模型名和能力会变化，不能写死。

### 当前证据

- OpenAI Agents SDK 文档说明 `OpenAIProvider` 支持 OpenAI-compatible `baseURL`，且 `useResponses: false` 选择 Chat Completions。
- DeepSeek 官方文档在 2026-04-24 宣布 `deepseek-chat` 和 `deepseek-reasoner` 于 2026-07-24 停用；当前代码和 `.env.example` 仍使用该旧默认值，真实 LLM 路径在修复前视为阻断。

### 重访条件

Provider 能力、服务条款、数据驻留、SLA 或离线评测结果变化。

## ADR-010：现有 Python/Node CLI 是受控迁移适配器和金样参考

**状态：Accepted with gate**
**实现：Current transition**

### 决策

- 阶段 T 优先复用现有 Python PPT 解析、PowerPoint/LibreOffice 原页生成、Edge TTS、Sharp 和 FFmpeg 能力，不立即整体重写。
- 新 HTTP、持久任务、Contract 和资产边界包在现有 CLI 外围；CLI 原入口保留到真实切片和金样能覆盖其能力。
- Python/TypeScript 跨运行时 JSON 必须经过版本化 Zod 边界。
- 只有替代解析或渲染路径通过 1/10/50/100 页 fixture、14 页导数金样、媒体门和资源基准后，才可删除对应旧适配器。

### 理由

当前 CLI 已验证一条本地 PPTX 到 MP4 路径。立即用 JS 重写解析器、Agent 和渲染器会同时失去基线并增加双实现风险，不符合最小纵切。

### 后果

- 短期保留 Python/TypeScript 双运行时，但每个能力只有一个主实现和明确的迁移退出条件。
- JSZip/fast-xml-parser、OpenAI Agents SDK 和 Remotion 只能针对已证明的缺口引入，不能因为目标目录图中存在就提前创建。

### 重访条件

现有适配器无法满足安全、部署、性能或 Contract 边界，并且替代实现已通过等价金样和回滚验证。

## ADR-011：T0 使用 Windows 原生 PostgreSQL、Prisma 与 PostgreSQL lease worker

**状态：Accepted with gate**
**实现：Not implemented; POC pending**

### 决策

- T0 的等价本地服务环境使用 Windows 原生 PostgreSQL；不要求 Docker Desktop、WSL2、Redis、Valkey 或 BullMQ。
- Prisma 负责类型化数据访问和向前迁移。Prisma 无法表达的部分唯一索引和必要约束使用受审查的原始 migration SQL，不用应用层检查替代数据库约束。
- 同一 PostgreSQL 数据库保存领域事务、任务快照、outbox、step attempt、租约、心跳、取消请求和最终状态，避免数据库与独立队列之间的双写。
- Worker 使用 `FOR UPDATE SKIP LOCKED` 竞争可执行步骤，以稳定 TaskStep ID/去重键、`leaseOwner`、`leaseExpiresAt`、heartbeat、attempt 和取消状态实现并发领取与崩溃接管。
- 服务只通过配置的数据库 URL 连接，不依赖 PostgreSQL 安装目录的绝对路径；密码、本地数据目录和环境文件不得提交。
- Redis/BullMQ 不作为并行 fallback。若本方案 POC 失败，先停止并更新本文和路线图，再选择替代方案。

### 验证门

进入阶段 T 前，最小 POC 必须用可重复的自动化测试证明：

1. 任务创建、领域写入和 outbox 写入属于同一事务。
2. 相同幂等键和相同 payload 返回同一任务；相同键配不同 payload 被拒绝。
3. dispatcher 重放 outbox 不会创建重复逻辑步骤。
4. 两个 Worker 并发时同一 attempt 只能被一个 Worker 领取。
5. heartbeat 能续租；进程退出或 Worker kill 后，租约到期可由其他 Worker 接管。
6. 取消与完成竞态只产生一个合法终态；失败 attempt 可按上限重试。
7. 必要唯一约束和向前 migration 在全新测试库及已有前一版 schema 上都能执行。

仅能提供单连接的嵌入式开发数据库可以辅助单元测试，但不能替代上述多连接、并发 lease 和 Worker kill 门禁。

### 理由

当前 Docker engine 无法启动，而项目路线图允许用户批准等价本地 PostgreSQL/队列方案。把 outbox 和 lease 放在同一数据库内，可以在 T0 用更少的本地服务证明持久任务的核心恢复语义，也避免同时维护 Redis/BullMQ 与 PostgreSQL 两套故障面。

### 后果

- PostgreSQL 尚未安装，以上方向不能写成当前实现；T0 仍处于进行中。
- 开发和测试需要独立、可清理的数据库。安装系统 PostgreSQL 必须另获用户授权，且不能把本机安装路径写入仓库。
- T0 只建立证明恢复语义所需的最小表、migration、dispatcher 和 Worker；完整 Repository、业务 API、对象存储和真实产品流水线留给后续明确阶段。
- 生产部署可以在保持相同任务/租约 Contract 的前提下改用托管 PostgreSQL，但必须重新做容量、备份、故障恢复和连接池验证。

### 重访条件

POC 无法可靠证明并发领取、租约接管、幂等、取消或目标吞吐，或已确认的生产环境不允许所需 PostgreSQL 能力。

## 3. 尚未接受的产品假设

以下项目仍是 `Proposed`，只能作为计划建议，不能在用户确认前扩大为不可逆实现：

1. 首发评测、Prompt 和验收是否以高等数学为优先。
2. 首发用户是内部单用户、个人教师还是机构团队。
3. 单视频最大时长。
4. 是否支持自定义数字人上传。
5. 是否支持 9:16 和 1:1。
6. 是否需要背景音乐和品牌片头。
7. L2 数学风险是否强制人工确认。
8. 是否必须中国大陆部署，以及是否采用阿里云 OSS/CosyVoice。
9. “项目包”是元数据导出还是可离线完整复现工程。
10. 是否需要用量计费和团队权限。
11. 是否批准把图片公式 OCR 从 Web MVP 延期；阶段 T 不覆盖它不等于范围已删除。

前十项来自 PRD 待确认清单，第十一项是实施计划提出的额外范围变更请求。PRD 已明确首版 16:9；它不依赖部署地区或时长再次确认。每项 Owner、截止阶段和 fallback 见实施计划第 13 节。若任一假设被否定，先更新实施计划的范围、数据隔离、部署或容量设计，再进入受影响阶段。

## 4. 决策变更流程

变更 Accepted 决策时必须：

1. 在本文新增替代决策并把旧决策标为 `Superseded`，不删除历史理由。
2. 说明影响的 Contract、数据迁移、任务幂等、现有资产、前端状态和回滚方式。
3. 更新 `docs/IMPLEMENTATION_PLAN.md` 的阶段、风险、验证和 STOP 条件。
4. 在代码前先获得对应产品或技术确认。
