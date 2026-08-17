# 当前真实架构

## 2026-08-17 固定桌面 principal 与 bundle Python 导入边界

- Desktop Host 不再每次启动生成业务 principal，统一使用 `local-desktop-user`。Prisma migrate 和预迁移备份完成后、Hono/Worker/Next 启动前，捆绑 `psql` 在一个事务内统计 `T0Task`、`Project`、`ProviderProfile`、`GenerationTask`、`WorkflowRun`：0 个/已固定时不写，唯一 legacy 值才迁移，多值时阻断恢复。数据库口令只经 `PGPASSWORD` 子进程环境传递。
- 复制后的 Python embeddable `python310._pth` 显式包含 runtime 父目录 `..`，使 `python -m backend.cli.prepare` 能导入同级 backend；构建门执行导入探针，运行时设置 `PYTHONNOUSERSITE=1` 和 `PYTHONDONTWRITEBYTECODE=1`。这不会修改源 Python，也不允许系统预装 Python 进入发布闭包。
- 最新 runtime `p7-dd47b2e90ef4` 为 16 组件、25,981 条 manifest 文件记录、1,571,136,842 bytes、7 条许可证。当前候选本机验证了真实 14 页解析、官方卸载默认保留数据、全新安装、应用正常 Exit/第二次启动和原项目跨重启可见；同路径原子覆盖未通过，L-02 为 `LOCAL_PARTIAL / EXTERNAL_PENDING`。

## 2026-08-17 P7/P8 离线 bundle、安装与迁移保护（本机候选）

- 桌面发布拓扑为 `NSIS installer -> Electron app -> resources/runtime/runtime-manifest.json -> RuntimeBootstrap -> bundled PostgreSQL -> bundled Prisma migrate deploy -> Hono -> Worker -> Next standalone`。安装包把 Node、Python embeddable、PostgreSQL、LibreOffice、FFmpeg/ffprobe、Noto 字体、项目 backend runtime-dist、Next standalone/static/public 和 Prisma migration 运行入口放入 `resources/runtime`；服务进程不通过系统全局 PATH 找依赖。
- `runtime-manifest.json` v2 对平台、x64 架构、产品/源码/Node 版本、组件相对路径、sha256、文件大小、文件分类和许可证路径做 strict 校验。启动前校验列出的组件哈希和版本；受管子进程的 PATH 只包含 bundle 内 Node/Python/PostgreSQL/LibreOffice/FFmpeg 目录，避免开发机全局依赖伪装成发布依赖。
- 首次数据库初始化使用 bundle `initdb`，数据库就绪后由 bundle Node 执行 `prisma migrate deploy`；v2 每次迁移前将既有 `postgres-data` 复制到 `dataRoot/backups/pre-migration-*`，迁移失败以稳定错误阻断启动并保留备份，不执行自动 down migration。数据库口令继续由 Electron safeStorage/DPAPI 边界保存。
- NSIS 采用 per-user、x64、离线候选包；卸载脚本默认保留 `%APPDATA%\\MathAvatar`，用户显式确认后才删除该精确数据根。当前包未签名，仅能用于本机/受控验证，不能视为公开发布构建。
- 最新本机 P7/P8 证据已通过 bundle `p7-a5641d4b243b` 的 manifest/hash/license 校验（15 组件、25,981 文件、1,571,136,839 bytes、7 条许可证）、PostgreSQL/Prisma migration smoke、真实 RuntimeBootstrap 全链启动/Next HTTP readiness/受控停止、3 轮 soak 和 release audit；NSIS 候选为 558,770,630 bytes、SHA-256 `A139CC2824FC8ED9F964013F6700EA4B1A7A687848C494B518D4D0E97342F623`、`NotSigned`。构建门只接受有界 Python embeddable 和新隔离输出，省略 `ffplay.exe`/LibreOffice help，继续使用 NSIS 原子 updated-uninstaller。本机同路径覆盖 470.161 秒退出 0且真实数据元数据不变，因此 L-02 为 `LOCAL_PASS / EXTERNAL_PENDING`。clean VM/另一台电脑、migration 失败恢复、卸载两路径、硬崩溃/Job Object、签名和真实媒体仍需外部验证。

## 2026-08-17 P6 首次启动、生产设置和运行时健康

- 真实生产流为 `BrowserWindow sandboxed renderer -> Next 同源 BFF -> Hono /v1 -> Prisma/Worker`。`/setup` 负责首次 Provider 配置，`/settings` 复用同一 Provider 面板和运行时健康面板；浏览器不能直接接触数据库、Provider 密钥、文件路径或子进程。
- Provider 设置使用已有 `BrowserWindow -> Next BFF -> Hono -> Electron main secret IPC -> safeStorage/DPAPI` 密钥边界。Provider 创建、更新、轮换和连接测试只返回 `keyConfigured/keyLast4/keyVersion` 等非秘密字段；真实上传由服务端再次验证默认 Provider。
- 健康面板从 `/v1/runtime/health` 获取数据库、API、Provider、Edge TTS、桌面宿主、磁盘和 Workflow 的严格公共投影；诊断端点和浏览器下载只产生脱敏 JSON。Edge TTS 尚未进行外部试听时保持 `WARN`，不伪造 READY。
- Electron 主进程在打包模式默认 `production`，拒绝 Mock/stage-t；preload 仅暴露 `getInfo`、一次显式 `retryRuntime` 和严格的脱敏 Workflow 状态。托盘显示运行时/工作流状态，磁盘空间只返回分类和容量，不返回用户路径。
- 生成页仍由服务端 `WorkflowRun` 推进阶段，并把状态通过脱敏 IPC 投影到桌面托盘；关闭 renderer 不会获得创建下一阶段或读取内部秘密的能力。

## 2026-08-17 P5 服务端 WorkflowRun 根编排

- `WorkflowRun` 是生成页唯一的持久根聚合：输入 hash/snapshot、当前阶段、子任务 ID、重试/取消状态、根租约和最终错误均落在 PostgreSQL。输入快照不含 API Key，只含 Provider 的非秘密选择和已批准 revision ID。
- `WorkflowRunRepository` 负责 principal 作用域、幂等创建、取消和重试；`WorkflowOrchestrator` 复用现有 Audio/Render/Media/LessonPlan repository 创建子任务，子任务的 outbox、step、attempt 和外部进程取消语义保持单一事实来源。
- `workflow-worker` 通过 `FOR UPDATE SKIP LOCKED` 领取 QUEUED/RUNNING 根工作流，过期 lease 可被另一 worker 接管。浏览器真实生成页只 POST 一次 WorkflowRun，并轮询 `/v1/workflows/:workflowId` 公共投影；关闭、刷新或结果跳转不会再由浏览器创建下一阶段。
- 根投影的 `finalTaskId` 只有合成/验证子任务存在时才出现；只有 VALIDATE 子任务成功且媒体验证终态可用，WorkflowRun 才是 `SUCCEEDED`。失败、取消和重试均使用稳定错误/幂等边界。

## 2026-08-17 P4 讲稿审核与双文本任务快照

- `packages/contracts/src/review.ts` 定义审核阈值与 `reviewFlags`；Parse/Workspace projection 计算低置信度、解析警告、公式和高风险推导标记。`backend/app/lesson-plan-review.ts` 是 AUDIO、PAGE_RENDER、COMPOSITE 共用的服务端门禁，错误只返回稳定码和页面 ID/标记，不暴露模型或磁盘内部数据。
- 工作台的 `displayText` 进入字幕显示和字幕 cue，`spokenText` 进入 Edge TTS；用户修订产生 pending revision，只有显式批准后才能创建音频。AUDIO outbox 冻结逐句双文本、voice/rate/pitch 与 revision ID，后续渲染继续校验当前批准 revision。
- `frontend/src/components/workspace/teaching-settings-form.tsx` 与 `backend/app/teaching-settings.ts` 共享同一能力边界：周老师、三种 Edge 音色、语速和逐页 hidden。试听与最终 AUDIO 复用 `frontend/src/lib/api/teaching-settings.ts` 的 Edge 映射；未接入渲染器的设置在服务端和 UI 中均被规范化/隐藏。

## 2026-08-17 P3 Provider Gateway

- `backend/app/providers/` 现在按协议拆分 OpenAI Chat Completions 与 Anthropic Messages；OpenAI、DeepSeek、GLM、Kimi 共享请求形态但保留独立 adapter，模型 ID 继续来自配置/profile，不在代码中写入“最新模型”。
- `backend/app/agent-adapter.ts` 的兼容入口和实际 Worker 都经过同一 Gateway：外部响应保持 `unknown`，状态码/超时/连接/响应结构/Contract 输出映射为稳定错误；Agent JSON 只允许一次包装修复，不能补业务字段。
- 任务创建时 `LessonPlanRepository` 把非秘密 `ProviderSelectionSnapshot` 写入 input hash 和 PLAN outbox；Worker 按 principal 和版本复核，再通过桌面 secret IPC 获取指定 keyVersion。完整 Key 不进入 snapshot、数据库、日志或浏览器响应。
- 本地 fixture 覆盖五家适配器和错误/修复路径，离线评测目录含 100 个 slide-level 样本；五家真实 smoke 保持显式 opt-in，未通过前不把任一家写成正式支持。

## 2026-08-17 P1 桌面运行时适配

- Next production build 使用 `output: "standalone"` 和 monorepo `outputFileTracingRoot`；桌面 staging 必须显式复制 `public` 与 `.next/static`。
- Hono/Worker 可构建为 production ESM entry。Hono 显式绑定 `127.0.0.1`，两者只接受版本化 strict 父进程 IPC shutdown，并在数据库语义查询成功后发送 ready。
- Next BFF 仍是 renderer 到 Hono 的唯一业务入口；本地生产 base URL 只能是无用户名、密码、query 或 fragment 的 loopback HTTP 地址。内部 token/principal 只存在于受管子进程环境。
- 桌面 supervisor 与 safeStorage 位于独立桌面仓库；本仓库不包含 Electron 生命周期代码。P1 没有改变业务 Contract、Prisma schema、outbox/lease 调度或两态数字人生产路径。
- 本机 probe 已验证 PostgreSQL -> Prisma migrate deploy -> Hono -> Worker -> Next standalone 的顺序与反序停止。正式 migration 制品和完整离线 runtime staging 尚未完成，不能视为发布架构已经闭环。

> 更新于 2026-08-04。本文只描述代码中已经存在的实现；目标架构和候选技术见
> `docs/DECISIONS.md`、`docs/ARCHITECTURE_DECISIONS.md` 与
> `docs/IMPLEMENTATION_PLAN.md`。

## 2026-08-13 两态回退

- 正式 PAGE_RENDER 使用 `teacher-closed.png` 与 `teacher-open.png` 两张完整周老师 PNG，每页各合成一次，以 120 ms 闭口 / 100 ms 开口的 concat 序列编码 H.264/AAC 页面视频。
- PAGE_RENDER 快照以 `stage-te-binary-mouth-v1` 区分缓存。新 RenderedPage 写入 `avatar-zhou` / `legacy-binary-v1`，不写 lip-sync timeline。
- AUDIO timing 捕获、五档素材契约及确定性驱动作为兼容/研究代码存在，但当前 PAGE_RENDER 不调用。五档架构因用户人工自然度验收失败而撤下。

## 2026-08-13 唇形增强 L2～L5（历史失败实验）

- `packages/contracts/src/lip-sync.ts` 是嘴型 pose、Edge word timing、RLE 时间轴和 avatar catalog/manifest 的严格共享契约；外部 JSON 先按 `unknown` 解析，未知字段、非法边界、时间轴空洞/重叠/越界、跨级跳变及 `ENERGY_ONLY + ROUND` 均被拒绝。
- AUDIO 继续使用既有句级 Worker/attempt/取消/重试结构。Edge sidecar 仅写入 attempt，适配器在音频质量门通过后将其解析成 `AVAILABLE` 或显式 `UNAVAILABLE`；`AudioSegment.timingMetadata` 与音频登记同事务保存，缓存键冻结 timing capture version。
- `backend/lip-sync/driver.mjs` 是该实验的确定性驱动核心；它已不再由 PAGE_RENDER 调用。
- PAGE_RENDER 快照和缓存键冻结 `avatarId`、asset version、bundle fingerprint、timing/hash、schema/driver/config/renderer version。新 RenderedPage 原子保存实际 avatar 与时间轴 JSON/hash；历史记录继续用 `avatar-zhou` / `legacy-static-v1` 默认且 timeline 为 null。
- 该实验生成过周老师 `BOUNDARY_ENERGY` Demo，但用户人工验收判定不自然，L5 最终为 FAIL。

## 总览

当前保留 Mock/CLI 两条原型链路，并已完成阶段 T 的真实产品纵切；阶段 3 进一步接入项目管理：

```text
浏览器
  └─ Next.js App Router 页面
       └─ 前端 API 模块
            └─ MockApiClient
                 └─ 浏览器内存 Map + setTimeout 模拟任务

PowerShell / 终端
  └─ backend/run.mjs
       ├─ Python prepare.py：PPTX 解析、原页图、LLM/规则规划
       ├─ Python approve.py：人工审核结果规范化与批准
       └─ Node 视频管线：Edge TTS → 字幕 → 帧 → FFmpeg → verify
            └─ 本地 job 目录中的 JSON、图片、音频、字幕和 MP4

浏览器真实 adapter（尚未设为页面默认）
  └─ Next.js /api/t Route Handlers
       └─ 固定本地 principal + 内部令牌 + 公共 Zod
            └─ Hono 私有 application service
                 ├─ Project 列表/复制/归档/删除与版本冲突
                 ├─ PPTX MIME/大小/ZIP 结构/哈希复核
                 ├─ PLAN/AUDIO task、Revision 修订与显式批准
                 ├─ Prisma 产品事务 + outbox
                 └─ Git 忽略的本地 source asset
                      └─ PARSE dispatcher/lease Worker
                           ├─ attempt 隔离 + Python/LibreOffice
                           └─ strict deck → Slide + SLIDE_RENDER Asset
                      └─ PLAN/AUDIO/PAGE_RENDER dispatcher/lease Worker
                           ├─ strict Agent → Revision/Scene
                           └─ Edge TTS → AUDIO_SEGMENT + SubtitleCue/SRT
                           └─ Sharp/FFmpeg → PAGE_FRAME/PAGE_VIDEO + RenderedPage
```

T-A～T-G 已有真实 Route Handler、私有 HTTP、产品 PostgreSQL、PARSE/PLAN/AUDIO/PAGE_RENDER/COMPOSITE/VALIDATE Worker 与受控交付。现有页面仍默认使用 Mock；显式 `stage-t` 模式下阶段 3 项目列表已读取真实项目生命周期，独立 Worker 进程仍必须启动后才会消费重任务。

阶段 T0 的独立 POC 表继续保留。T-A 在同一可丢弃开发数据库中通过向前 migration 新增产品表；产品代码使用独立的 `PPT_DH_DATABASE_URL` 配置，不导入 T0 store。

## 前端

阶段 6 在显式 `stage-t` adapter 下增加 workspace snapshot：浏览器只读取同源 BFF 原页 URL、当前逐页 revision、批准与锁定状态。讲稿修改写入新的不可变 revision；页面锁定写入 `LessonPlan.isLocked` 并使用乐观 revision。无初始讲稿时，页面创建/恢复持久 PLAN task 并轮询服务端状态，不用浏览器计时器伪造规划完成。

- 位置：`frontend/`
- 框架：Next.js 16 App Router、React 19、TypeScript。
- UI：Tailwind CSS 4、Base UI/shadcn 风格组件、Motion。
- 数据与表单：TanStack Query、React Hook Form、Zod。
- 路由：项目首页、上传、项目审核、解析进度、生成进度和结果页。
- 数据源：页面默认仍是 `frontend/src/lib/api/mock-client.ts`；`real-tracer.ts` 已提供完整阶段 T adapter。阶段 3 的项目列表按 `stage-t` flag 使用真实列表/复制/归档/删除，其余页面继续按阶段 4～9 增量接线。
- 上传：Mock 只检查扩展名和 100 MB 上限，不读取或上传文件字节。
- 任务模拟：`frontend/src/lib/api/shared.ts` 与 Mock client 使用
  `setTimeout`/当前时间推导进度；刷新后数据丢失。
- 下载：当前结果主要是演示用 `data:` 字幕资源，没有由后端交付的真实视频 URL。

`frontend/src/types/` 目前只重导出 `packages/contracts/` 的 TypeScript 类型；Mock adapter 与 T-A 真实 adapter/BFF 都在输入输出边界运行共享 Zod Schema。

## 后端

- 位置：`backend/`
- 入口：`backend/run.mjs` 提供 `prepare`、`approve`、`render` 和完整 `run` CLI；
  根 package scripts 的 `backend:prepare`/`backend:approve` 则直接调用 Python。
- Python 部分：`python-pptx` 解析 PPTX；默认使用 LibreOffice `soffice.com`
  在独立临时 profile 中生成 PDF，再由 `pypdfium2` 逐页生成原页 PNG；Windows
  PowerPoint COM 只在 LibreOffice 不可用时回退。可调用 OpenAI 兼容 Chat
  Completions 接口，也可用 `--planner rules` 强制本地规则回退。
- 审核门禁：`backend/approve.py` 把人工审核后的计划规范化为已批准输入；完整
  `backend:run` 会自动批准，只适合回归，不是人工审核闭环。
- Node.js 部分：Edge TTS 生成语音和 SRT；Sharp 生成页面框架、固定位置数字人开闭口帧；
  FFmpeg 烧录字幕并合成 H.264/AAC MP4；ffprobe/解码脚本检查结果。
- 进度：`run.mjs` 使用 `spawnSync` 串行执行，并把阶段状态写入 job 目录的
  `job-status.json`。直接运行根 `backend:prepare`/`backend:approve` 不会完整更新该状态。
- 测试：`backend/tests/` 中有 Python 契约与解析单元测试。
- 应用服务：`backend/app/` 使用 Hono，当前实现上传、任务查询/取消、规划/音频任务、修订列表、用户修订、显式批准和音频时间轴读取；HTTP 请求不运行重任务。
- PARSE/PLAN/AUDIO/PAGE_RENDER Worker：dispatcher 把 outbox 投影为稳定 step；音频按句、渲染按页恢复，只重试失败工作单元。适配器分别调用 Python prepare、受约束 Agent、可取消 Edge TTS 或 Sharp/FFmpeg。
- 音频持久化：AudioSegment 关联冻结 revision/narration 和内容寻址 Asset；真实 MP3 通过 ffprobe/FFmpeg 解码与非静音校验后，SubtitleCue 与 AudioTimelineRecord 在最终事务中落库。

Python 与 Node.js 之间通过本地 JSON 和文件路径传递数据，没有进程内共享类型或正式的跨语言 schema 包。

## 数据库、任务队列与文件存储

| 能力 | 当前实现 |
| --- | --- |
| 数据库 | 已持久化 Project、Asset、Presentation、Slide、Revision、GenerationTask/Step/Attempt、媒体与验证记录；阶段 3 增加 Project `ARCHIVED` 生命周期。页面默认 Mock 与 CLI job JSON 仍并存。 |
| 任务队列 | 产品 PARSE/PLAN/AUDIO/PAGE_RENDER/COMPOSITE/VALIDATE Worker 已接入，支持 heartbeat、接管、取消、句/页级重试和不可变 attempt；T-G 受控交付只读取验证终态，不新增第二套队列。 |
| 文件存储 | 本地适配器保存源 PPTX、原页 PNG、逐句 MP3、SRT、PAGE_FRAME 和 PAGE_VIDEO，数据库只保存内部 storage key。 |
| 对象存储/CDN | 没有；阶段 T/3 使用项目范围内的本地资产 adapter。 |
| 公共资源授权 | T-A 上传/任务响应经过 scope 和公开投影，不含内部路径；CLI 调试 JSON 仍可能包含绝对路径。 |

阶段 11A 增加只面向本地资产适配器的对账边界：数据库 `Asset` 是已登记资产事实来源，对账器复核存在性、大小和 SHA-256，并报告未登记文件。默认 dry-run；只有显式启用、文件位于规范化的 `assetRoot/projects` 内且超过宽限期时才删除孤儿普通文件，符号链接永不跟随。该能力不把磁盘路径暴露给浏览器，也不替代阶段 11F 的媒体质量门禁。

PostgreSQL/Prisma 与 PARSE/PLAN/AUDIO lease Worker 已接入产品任务。对象存储和后续视频/媒体 Worker 仍未实现；Redis/BullMQ 不属于当前方案。

## 视频生成数据流

1. CLI 接收 PPTX 路径和 job 目录。
2. `prepare.py` 校验基本输入，使用 `python-pptx` 提取页面结构、文本、表格、备注和公式候选。
3. LibreOffice `soffice.com` 在任务临时 profile 中把源 PPTX 转为 PDF，`pypdfium2`
   逐页生成完整页面 PNG；仅 LibreOffice 不可用时才尝试 Windows PowerPoint COM。
4. 配置了模型凭据时调用 OpenAI 兼容接口生成结构化教学计划；否则使用确定性规则回退。
5. 系统写出草稿，等待人工修改和显式批准。
6. `approve.py` 生成审核后的计划文件。
7. `synthesize.mjs` 调用 Edge TTS，保存语音和字幕时序。
8. `render-frames.mjs` 使用 Sharp 把一个源页 `contain` 到课程画面框架。
9. `create-video.mjs` 使用 Sharp 在固定坐标叠加两张开/闭口头像，再用 FFmpeg
   烧录字幕并合成 1920×1080 H.264/AAC MP4；当前原型帧率为 12 fps。
10. `verify.mjs` 使用 ffprobe 和解码检查输出，并写出验证 JSON。

每个步骤依赖前一步在同一 job 目录产生的文件。当前没有事务、内容寻址、尝试隔离、持久 worker 或按步骤重试机制。

旧 CLI 验证器仍只有基础检查；产品 T-F 路径已新增独立 VALIDATE step，把 H.264/AAC、`yuv420p`、FPS、1080p、Fast Start、完整解码、时长、非静音、黑帧、逐页图像覆盖与安全布局作为硬门，并持久化不可变验证报告。只有 `VALIDATED` 的 MediaOutput 才能进入 T-G 交付。

T-G 的 `DeliveryRepository` 从任务、MediaOutput、ValidationRecord 与 Asset 关系重新授权。Hono 提供清单、元数据与受控二进制内容，支持 Range/ETag 并在读取时复核哈希；Next BFF 隐藏 internal token、principal、私有服务地址和 storage key。阶段 T 使用本地文件 adapter，未来对象存储实现不能改变公共 Delivery Contract。

阶段 7 把教学设置持久化到 Project 聚合并用 version 做乐观并发。试听不是浏览器计时器：BFF 创建单句持久 AUDIO task，Worker 复用既有 TTS 校验，完成后通过按 principal 授权且复核哈希的同源音频端点播放。逐页 hidden 设置冻结进 PAGE_RENDER payload；Worker 根据该快照决定是否合成数字人，避免任务运行时读取可变设置。

阶段 8 的生成页现在只协调一个持久 WorkflowRun，不是队列：它轮询根公共投影，下一阶段由服务端 orchestrator 在根 lease 下推进。根输入和子任务 ID 由 PostgreSQL 保存，浏览器 URL 只需保留根 ID；Worker、outbox、product lease、重试 attempt 与最终状态仍完全由后端拥有。

阶段 9 结果页以最终 VALIDATE taskId 聚合 FinalMedia、DeliveryManifest 与 Task 公共投影。播放器和下载只使用同源 BFF URL；下载前可重新获取 manifest，但该读取路径不创建任何 generation task。当前本地 HTTP adapter 的 URL 不设到期时间，未来对象存储可在不改变 manifest 语义的前提下换成短期签名地址。

阶段 10 为浏览器字幕增加最终 task 范围内的只读 WebVTT 投影：服务端重新授权已验证 captions asset、复核 SRT 完整性并转换时间分隔符，BFF 不暴露源路径。SRT 仍作为交付文件，VTT 仅作为播放器可访问性视图；两者不创建或修改生成任务。

阶段 11B 让旧 `.ppt` 先以原始 OLE 源资产进入持久 PARSE 任务，再由 Worker 在 attempt 隔离目录中使用 LibreOffice 转换为 `source.pptx`；转换结果不覆盖原始上传，且继续经过同一严格 PPTX Contract、连续页码和 1920×1080 原页检查。图片公式 OCR 已延期，图片只触发人工核对警告并完整保留在原页中。

阶段 11C 保留单一 Provider 调用，不引入多 Agent 或第二运行时。Provider 输出通过 strict Contract 后依次经过内容理解、教学规划、讲稿、推导、分镜和结果审核六个纯确定性模块；JSON 修复只处理包装噪声且最多两次，不新增或猜测业务字段。版本化离线评测始终记录真实分子/分母。

阶段 11D 的生产音频候选必须通过解码、时长、16–48kHz 采样率、非静音和无削波风险检查。Worker 可按冻结 inputHash 复用同项目既有 AudioSegment，但必须先复核资产大小与 SHA-256；复用只省略 Provider 调用，新任务仍保留自己的 segment、cue、timeline 和 attempt 审计。

阶段 11E 对 PAGE_RENDER 使用相同的冻结输入缓存边界：source/audio/overlay/avatar/FPS/renderer version 任一变化都会改变 page inputHash；命中时仍复核 frame/video 完整性，新任务保留独立 RenderedPage 与 attempt。attempt 目录只允许首次创建，避免旧帧污染。25/30 FPS 均可显式请求，未确认容量前默认冻结为 25 FPS。

阶段 11F 把最终候选 MP4 与逐页覆盖基准帧的实际落盘大小和 SHA-256 复核置于媒体分析之前。最终报告除既有编码、完整解码、Fast Start、页面覆盖、黑帧与遮挡策略外，还记录平均响度和峰值；只有所有硬门通过，Task、MediaOutput、Asset、Validation 与 Step 才原子收口到一致成功终态。项目包范围未确认时，交付边界保持版本化元数据、讲稿/场景引用和资产清单，不推断为完整离线工程。

默认 Mock 模式的音色试听使用三份版本化真实 MP3，不在浏览器或 Route Handler 中调用 TTS；动态路由只校验音色与语速并重定向到对应静态资产，播放器在客户端应用冻结的授课倍速。真实模式仍通过 BFF 创建持久 AUDIO 试听任务，由 Worker 按相同 voice/rate/pitch 映射合成和验证，浏览器不直接调用 Edge TTS。

## 模块边界

- 浏览器代码只在 `frontend/`，没有直接导入 `backend/`。
- PPT、LLM、TTS、Sharp 和 FFmpeg 仅在 `backend/` 使用。
- Python 负责 PPTX 解析、计划准备和批准；Node.js 负责 CLI 编排和音视频处理。
- `packages/contracts/` 已存在，统一 Mock、真实 adapter、BFF 和 Hono 服务的 T-A 结构；Python 内部模型和 Node CLI JSON 尚未迁移，因此跨语言边界仍可能漂移。
- 根 `package.json` 只负责编排 frontend/backend workspace 命令，不是业务实现层。

“浏览器 → 薄 BFF → 私有后端应用服务 → 持久 Worker → Revision/批准 → 音频/分页渲染 → 合成/验证 → 受控交付”已实现真实三页纵切；页面仍默认 Mock，阶段 3 已接项目管理，其余逐屏接线属于阶段 4～9。

## 尚未采用的候选技术

以下内容不得在新文档或代码评审中写成现状：

- 产品 audio/render/validate lease Worker；当前已有 PARSE 与单 Agent PLAN Worker。
- 完整 Next.js BFF/API；当前只有 T-A 上传与任务查询两个公开边界。
- S3/OSS 等对象存储、签名 URL 和 CDN。
- Remotion 或其他替代当前 Sharp/FFmpeg 管线的渲染框架。
- OpenAI Agents SDK、多 Agent 编排或固定生产模型。
- 阿里云或其他正式 SLA TTS、特定云部署平台。

仓库中的 `backend/Dockerfile` 只封装现有 CLI，不代表已经存在 HTTP 服务、数据库、
队列、对象存储或 `docker-compose` 运行环境。Docker Desktop 4.84.0 虽已安装，但其
WSL2 engine 在当前主机上无法创建 `docker-desktop` 发行版；用户已批准停止 Docker
修复并改走 ADR-011 的等价本地方案。

## 文档与代码冲突

| 文档中的目标或旧描述 | 代码事实 |
| --- | --- |
| 前端完成上传到生成的端到端流程 | 页面流程存在，但业务数据全部来自 Mock client；后端 CLI 未接入。 |
| 使用共享 Zod 契约和稳定 ID | `packages/contracts/` 已创建并被前端 Mock adapter 使用；Python/Node CLI 仍有独立内部模型和 JSON 形状。 |
| 真实异步任务、数据库、队列和对象存储 | 上传与 PARSE 已形成持久异步闭环；Agent/媒体、对象存储和最终交付仍缺失。 |
| 每个非跳过源页完整出现 | 多源场景的渲染路径当前取第一个 `sourceSlides`，存在漏页风险。 |
| 审核后的覆盖数据与场景一致 | `approve.py` 沿用生成时的 `sourceSlideCoverage`，人工改页后可能陈旧。 |
| 始终保留原页视觉 | 原页渲染失败时存在文本重建回退，不能保证原版式保真。 |
| 公共响应不暴露服务端路径 | 后端现有产物 JSON 可能包含绝对 `videoPath` 等本地路径。 |
| 完整生产媒体门禁 | 当前有 ffprobe/解码检查，但部分编码条件只是警告，页面覆盖、遮挡、黑帧、静音和哈希门禁不完整。 |
| 验证通过后才标记完成 | `create-video.mjs` 在 `verify.mjs` 之前把 `result.json.status` 写成 `completed`；job 状态会在验证失败时改为 failed，但产物状态可能矛盾。 |
| 生产模型由服务端配置且无代码默认值 | Python CLI 从被 Git 忽略的 `backend/.env` 或显式进程环境读取模型；配置密钥时 `LLM_MODEL` 为必填，代码不再内置生产模型名。 |
