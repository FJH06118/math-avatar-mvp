# 项目状态

> 更新时间：2026-08-01。代码和 Git 状态是事实来源；文档与代码冲突时，以代码为准并在这里记录。

## 当前基线

- 分支：`main`。
- 目录重组、依赖调整、后端原型和详细资料已经按拆分方案提交；提交历史以 `git log --oneline` 为准。
- 已提交代码基线已同步到 `origin/main`；当前工作树只包含本轮尚未提交的规划与 Codex 交接文档。
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

- 正在建立可复用的 Codex 续接提示词和全流程开发路线图；本轮不修改业务代码。
- 规划文档尚未提交，等待用户复核与提交授权。
- 文档基线完成后的下一阶段是“阶段 1A：可复现环境与测试保护”；不得直接跳到真实 API 或基础设施建设。

## 未完成任务

1. 创建 `packages/contracts/`，以严格 Zod schema 统一浏览器、Node 和 Python 边界契约。
2. 用真实 API adapter/BFF 替换 Mock client，并实现认证、授权和稳定业务 ID。
3. 持久化项目、任务和版本，引入可取消、可重试、幂等且可恢复的任务执行。
4. 根据确认后的架构接入数据库、队列和对象存储；这些技术目前尚未采用。
5. 完善 PPT/PPTX 安全校验、隔离执行、上传策略及图片公式 OCR 范围。
6. 补齐多页源页面覆盖、遮挡、黑帧、静音、时长、哈希、编码和最终状态一致性等硬门禁。
7. 增加前端组件/契约/集成/端到端测试及 `routes:check`；当前项目尚无这些测试命令。
8. 验证生产 LLM/TTS 供应商、正式交付规格和真实端到端媒体样本。

## 已知问题

- 前端项目、任务和进度只存于浏览器内存，刷新即丢失；上传只检查扩展名和 100 MiB 上限，不读取或传输真实文件。
- 前端结果页的 `videoUrl` 为空且 `assetsAvailable=false`，没有后端生成的真实视频资源。
- 后端仍是本地 V0.1 原型：仅支持 `.pptx`，没有 HTTP 服务、数据库、任务队列或对象存储。
- 多页场景当前可能只处理 `sourceSlides[0]`；原页渲染失败时的文本回退、`sourceSlideCoverage` 更新和最终结果状态仍有已知缺口。
- 后端产物 JSON 可能包含服务端绝对路径；同一 job 目录重跑可能受到陈旧帧或临时文件影响。
- 视频验证目前不是完整硬门禁，尚未覆盖全量页面、遮挡、黑帧、静音、哈希和 Fast Start 等要求。
- 默认模型仍可能是 `deepseek-chat`；生产模型、TTS 凭据和供应商尚未确认。
- 当前没有 OCR、前端测试、契约测试、端到端测试或 `routes:check`。
- 详细历史问题和实施风险见 `docs/ARCHITECTURE_DECISIONS.md`、`docs/IMPLEMENTATION_PLAN.md` 与 `backend/README.md`。

## 当前阻塞项

- 当前机器没有 `python` 或已安装的 Python 3 命令；本轮后端测试使用 Codex 提供的 Python 解释器运行，项目默认 `npm.cmd run backend:test` 无法直接复现。
- 当前机器没有 Docker 命令，因此 `backend/Dockerfile` 只完成静态审查，未完成容器构建验证。
- 真实端到端验证还需要可用的示例课件、PowerPoint/LibreOffice、FFmpeg、模型和 TTS 配置。
- 生产 API、数据库、队列、对象存储和供应商选择仍需产品/架构确认，未视为既定方案。

## 最近检查

2026-08-01 已完成：

- `npm.cmd ls --depth=0 --workspaces`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run build`：通过，Next.js 16.2.11 生成 7 条 App Router 路由。
- Codex bundled Python `unittest discover -s backend/tests -v`：4/4 通过。
- `node --check backend/run.mjs backend/video/*.mjs`：通过。
- `docker --version`：不可用；未进行 Docker 构建。
- `npm.cmd run backend:test`：因环境缺少 `python` 命令未启动；等价测试已用 bundled Python 通过。

## 下一步建议

1. 复核并单独提交本轮规划/交接文档，不与阶段 1A 功能代码混合。
2. 阶段 1A 先解决标准 Python 3.10+ 可用性，再建立 Vitest/组件测试、根 `test` 和 `routes:check`。
3. 阶段 1A 通过后单独处理依赖安全告警；随后创建最小共享 Zod Contract。
4. 只有阶段 1、2 门禁及 T0 进入条件满足后，才开始三页真实产品纵向切片。
