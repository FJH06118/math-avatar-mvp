# 项目状态

> 更新时间：2026-08-01。代码和 Git 状态是事实来源；文档与代码冲突时，以代码为准并在这里记录。

## 当前基线

- 分支：`main`。
- 目录重组、依赖调整、后端原型和详细资料已经按拆分方案提交；提交历史以 `git log --oneline` 为准。
- 本地 `main` 当前相对 `origin/main` ahead 2，尚未执行 push；规划与交接文档已于 `546c6bb` 单独提交。
- 当前仓库包含 `frontend/`、`backend/` 和 `docs/` 三个主要工作区；根目录保留工作区级脚本和配置。
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
- `backend/README.md`、`backend/Dockerfile` 和 `.env.example` 已提供本地运行参考；Docker 尚未在当前环境验证。

### 文档与工程基线

- 已建立入口文档、精简 PRD、真实架构、决策、状态和当前任务文档。
- 已提交详细产品 PRD、架构决策、实施计划、历史交接资料和前端计划迁移。
- 根 workspace 脚本可委托前端检查和后端 CLI 命令；依赖锁文件与 workspace 清单一致。

## 正在进行

- 阶段 1A 与阶段 1B 已完成；Next 内嵌依赖剩余 3 项 high 已由用户于 2026-08-01 明确风险接受，当前停在阶段 2 确认点，不得直接进入真实 API 集成。
- 实际 Windows 用户 PATH 已配置现有 Python 3.10.11；新开的普通终端应使用标准 `python` 命令，项目脚本不依赖 Codex 私有解释器路径。
- Vitest、React Testing Library、一个 API adapter 测试、错误重试组件测试、关键生成确认交互测试和 `routes:check` 已加入；阶段 1A 门禁已串行通过。
- 阶段 1B 已锁定 `brace-expansion@1.1.18`、`postcss@8.5.23`、`shadcn@4.16.1`、`@modelcontextprotocol/sdk@1.30.0` 和 `@hono/node-server@2.0.12`；官方 audit 从 6 项降至 3 项 high。

## 未完成任务

1. 创建 `packages/contracts/`，以严格 Zod schema 统一浏览器、Node 和 Python 边界契约。
2. 用真实 API adapter/BFF 替换 Mock client，并实现认证、授权和稳定业务 ID。
3. 持久化项目、任务和版本，引入可取消、可重试、幂等且可恢复的任务执行。
4. 根据确认后的架构接入数据库、队列和对象存储；这些技术目前尚未采用。
5. 完善 PPT/PPTX 安全校验、隔离执行、上传策略及图片公式 OCR 范围。
6. 补齐多页源页面覆盖、遮挡、黑帧、静音、时长、哈希、编码和最终状态一致性等硬门禁。
7. 增加契约、集成和端到端测试；阶段 1A 已具备最小前端 unit/component 测试和 `routes:check`，尚未覆盖真实产品流。
8. 验证生产 LLM/TTS 供应商、正式交付规格和真实端到端媒体样本。

## 已知问题

- 前端项目、任务和进度只存于浏览器内存，刷新即丢失；上传只检查扩展名和 100 MiB 上限，不读取或传输真实文件。
- 前端结果页的 `videoUrl` 为空且 `assetsAvailable=false`，没有后端生成的真实视频资源。
- 后端仍是本地 V0.1 原型：仅支持 `.pptx`，没有 HTTP 服务、数据库、任务队列或对象存储。
- 多页场景当前可能只处理 `sourceSlides[0]`；原页渲染失败时的文本回退、`sourceSlideCoverage` 更新和最终结果状态仍有已知缺口。
- 后端产物 JSON 可能包含服务端绝对路径；同一 job 目录重跑可能受到陈旧帧或临时文件影响。
- 视频验证目前不是完整硬门禁，尚未覆盖全量页面、遮挡、黑帧、静音、哈希和 Fast Start 等要求。
- 默认模型仍可能是 `deepseek-chat`；生产模型、TTS 凭据和供应商尚未确认。
- 当前没有 OCR、契约测试或端到端测试；阶段 1A 的前端 unit/component 测试与 `routes:check` 已建立。
- 详细历史问题和实施风险见 `docs/ARCHITECTURE_DECISIONS.md`、`docs/IMPLEMENTATION_PLAN.md` 与 `backend/README.md`。

## 当前阻塞项

- 当前机器没有 Docker 命令，因此 `backend/Dockerfile` 只完成静态审查，未完成容器构建验证。
- 初始接管所用 Codex 宿主终端未刷新用户 PATH：`python` 命令不可用；重开 PowerShell 后已恢复标准 `python` 调用并通过全部门禁。
- 真实端到端验证还需要可用的示例课件、PowerPoint/LibreOffice、FFmpeg、模型和 TTS 配置。
- 生产 API、数据库、队列、对象存储和供应商选择仍需产品/架构确认，未视为既定方案。
- 当前稳定 Next 版本没有同时修复其内嵌 PostCSS 与 Sharp 高危项的兼容补丁；canary 不作为阶段 1B 方案。该残余风险已由用户明确接受，未来升级 Next 或进入生产化前必须重新审查。

## 最近检查

2026-08-01 已完成：

- `npm.cmd ls --depth=0 --workspaces`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run build`：通过，Next.js 16.2.11 生成 7 条 App Router 路由。
- Codex bundled Python `unittest discover -s backend/tests -v`：4/4 通过。
- `node --check backend/run.mjs backend/video/*.mjs`：通过。
- `docker --version`：不可用；未进行 Docker 构建。

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

初始接管复核（旧宿主进程，后续已重开 PowerShell）：

- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run test`：阻塞；`python` 未被当前进程解析，尚未进入后端、unit 或 component 测试。
- `py -3`：未发现已注册的 Python；直接路径检查确认 `D:\Python310\python.exe` 为 Python 3.10.11。
- 因测试门禁阻塞，按规则未继续运行本轮的 `npm.cmd run build` 和 `npm.cmd run routes:check`。

## 下一步建议

1. 阶段 1B 已完成；等待用户确认是否进入阶段 2 共享 Contract。
2. 未获确认不得创建 `packages/contracts/` 或进入真实产品集成。
3. 只有阶段 1、2 门禁及 T0 进入条件满足后，才开始三页真实产品纵向切片。
