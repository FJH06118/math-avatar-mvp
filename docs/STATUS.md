# 项目状态

> 更新时间：2026-08-02。代码和 Git 状态是事实来源；文档与代码冲突时，以代码为准并在这里记录。

## 当前基线

- 分支：`main`。
- 目录重组、依赖调整、后端原型和详细资料已经按拆分方案提交；提交历史以 `git log --oneline` 为准。
- 本地 `main` 当前相对 `origin/main` ahead 6，尚未执行 push；本轮已按用户批准拆分创建阶段 2 Contract 与 T0 文档两个提交，未执行 push。
- 当前仓库包含 `frontend/`、`backend/`、`packages/contracts/` 和 `docs/` 四个主要工作区；根目录保留工作区级脚本和配置。
- 前端仍是浏览器内存中的 Mock API 应用；后端是独立运行的本地 CLI 视频管线，两者尚未通过真实 API 接通。
- `frontend/.next/`、`frontend/out/`、`backend/work/`、缓存和 Python 字节码均由 `.gitignore` 排除，未纳入提交。

## 已完成功能

### 前端

- Next.js App Router 页面覆盖项目列表、上传、解析进度、三栏审核工作台、生成进度和结果页。
- 已有加载、空、错误、确认等反馈组件，以及数字人、声音、字幕和教学视觉设置 UI。
- TanStack Query 与 Mock API 支持主要交互演示。
- 原根前端已移动到 `frontend/`，前端清单、脚本和配置已按 workspace 结构整理。

### 后端原型

- PPTX 文本、表格、分组、备注和公式候选解析。
- Windows PowerPoint COM 或 LibreOffice 原页图片生成。
- OpenAI 兼容模型规划与确定性规则回退。
- 人工审核/批准门禁及 Python 契约、解析单元测试。
- Edge TTS、SRT 字幕、Sharp 帧合成、固定头像叠加、FFmpeg H.264/AAC 视频生成和基础媒体验证。
- `backend/README.md`、`backend/Dockerfile` 和 `.env.example` 已提供本地运行参考；Docker Desktop 已安装但 engine 不可用，容器构建仍未验证。

### 文档与工程基线

- 已建立入口文档、精简 PRD、真实架构、决策、状态和当前任务文档。
- 已提交详细产品 PRD、架构决策、实施计划、历史交接资料和前端计划迁移。
- 根 workspace 脚本可委托前端检查和后端 CLI 命令；依赖锁文件与 workspace 清单一致。

### 阶段 2 共享 Contract

- `packages/contracts/` 已创建并加入 npm workspace；Zod schema 是当前跨 TypeScript 业务结构的唯一类型来源。
- 已覆盖阶段 T 最小消费范围：稳定 ID、Project、Presentation、Slide、LessonPlanRevision、Scene、一个受控 Overlay、Task/TaskStep、Asset、公开 API 错误和下载引用。
- strict Schema 与跨字段规则拒绝未知字段、非法 ID、未授权 `FULL_REDESIGN`、不完整原页镜头、陈旧 `sourceSlideCoverage`、漏页、未批准 revision 和内部资源路径。
- Mock API 的主要输入/输出已按共享 Schema 运行时解析；前端领域类型改为重导出共享 `z.infer` 类型。
- `npm.cmd run test:contracts` 已通过，包含 6 个边界测试。

## 正在进行

- 阶段 1A、阶段 1B、阶段 2 与阶段 T0 均已完成。Next 内嵌依赖剩余 3 项 high 已由用户于 2026-08-01 明确风险接受。T0 的无 Docker 基础设施 POC、P-01/P-02、DeepSeek V4 Flash Provider 预检和自动原页 PNG 导出均有专项运行证据，且本轮串行质量门禁已通过；按 STOP 规则等待用户确认，不进入真实产品集成。
- 用户于 2026-08-02 批准 Windows 原生 PostgreSQL + Prisma + PostgreSQL lease worker 作为等价本地方案；Redis/BullMQ 不再属于 T0 方案。PostgreSQL 18.4 已安装为本机服务，最小 POC 代码和运行证据存在，但它不是产品数据库、HTTP 服务或真实 Worker 实现。
- 实际 Windows 用户 PATH 已配置现有 Python 3.10.11；新开的普通终端应使用标准 `python` 命令，项目脚本不依赖 Codex 私有解释器路径。
- Vitest、React Testing Library、一个 API adapter 测试、错误重试组件测试、关键生成确认交互测试、共享 Contract 测试和 `routes:check` 已加入；阶段 1A 与阶段 2 的完整门禁均已通过。
- 阶段 1B 已锁定 `brace-expansion@1.1.18`、`postcss@8.5.23`、`shadcn@4.16.1`、`@modelcontextprotocol/sdk@1.30.0` 和 `@hono/node-server@2.0.12`；官方 audit 从 6 项降至 3 项 high。

## 未完成任务

1. 等待用户确认是否开始阶段 T。自动原页 PNG、DeepSeek V4 Flash Provider 预检与私有 14 页课件的右下角默认数字人位置均已确认；实质遮挡提醒属于阶段 T 实现。
2. 用真实 API adapter/BFF 替换 Mock client，并实现认证、授权和稳定业务 ID。
3. 持久化项目、任务和版本，引入可取消、可重试、幂等且可恢复的任务执行。
4. 在 T0 POC 通过后按已批准架构接入数据库和 PostgreSQL lease worker；对象存储仍未选择，这些能力目前均未实现。
5. 完善 PPT/PPTX 安全校验、隔离执行、上传策略及图片公式 OCR 范围。
6. 补齐多页源页面覆盖、遮挡、黑帧、静音、时长、哈希、编码和最终状态一致性等硬门禁。
7. 增加集成和端到端测试；当前仍只覆盖 Mock API、共享 Contract 和最小前端 unit/component 测试。
8. 验证生产 LLM/TTS 供应商、正式交付规格和真实端到端媒体样本。

## 已知问题

- 前端项目、任务和进度只存于浏览器内存，刷新即丢失；上传只检查扩展名和 100 MiB 上限，不读取或传输真实文件。
- 前端结果页的 `videoUrl` 为空且 `assetsAvailable=false`，没有后端生成的真实视频资源。
- 后端主链仍是本地 V0.1 原型：仅支持 `.pptx`，没有 HTTP 服务、产品数据库、产品任务队列或对象存储；T0 的独立 PostgreSQL POC 只验证恢复语义。
- 多页场景当前可能只处理 `sourceSlides[0]`；原页渲染失败时的文本回退、`sourceSlideCoverage` 更新和最终结果状态仍有已知缺口。
- 后端产物 JSON 可能包含服务端绝对路径；同一 job 目录重跑可能受到陈旧帧或临时文件影响。
- 视频验证目前不是完整硬门禁，尚未覆盖全量页面、遮挡、黑帧、静音、哈希和 Fast Start 等要求。
- DeepSeek V4 Flash 已完成本机 Provider 预检；正式 TTS 凭据、供应商与完整 Agent 工具调用兼容性尚未确认。
- 当前没有 OCR、真实集成或端到端测试；阶段 1A 的前端 unit/component 测试、阶段 2 Contract 测试与 `routes:check` 已建立。
- 详细历史问题和实施风险见 `docs/ARCHITECTURE_DECISIONS.md`、`docs/IMPLEMENTATION_PLAN.md` 与 `backend/README.md`。

## 当前阻塞项

- Docker Desktop 4.84.0 已安装，但 WSL2 engine 创建 `docker-desktop` 发行版时报 `HCS_E_HYPERV_NOT_INSTALLED`，engine 当前不可用。用户已停止 Docker 修复并批准等价本地方案，因此 Docker 本身不再是 T0 目标；`backend/Dockerfile` 仍只有静态审查证据。
- PostgreSQL 18.4 与 `postgresql-x64-18` Windows 服务已安装并运行。`npm.cmd run t0:test` 已通过 7/7，覆盖 transaction/outbox、幂等、outbox 重放、并发 lease、heartbeat、Worker kill 接管、取消竞态、重试上限和 migration；该证据只关闭 T-05，不关闭其他 T0 入口条件。
- Windows 组件存储 `DISM /CheckHealth` 报告“可以修复组件存储”；用户于 2026-08-02 明确要求终止正在运行的修复，`DISM` PID 20244 与 `DismHost` PID 8388 已定向强制结束。该次 `RestoreHealth` 未完成，不得视为组件存储已修复。
- P-01 高等数学优先、P-02 内部单用户范围与 DeepSeek V4 Flash Provider 预检均已确认；私有 14 页课件已经离线解析并手工导出原页 PNG，右下角默认数字人位置已确认。自动原页 PNG 已用合成三页 fixture 验证；实质遮挡的提醒逻辑仍须在阶段 T 验证。
- 初始接管所用 Codex 宿主终端未刷新用户 PATH：`python` 命令不可用；重开 PowerShell 后已恢复标准 `python` 调用并通过全部门禁。
- 真实端到端验证仍需要 TTS 配置。2026-08-02 的私有 14 页课件离线解析成功，并从交互式桌面 PowerPoint 手工导出十四张 1280×720 PNG；用户确认右下角默认数字人位置，实质遮挡时必须提醒。2026-08-03 的 DeepSeek V4 Flash Provider 预检已通过 JSON 结构化输出与重试分类。当天复测确认受限开发终端不能接管交互式 PowerPoint COM；经用户授权交互式安装官方签名 LibreOffice 26.2.5.2 后，后端改用 `soffice.com` 的独立临时 profile 生成本地 PDF，并用固定 `pypdfium2==5.12.1` 逐页生成 PNG。合成三页 fixture 自动得到 3/3 张 1920×1080 PNG，随后用户指定私有课件自动得到 14/14 张 1920×1080 PNG；两次均为 `renderer=libreoffice`、无 render error，且强制本地 rules planner，未调用 Provider。不再依赖 Codex 私有 `pdftoppm` 包装器。阶段 T 仍需要真实流程的遮挡和媒体门禁验证。
- 数据库/任务方向已按 ADR-011 批准并通过最小 POC；生产 API、对象存储和供应商选择仍需确认。共享 Contract 和已批准方向都不代表这些技术已实现。
- 当前稳定 Next 版本没有同时修复其内嵌 PostCSS 与 Sharp 高危项的兼容补丁；canary 不作为阶段 1B 方案。该残余风险已由用户明确接受，未来升级 Next 或进入生产化前必须重新审查。

## 最近检查

2026-08-02 阶段 T0 环境事实检查：

- `git status --short --untracked-files=all`、`git branch -vv`、`git log --oneline -10`：已执行；分支为 `main`。提交前相对 `origin/main` ahead 4；经用户批准拆分创建两个提交后为 ahead 6，未 push。
- Node.js `v24.16.0`、npm `11.13.0`、Python `3.10.11`：可用。
- Docker Desktop `4.84.0`：CLI/桌面已安装；engine 未启动，日志根错误为 `Wsl/Service/RegisterDistro/CreateVm/HCS/HCS_E_HYPERV_NOT_INSTALLED`。
- `VirtualMachinePlatform`、`Microsoft-Windows-Subsystem-Linux`、`HypervisorPlatform`：已启用；系统报告 hypervisor 存在。
- PostgreSQL 18.4：原生服务 `postgresql-x64-18` 正在运行；应用与 shadow 测试数据库均为可丢弃本机资源，连接串未纳入 Git。
- `npm.cmd run t0:test`：通过，7/7；使用 Prisma 7.9.1 和 PostgreSQL 多连接验证 transaction/outbox、同键幂等、outbox 重放、`FOR UPDATE SKIP LOCKED`、heartbeat、子进程 kill 接管、取消/完成竞态、retry 上限与 fresh/forward migration。
- 本轮完整串行门禁：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run test`、`npm.cmd run build`、`npm.cmd run routes:check` 均通过；`test` 包含后端 4/4、Contract 6/6、前端 unit 1/1 和 component 3/3，路由检查的 6 条业务路由均为 HTTP 200 且服务已回收。
- `DISM /Online /Cleanup-Image /CheckHealth`：组件存储可修复；随后启动的 `RestoreHealth` 经用户明确要求终止，目标 PID 20244/8388 已复核不存在。
- 本次只是 T0 决策文档更新，未运行或宣称完整阶段门禁通过。

2026-08-01 已完成：

- `npm.cmd ls --depth=0 --workspaces`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run build`：通过，Next.js 16.2.11 生成 7 条 App Router 路由。
- Codex bundled Python `unittest discover -s backend/tests -v`：4/4 通过。
- `node --check backend/run.mjs backend/video/*.mjs`：通过。
- 当日 `docker --version`：不可用；这是安装 Docker Desktop 前的历史结果，未进行 Docker 构建。

2026-08-01 阶段 1A 已完成（历史验证记录）：

- 现有 `D:\Python310\python.exe` 已确认是 Python 3.10.11，且具备后端测试依赖；通过实际用户 PATH 运行 `npm.cmd run backend:test`，4/4 通过。
- `npm.cmd exec --workspace @ppt-digital-human/frontend vitest run`：3 个测试文件、4 个断言通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run test`：通过，后端 4/4、unit 1/1、component 3/3。
- `npm.cmd run build`：通过，Next.js 16.2.11 生成 7 条业务路由。
- `npm.cmd run routes:check`：通过，6 条业务路由均为 HTTP 200，生产服务已回收。

2026-08-01 阶段 1B 依赖审计：

- 官方 `npm audit --registry=https://registry.npmjs.org`：初始 6 项（2 moderate、4 high）；修复后 3 项 high。
- `npm.cmd ls next sharp postcss brace-expansion shadcn @modelcontextprotocol/sdk @hono/node-server --all`：通过，无 invalid。
- 未运行 `npm audit fix --force`，未安装 Next canary。
- 依赖变更后 `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run test`、`npm.cmd run build` 和 `npm.cmd run routes:check`：全部通过。
- 用户于 2026-08-01 明确接受剩余 3 项 Next high 风险；阶段 1B 关闭，未进入阶段 2。

2026-08-01 阶段 2 共享 Contract：

- `npm.cmd run test:contracts`：6/6 契约边界测试通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run build`：通过，Next.js 16.2.11 生成 7 条 App Router 路由。
- `npm.cmd install --package-lock-only --ignore-scripts --offline` 与 `npm.cmd install --ignore-scripts --offline`：通过，workspace lockfile 一致。
- `npm.cmd run test`：通过，后端 4/4、Contract 6/6、unit 1/1、component 3/3。
- `npm.cmd run routes:check`：通过，6 条业务路由均为 HTTP 200，生产服务已回收。

初始接管复核（旧宿主进程，后续已重开 PowerShell）：

- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run test`：阻塞；`python` 未被当前进程解析，尚未进入后端、unit 或 component 测试。
- `py -3`：未发现已注册的 Python；直接路径检查确认 `D:\Python310\python.exe` 为 Python 3.10.11。
- 因测试门禁阻塞，按规则未继续运行本轮的 `npm.cmd run build` 和 `npm.cmd run routes:check`。

## 下一步建议

1. DISM 已按用户要求终止；如果后续系统安装或 Windows 功能出现异常，先重新检查组件存储状态，不自动继续 Docker/WSL 修复。
2. 如用户确认进入阶段 T，必须先重新执行事实检查并读取新的 `docs/CURRENT_TASK.md`；阶段 T 必须在实质遮挡时提醒。
3. 未经用户确认不得开始阶段 T，更不得直接进入阶段 3。
