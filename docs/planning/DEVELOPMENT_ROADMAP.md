# 项目开发执行路线图

> 状态：Active
> 更新日期：2026-08-03
> 适用范围：从当前已提交原型到可控生产版本的完整开发过程
> 详细依据：`docs/IMPLEMENTATION_PLAN.md`、`docs/ARCHITECTURE_DECISIONS.md`

## 1. 当前起点

当前 Git 基线已经完成目录重组、前后端原型、上下文文档和阶段 1A 测试保护提交。
本地 `main` 相对 `origin/main` ahead 10，尚未执行 push。T-A 变更尚未提交；当前代码保留 Mock/CLI 并新增最小真实入口：

- `frontend/`：Next.js 16 + React 19 的完整 Mock 交互原型；没有真实上传、API 或持久化。
- `backend/`：PPTX 解析、人工批准、Edge TTS、Sharp/FFmpeg 合成和基础验证的本地 CLI 原型。
- `packages/contracts/`：阶段 2 已创建，当前提供前端/TypeScript 边界的最小严格 Zod Contract；Python/Node CLI 仍保留内部模型。
- 数据库、任务队列、对象存储和私有 HTTP 应用服务：尚未采用。
- 普通开发终端已可通过标准 `python` 命令调用 Python 3.10.11。Docker engine 不可用且用户已批准停止修复；T0 的 PostgreSQL/Prisma/lease worker、Provider 与自动原页 PNG 门禁均已关闭。用户已确认进入阶段 T，T-A 已建立 Hono/BFF/产品事务入口；私有 14 页课件的前三页 Git 忽略副本已用于业务切片验证。

现阶段不应该重做已有 UI，也不应该直接横向建设完整云基础设施。执行主线是：先建立可复现测试保护，再建立最小共享契约，然后用固定三页课件打通一条真实纵向链路。

## 2. 最终目标

教师可以通过浏览器上传 PPT/PPTX，查看真实原页和结构化讲稿，逐页审核并显式批准；系统以持久、可取消、可恢复的任务生成中文语音、字幕和数字人视频。只有页面覆盖、遮挡、编码、解码、黑帧、静音、时长和哈希等硬门全部通过，结果才可通过受控 HTTP 地址交付。

完成定义以 `docs/PRD.md` 的验收标准为准，而不是以页面存在、FFmpeg 退出码为 0 或本地生成出 MP4 为准。

## 3. 强制执行顺序

```text
阶段 0：仓库与文档基线（已完成）
→ 阶段 1A：可复现环境与测试保护（已完成）
→ 阶段 1B：直接依赖安全收口（已完成，残余 Next high 已接受）
→ 阶段 2：最小共享 Zod Contract（已完成，2026-08-01）
→ 阶段 T0：真实切片进入条件与基础设施 POC（已完成，2026-08-03）
→ 阶段 T：三页真实产品纵向切片
→ 阶段 3～10：在真实切片上补产品差距
→ 阶段 11A～11F：恢复、覆盖面、质量与规模硬化
→ 阶段 12：经确认的生产化部署
```

一次只执行一个阶段或明确子阶段。阶段门禁失败时停止，不在同一轮继续下一阶段。

## 4. 阶段计划

### 阶段 0：仓库与文档基线

状态：已完成。

已经完成：

- 前端移动到 `frontend/`，后端保留在 `backend/`，根目录改为 npm workspaces。
- 后端规划和视频原型、运行说明、详细产品和架构资料均已分组提交。
- 跨会话上下文文档已建立；本地 `main` 当前相对 `origin/main` ahead 10，未执行 push。
- 构建产物、缓存、本地 job、密钥和环境文件未进入 Git。

### 阶段 1A：可复现环境与测试保护

状态：已完成（2026-08-01）。

目标：在改变业务 Contract 或接真实 API 前，建立每个开发窗口都能运行的质量门禁。

实施内容：

1. 明确 Python 3.10+ 的项目运行方式。
   - 项目不能依赖 Codex bundled Python 的绝对路径。
   - 优先安装并使用标准 `python` 命令；若团队要求多平台启动器，再用最小 Node/PowerShell 探测脚本统一调用。
   - `npm.cmd run backend:test` 必须能在普通开发终端直接运行。
2. 按仓库内 Next.js 16 指南引入 Vitest + React Testing Library。
   - 先覆盖一个 API adapter、一个错误/重试组件和一个关键交互组件。
   - 不为了测试重构整套组件，不为 async Server Component 强行写 Vitest；这类行为留给 E2E。
3. 新增无浏览器依赖的 `routes:check`。
   - 使用 Node 标准库启动生产服务并探测 `/`、`/upload`、工作台、解析、生成和结果页。
   - 验证 6 条业务路由返回 HTTP 200，且测试结束后服务进程被回收。
   - Playwright 延后到真实产品流阶段，避免阶段 1 同时引入两套测试基础设施。
4. 固化根命令。
   - `test:unit`：非 watch 模式运行前端单元测试。
   - `test:components`：非 watch 模式运行组件测试；可与同一 Vitest 配置共用。
   - `backend:test`：运行现有和新增 Python 测试。
   - `test`：至少编排后端测试和前端 unit/component 测试，不吞掉任一失败码。
   - `typecheck`、`lint`、`build`、`routes:check` 保持串行独立门禁。

预计涉及：

- 根 `package.json`、`package-lock.json`。
- `frontend/package.json`、Vitest 配置和测试 setup。
- 2～3 个现有组件/API adapter 的测试文件。
- 一个最小路由 smoke 脚本。
- `README.md`、`docs/STATUS.md`、`docs/CURRENT_TASK.md`。

验证：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

通过标准：全部命令退出码为 0；Lint 为 0 warning；路由检查能自行启动和回收服务；不依赖 Codex 私有运行时路径。

### 阶段 1B：直接依赖安全收口

状态：已完成（2026-08-01）；剩余 Next 内嵌依赖 3 项 high 已由用户明确风险接受，进入生产化前必须重新审查。

目标：在测试保护存在后，处理可兼容的直接依赖风险。

实施内容：

- 使用官方 npm registry 重新生成当前 audit 结果，旧的“23 条告警”只作为历史记录。
- 一次只评估并升级一个直接依赖或紧密耦合的一组包，例如 Next.js 与对应 ESLint 配置。
- 每次独立审查 `package-lock.json`、官方变更说明和许可，运行阶段 1A 全部门禁。
- 禁止 `npm audit fix --force`；无法兼容解决的风险记录影响、暴露面和接受人。

通过标准：直接依赖风险逐项有“已修复、不可达、延期并接受”中的明确结论，且没有把多个无关升级混入同一提交。

### 阶段 2：最小共享 Zod Contract

状态：已完成（2026-08-01）；完整阶段门禁完成后停止，等待阶段 T0 进入条件确认。

目标：创建 `packages/contracts/`，让浏览器、BFF、TypeScript Worker 和跨进程 JSON 共用唯一可执行契约。

只实现阶段 T 会真实消费的结构：

- 稳定的 Project、Presentation、Slide、LessonPlanRevision、Scene、Task、TaskStep 和 Asset ID。
- 原页保留模式、最小讲稿、一个受控 Overlay、批准 revision、任务状态和公共资产引用。
- 公共错误响应、输入输出版本和严格 `.strict()` 校验。
- `sourceSlideCoverage` 由批准后的场景重新派生，不能复制旧值。

迁移方式：

- 前端 `frontend/src/types/` 逐步改成从共享包重导出或删除同形状 interface。
- Mock adapter 继续存在，但输入输出必须经过同一 Schema。
- Python 可以保留内部模型；跨进程 JSON 到 TypeScript 边界时必须按 `unknown` 校验。

验证：

```powershell
npm.cmd run test:contracts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

Contract 测试必须拒绝未知字段、非法 ID、陈旧 coverage、漏页、未批准 revision、内部绝对路径和未授权 `FULL_REDESIGN`。

### 阶段 T0：真实切片进入条件与 POC

状态：已完成（2026-08-03）；用户已确认并进入阶段 T。

目标：只关闭三页真实切片的阻断项，不建设完整平台。

必须先确认：

- P-01：已确认首发评测以高等数学优先，Contract 保持通用。
- P-02：已确认首发面向内部单用户，使用仅限本地/测试的固定 principal。
- 可复现服务环境：已批准并用 Windows 原生 PostgreSQL 18.4 + Prisma + PostgreSQL lease worker POC 验证；不依赖 Docker、Redis 或 BullMQ。该证据不等于阶段 T 的产品数据库或 Worker 已实现。
- DeepSeek V4 Flash Provider 预检：本机忽略配置、官方 OpenAI-compatible 地址、模型选择、JSON 结构化输出及超时/连接/限流/5xx 重试分类已于 2026-08-03 验证。完整 Agent 工具调用兼容性仍在阶段 T 验证。
- 阶段 T 业务验证课件：用户指定本机私有 14 页高等数学 PPTX；离线规则解析成功并从交互式桌面 PowerPoint 导出十四张原页 PNG。源文件保留在仓库外，PNG 位于被 Git 忽略的工作目录；两者均不提交 Git。用户确认右下角默认数字人区域；若实质遮挡标题、公式、图表、关键文本或字幕安全区，阶段 T 必须提示用户，不能静默覆盖。受限终端的 PowerPoint COM 不可用；T0 已通过 LibreOffice `soffice.com` + `pypdfium2` 自动导出合成 fixture 的完整 3/3 原页 PNG。既有三页合成 fixture 仅保留为回归测试证据，不代表阶段 T 的私有业务输入。

最小 POC：

1. 选择后端 HTTP 框架，只用一个创建任务和一个查询任务端点证明边界；选择前更新 ADR。
2. 验证 PostgreSQL/Prisma 的事务、幂等键、outbox、向前迁移和必要唯一约束。
3. 验证 PostgreSQL lease worker 的 outbox 重放、重复投递、`FOR UPDATE SKIP LOCKED` 并发领取、lease、心跳、取消、租约接管和 Worker kill；不并行维护 Redis/BullMQ 第二套队列。
4. 验证 LLM Provider 的结构化输出、超时、重试和错误分类；只保留通过的最小编排层。

POC 已通过时记录可重复的专项测试证据；若后续同类 POC 失败，先更新 `docs/ARCHITECTURE_DECISIONS.md` 与本路线图，不静默更换技术。

### 阶段 T：三页真实产品纵向切片

状态：进行中。T-A「真实上传、BFF、Hono 私有服务与产品持久化边界」已实现并通过专项验证；dispatcher/Worker、Agent、批准、媒体和下载闭环尚未完成。

目标：用一条最薄的真实路径证明浏览器、HTTP、持久任务、现有 CLI 能力和受控下载可以组成产品。

真实路径：

```text
浏览器上传三页 PPTX
→ Next.js BFF 校验公共请求
→ 私有后端应用服务重新校验 scope
→ 持久任务快照 + outbox
→ Worker 调用现有 Python/Node 适配器
→ 生成真实原页、最小 Agent 场景和一个 Overlay
→ 用户显式批准 revision
→ Edge TTS、字幕、分页视频与合成
→ 页面覆盖、遮挡和媒体硬门
→ 通过 HTTP 下载 MP4、SRT 和项目元数据包
```

必须验证：

- 同一幂等键/同一 payload 返回同一任务，不同 payload 返回 409。
- parse、Agent、TTS、render 阶段 Worker 被终止后可恢复且不重复登记资产。
- 取消与完成竞态只产生一个合法终态。
- 用户批准后修改讲稿不影响已冻结任务；新任务使用新 revision。
- 3/3 页面完整出现且各不少于 1.5 秒；严重遮挡为 0。
- H.264、AAC、`yuv420p`、测试 FPS、Fast Start、完整解码和时长差都是失败硬门。
- 浏览器响应不含磁盘路径、storage key、密钥或堆栈。
- 关闭真实 adapter 后，Mock 前端和 CLI 仍可运行。

### 阶段 3～10：产品差距增量

这些阶段只能扩展阶段 T 的真实路径，不得重做已有 Mock 页面。

| 阶段 | 目标 | 主要完成标准 |
| --- | --- | --- |
| 3 项目管理 | 搜索、筛选、新建、复制、归档、删除接真实 adapter | 项目状态、错误和 scope 测试通过 |
| 4 上传 | 中文名、100 MiB、MIME/结构、取消、幂等、`.ppt` 明确状态 | 损坏、加密、超限和断网上传有稳定错误 |
| 5 解析 | 真实页数、稳定 slideId、原页缩略图、公式/元素警告 | 刷新可恢复，原页缺失不会静默重排 |
| 6 审核工作台 | revision、锁定、跳过、单页重生成、真实原页/增强预览 | 409 冲突和冻结批准版本测试通过 |
| 7 数字人和声音 | 内置数字人、安全区、音色、语速、字幕、试听 | 拥挤页无严重遮挡，音频可解码 |
| 8 任务页 | 真实进度、取消、恢复、失败步骤重试 | 重挂载不重复创建任务，状态只来自服务端 |
| 9 结果页 | MP4/SRT/项目元数据、验证报告、下载续签 | 跨项目访问拒绝，URL 过期不触发重渲染 |
| 10 产品审查 | 可访问性、响应式、错误状态、性能和回归 | 真实产品流 E2E 通过且无关键可用性缺口 |

### 阶段 11A～11F：流水线硬化

| 子阶段 | 范围 | 门禁 |
| --- | --- | --- |
| 11A 恢复 | outbox、lease、重复投递、取消竞态、孤儿清理 | kill/retry/duplicate 测试无重复任务或资产 |
| 11B PPT 覆盖 | 1/10/50/100 页、`.ppt` 转换、公式与图片公式决策 | 金样差异可解释；P-11 未延期则 OCR 达标 |
| 11C Agent | 六模块单 Agent、Prompt/Schema/model 版本和评测集 | 首次及修复后 Schema 率按真实分母报告 |
| 11D 音频 | TTS Provider、静音/削波/采样率、缓存和时间轴 | 候选音频 100% 可解码，失败不冒充静音成功 |
| 11E 渲染 | Overlay 白名单、避让、分页缓存、25/30 FPS 基准 | 单页修改只改变该页；无旧帧污染；冻结默认 FPS |
| 11F 媒体 | 全解码、覆盖、遮挡、黑帧、响度、哈希、Fast Start | 候选输出全部硬门通过后才能标记完成 |

Remotion、KaTeX、正式 TTS 或对象存储只能在对应 POC 证明现有路径不足后引入。

### 阶段 12：经确认的生产化

进入条件：P-08 部署地区、身份模式、生产 LLM/TTS、存储、数据保留和风险接受人已经确认。

实施内容：

- 正式身份、项目/租户隔离、密钥管理和审计。
- 经阶段 T/11 证明的数据库、队列、对象存储和 Worker 部署。
- 监控、告警、备份、恢复、容量、成本和供应商故障切换。
- 内部 fixture canary、小流量灰度和自动停止条件。
- 向前兼容数据库迁移和应用回滚；不依赖破坏性 down migration。

发布停止条件包括页面覆盖低于 100%、严重遮挡、媒体硬门失败、重复任务/资产、下载越权或未接受的 P0 风险。

## 5. 产品决策截止点

| 决策 | 最晚确认 | 未确认时处理 |
| --- | --- | --- |
| 数学优先范围、首发用户 | 阶段 T 前 | 不进入真实纵向切片 |
| 单视频最大时长 | 11E 性能基准前 | 只声明已测 3/10 页范围 |
| 自定义数字人、额外画幅、背景音乐 | 阶段 7/11E 前 | 不实施，不预建扩展点 |
| L2 数学风险是否强制人工确认 | 11C 前 | L2/L3 均不自动生成最终视频 |
| 部署地区和供应商 | 阶段 12 前 | 保持 Provider-neutral、本地 HTTP 资产 |
| 项目包是否完整离线复现 | 阶段 9/11F 前 | 只交付元数据、讲稿、场景和资产清单 |
| 图片公式 OCR 是否延期 | 11B 前 | 未批准则仍是 Web MVP 必需能力 |

## 6. 提交与验证规则

- 每个阶段独立分支或独立提交组；依赖、Contract、前端功能、后端功能、迁移和文档不混成一个大提交。
- 修改前运行 `git status --short --untracked-files=all`，保留所有既有改动。
- 不提交 `.next/`、`out/`、`backend/work/`、缓存、日志、密钥、真实课件或本地环境文件。
- 每个阶段先更新 `docs/STATUS.md` 和 `docs/CURRENT_TASK.md`，再串行运行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

- 阶段专用的 Contract、golden、integration、media 和 E2E 命令必须追加运行。
- 没有明确用户授权时不得 commit、push、安装系统软件、绑定云供应商或扩大阶段范围。

## 7. 永久 STOP 条件

- 工作区存在来源不明或与当前阶段重叠的改动。
- 当前阶段任一必需命令缺失或失败。
- 原页优先、显式人工批准、稳定 revision、资产授权或最终验证硬门被绕过。
- 需要的产品决策、合法凭据、素材许可或供应商条款未确认。
- 候选数据库、队列、渲染器或 Provider POC 失败，却没有先更新 ADR 和计划。
- 计划要求进入下一阶段，但当前阶段完成标准没有证据。

## 8. 下一项可执行任务

阶段 T-A 完整门禁通过并得到用户确认后，下一项只可执行 T-B：消费产品 outbox，建立 PARSE dispatcher/lease Worker、attempt 隔离、3/3 原页资产登记、真实进度和失败恢复。不得在同一子阶段顺带进入 Agent、批准、TTS、渲染或下载。
