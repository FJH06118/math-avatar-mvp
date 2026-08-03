# 当前任务

> 更新时间：2026-08-03。
> 状态：阶段 T0「真实切片进入条件与基础设施 POC」已完成（2026-08-03）。全部专项与串行质量门禁均已通过；按单阶段 STOP 规则，现等待用户明确确认是否进入阶段 T。

## 当前阶段与唯一目标

当前只处理阶段 T0。本轮已在普通 Windows 开发环境中完成原生 PostgreSQL + Prisma + PostgreSQL lease worker 的最小基础设施 POC，证明事务、幂等、outbox、租约、心跳、取消、接管、Worker kill 与向前 migration 语义。

本轮唯一目标“自动原页 PNG 导出环境收口”已完成：LibreOffice `soffice.com` 先在独立临时配置目录生成 PDF，`pypdfium2` 逐页输出 PNG；PowerPoint COM 只作为 LibreOffice 不可用时的 Windows 回退。私有课件默认在右下角放置数字人；实质遮挡标题、公式、图表、关键文本或字幕安全区时必须提醒用户，不能静默覆盖。T0 完成后不自动实现阶段 T 的 HTTP、真实上传或产品 Worker。

## 已确认事实

- 阶段 1A、阶段 1B 和阶段 2 已完成；阶段 2 的完整串行门禁和 `test:contracts` 已通过。
- P-01 已于 2026-08-02 确认：首发评测以高等数学优先，跨学科 Contract 保持通用。
- P-02 已于 2026-08-02 确认：首发仅面向内部单用户，在本机/测试环境使用固定 principal；不得作为生产身份方案。
- 用户于 2026-08-02 指定一份本机私有 14 页高等数学 PPTX 作为阶段 T 的业务验证输入。离线解析为 14 页/14 个规则场景，交互式桌面 PowerPoint 已导出 14 张 1280×720 原页 PNG；源课件保留在仓库外的本机位置，PNG 位于被 Git 忽略的工作目录。用户确认使用 `{x: 0.87, y: 0.70, width: 0.11, height: 0.28}` 作为默认右下角数字人区域；实质遮挡须在批准前提醒。
- 2026-08-03 已用 `npm.cmd run backend:provider:preflight` 验证本机忽略配置中的 DeepSeek V4 Flash：官方 OpenAI-compatible 地址、模型选择、JSON 结构化响应与超时/连接/限流/5xx 重试分类均有代码与运行证据；请求不包含课件内容，命令不输出密钥。完整 Agent 工具调用兼容性仍属于阶段 T 验证。
- `backend/tests/fixtures/tracer-3.pptx` 不再是阶段 T 的业务验证输入；为保留既有专项测试证据，暂不删除或改写该合成回归样本，除非用户明确要求。
- `packages/contracts/` 已存在并被前端 Mock adapter 使用；当前前端仍是内存 Mock，后端仍是独立本地 CLI，两端尚未通过真实 HTTP 接通。
- Docker Desktop 4.84.0 已安装，但 WSL2 engine 创建 `docker-desktop` 发行版时返回 `HCS_E_HYPERV_NOT_INSTALLED`，当前 Docker engine 不可用。
- 用户已明确停止 Docker 修复，并批准以 Windows 原生 PostgreSQL + Prisma + PostgreSQL lease worker 作为等价本地方案；T0 不再依赖 Docker、Redis 或 BullMQ。
- PostgreSQL 18.4 已安装为 Windows 原生服务，`postgresql-x64-18` 正在运行；POC 使用独立、可丢弃的本机应用数据库和 Prisma shadow database，连接串只存在于被 Git 忽略的本地配置中。
- `npm.cmd run t0:test` 已通过 7/7：transactional task/outbox、幂等键、outbox 重放、`FOR UPDATE SKIP LOCKED` 并发领取、heartbeat、真实子进程 kill 后接管、取消/完成竞态、重试上限，以及 fresh/forward migration 和部分唯一索引均有运行证据。
- 2026-08-03 已通过官方签名 LibreOffice 安装交互式授权安装 LibreOffice 26.2.5.2，并固定 `pypdfium2==5.12.1`。`python -m unittest backend.tests.test_prepare_rendering -v` 通过 2/2；强制本地 rules planner 的自动导出先生成合成 fixture 3/3 张 1920×1080 PNG，后生成用户指定私有 14 页课件的 14/14 张 1920×1080 PNG；两次均为 `renderer=libreoffice`、`renderError=null`。两次命令均不发送课件或 fixture 内容给 Provider，输出位于 Git 忽略的工作目录。
- Windows 组件存储检查结果为可修复。用户于 2026-08-02 明确要求终止修复；`DISM` PID 20244 和 `DismHost` PID 8388 已通过一次 UAC 提权的定向 `taskkill` 结束，并复核为不存在。该次 `RestoreHealth` 未完成，不得记录为修复成功。

## 已批准但仍受门禁约束的基础设施方向

- 单一 PostgreSQL 同时保存领域状态、任务快照、outbox、step attempt、租约、心跳和取消状态。
- Prisma 管理类型化数据访问和向前迁移；Prisma 无法表达的部分唯一索引等约束使用受审查的原始 migration SQL。
- Worker 通过 PostgreSQL `FOR UPDATE SKIP LOCKED` 竞争任务，并使用稳定去重键、租约到期时间和 heartbeat 支持崩溃接管。
- 不引入 Redis/BullMQ，不并行维护第二套队列；若 POC 不能证明恢复语义，先停止并更新 ADR/路线图。
- 本地连接通过受配置管理的数据库 URL，不把 PostgreSQL 安装路径、密码或本机目录写入代码或 Git。

该方向仍是 `Accepted with gate`：最小 POC 已有代码和运行证据，但它不等于阶段 T 的产品实现，也不等于阶段 T0 已完成。

## T0 收口条件

自动原页 PNG 环境阻塞已关闭：受限开发终端中的 PowerPoint COM 仍无法接管交互式 Office，因此不作为无头默认路径；已安装的 LibreOffice `soffice.com` 与 `pypdfium2` 可在普通终端自动导出合成三页 fixture 的完整 3/3 原页 PNG。现有 `pdftoppm` 包装器属于 Codex 私有运行时且路径/编码不可靠，已不再被项目使用。

本轮质量门禁已全部通过；按单阶段 STOP 规则，必须等待用户明确确认才可进入阶段 T。

## 后续实施前需要的授权或输入

- DISM 已按用户要求终止；若后续系统安装或 Windows 功能异常，需要先重新检查组件存储状态，但不自动恢复 Docker/WSL 修复。
- PostgreSQL 系统安装和最小 T0 POC 已获授权并完成；不顺带建设完整 API、对象存储或真实产品流程。
- P-01/P-02、DeepSeek V4 Flash Provider 预检、私有 14 页课件的右下角默认位置和自动原页导出均已确认；实质遮挡警告在阶段 T 实现。

## 本轮最终验证范围

- `backend/prepare.py`、`backend/requirements.txt`、`backend/README.md`、专项渲染测试，以及状态、架构、决策和计划文档。
- 不接真实上传、完整 BFF、产品数据库/Worker、对象存储或阶段 T 业务流程。

## 明确不处理

- 不再修复 Docker/WSL，不要求 Redis、BullMQ 或 Docker Compose。
- 不接真实上传、完整 BFF、对象存储、生产认证、生产 LLM/TTS 或正式部署。
- 不修改现有页面业务流程，不大规模重做 UI，不进入阶段 T、阶段 3 或后续阶段。
- 不删除、恢复或覆盖现有工作区改动；不执行 Git commit、push 或系统软件安装，除非用户另行明确授权。

## 本次文档检查

本轮 T0 POC 已运行专项门禁，但不是阶段完成；完整质量门禁仍按本轮文档更新后串行执行。检查包含：

```powershell
git diff --check
rg -n "Docker|Redis|BullMQ|PostgreSQL|Prisma|lease|阶段 T0|阶段 T" AGENTS.md README.md docs
git status --short --untracked-files=all
```

```powershell
npm.cmd run t0:test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

2026-08-03 最终实际通过：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run test`（后端 12/12、Contract 6/6、前端 unit 1/1、component 3/3）、`npm.cmd run build`、`npm.cmd run routes:check`（6 routes）、`python -m pip check`、`python -m unittest backend.tests.test_prepare_rendering -v`（2/2）、`npm.cmd run t0:test`（7/7），强制 rules planner 的自动三页导出（`renderer=libreoffice`、3/3 张 1920×1080 PNG、无 render error），以及用户指定私有课件的自动导出（14/14 张 1920×1080 PNG、无 render error）。两次自动导出均未调用 Provider。私有 14 页课件的默认右下角区域已由用户确认，实质遮挡将在阶段 T 提醒。T0 到此停止，等待确认。
