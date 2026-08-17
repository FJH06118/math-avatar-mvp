# Windows 本地数字人课件视频软件实施计划

> 计划状态：PROPOSED，尚未开始实现。  
> 制定日期：2026-08-14。  
> 目标版本：Windows 10/11 x64 本地单机版 v1。  
> 执行前提：必须由用户明确批准开始实施；本计划不解除 CURRENT_TASK 中现有的唇形 L5 FAIL / L6 STOP，也不授权继续五档嘴型或制作其他教师素材。

## 1. Context

### 1.1 目标

把现有仓库封装成普通用户可安装的软件，使用户能够：

1. 在首次启动时配置自己的大模型 API。
2. 上传 PPTX 课件。
3. 自动解析原始课件并生成中文教学讲稿。
4. 审核、修改并明确批准讲稿。
5. 使用固定内置数字人和 Edge TTS 生成视频。
6. 在中断、关闭窗口或网络短暂失败后恢复任务。
7. 导出经过验证的 MP4、SRT 和生成元数据。

所有课件、讲稿、任务记录和媒体默认留在本机；只有大模型 API 与 Edge TTS 调用需要联网。

### 1.2 审阅范围

本计划基于截至 2026-08-14 的仓库事实：

- 已盘点全部 339 个第一方文件，并逐项覆盖 docs、frontend、backend、packages/contracts、Prisma migrations、测试、脚本、配置和资产清单。
- node_modules、构建缓存、工作目录产物和 Git 内部文件不作为产品源码逐行审阅。
- 二进制图片、音频和视频按文件清单、尺寸、格式、哈希或现有机器验收报告核对。
- 代码是事实来源；发现文档与代码不一致时，本计划按代码现状列出缺口，不沿用过期描述。

### 1.3 当前已经具备的基础

- Next.js 16 / React 19 前端已经覆盖项目、上传、解析、讲稿审核、生成进度和结果页面。
- packages/contracts 已用严格 Zod schema 建立跨端契约。
- Hono 私有应用已具备项目、上传、解析、计划、音频、页面渲染、合成、验证和受控下载 API。
- PostgreSQL / Prisma 已保存项目、不可变修订、任务、步骤、尝试、音频、字幕、页面渲染、最终媒体、验证报告和 outbox。
- Worker 已具备持久租约、心跳、取消、重试、幂等恢复和阶段派发。
- PPTX 解析会优先使用 LibreOffice，必要时使用 PowerPoint COM，并要求完整保留 1920×1080 原页。
- Edge TTS、Sharp、FFmpeg 和 ffprobe 已接入真实媒体链路。
- 三页真实纵切已经生成并验证 MP4、SRT 和元数据。

因此，v1 应复用现有 Stage T 真实链路，不应围绕旧的独立 JSON CLI 重新开发另一套产品后端。

### 1.4 当前不能直接作为软件发布的缺口

| 缺口 | 当前事实 | 发布影响 |
| --- | --- | --- |
| 默认仍是 Mock | 只有显式 stage-t 环境变量才进入真实适配器 | 普通安装后不会自然进入真实生产链 |
| 没有软件设置中心 | LLM 地址、密钥和模型只从环境变量读取 | 用户无法自行安全配置 API |
| Provider 过于单一 | 只有 OpenAI-compatible chat/completions 形态 | 不能分别正确处理 OpenAI、DeepSeek、GLM、Kimi 和 Claude |
| 密钥没有桌面安全存储 | Prisma 中也没有 Credential/Profile 模型 | 不能把 API Key 明文写入数据库、配置或日志 |
| 浏览器负责串联任务 | AUDIO、PAGE_RENDER、COMPOSITE/VALIDATE 由页面逐段创建 | 页面关闭或阶段交界崩溃时，整条工作流不够可靠 |
| 生产设置与 UI 不一致 | UI 展示多教师、左右站位、背景和字幕开关，渲染器实际多处固定 | 会向用户展示不真正影响输出的控件 |
| 没有一键运行宿主 | 现有启动器只启动前端，且要求用户已安装 Node/npm | 无法满足开箱即用 |
| 依赖较多 | Node、Python、PostgreSQL、LibreOffice、FFmpeg 均需外部环境 | 安装、版本和路径不可控 |
| 容量证据不足 | 解析测到 100 页，完整视频仅测到 3 页 | 不能对外承诺 50 页稳定生成 |
| 教学质量证据不足 | 现有 Agent 评测只有 4 个样本，首次通过约 50% | 必须保留人工审核，不可全自动发布 |
| 数字人口型未达高质量 | 五档局部嘴型已被用户否决，生产回退为开/闭口两态 | 发布前仍需整段播放人工验收，不能用静态帧代替 |
| 缺少安装生命周期 | 没有升级、回滚、备份、卸载保留数据、诊断导出 | 软件升级可能破坏用户数据或难以排错 |

## 2. 用户已确认的产品边界

| 决策 | v1 结论 |
| --- | --- |
| 交付形态 | Windows 10/11 本地单机软件 |
| 数据位置 | 课件、讲稿、任务和媒体均默认留在本机 |
| 联网范围 | 仅大模型 API 和 Edge TTS 调用需要联网 |
| 大模型 | OpenAI、DeepSeek、智谱 GLM、Kimi、Anthropic Claude |
| Claude 接入 | Anthropic 官方 API，不依赖 Claude Code CLI 或登录态 |
| 语音 | v1 使用 Edge TTS；建立 TTS Provider 接口但不接多家正式 TTS |
| 审核门 | 正式生成视频前必须由用户明确审核并批准讲稿 |
| 数字人 | 只提供一个经过验证的内置数字人，不支持用户上传或训练 |
| 安装体验 | 一键安装，不要求用户另装 Node、Python、PostgreSQL、LibreOffice 或 FFmpeg |
| 正式容量 | 单个 PPTX 不超过 100 MB、50 页，预计成片不超过 60 分钟 |
| v1 输出 | MP4、SRT、生成元数据和本机项目历史 |
| 明确裁剪 | 不做自定义数字人、多人协作、云同步、移动端、模板市场、BGM、片头片尾、直播和多家正式 TTS |

## 3. 目标用户流程

### 3.1 首次启动

1. 安装器完成文件安装后启动 Desktop Host。
2. Desktop Host 检查可写数据目录、可用磁盘、PostgreSQL、LibreOffice、Python、FFmpeg/ffprobe 和本机端口。
3. 首次初始化本地数据库并运行向前 migration。
4. 进入设置向导，用户选择大模型厂商，填写 API Key、模型和可编辑的服务地址。
5. 软件执行最小连接测试和严格 JSON 能力测试；成功后只显示密钥尾号。
6. Edge TTS 执行短试听探针；失败时允许保存大模型配置，但阻止开始视频生成。

### 3.2 日常生成

1. 用户新建项目并上传 PPTX。
2. 服务端创建持久 PARSE task，完整导出和核对所有原始页面。
3. 用户核对解析页并创建 PLAN task。
4. Provider Gateway 使用选定配置生成严格讲稿；所有外部 payload 先按 unknown 验证。
5. 用户逐页检查、修改并明确批准所有讲稿；未批准页面阻止进入生成。
6. 用户选择 Edge 音色和语速，固定数字人使用唯一真实生产配置。
7. 服务端创建一个持久 WorkflowRun，依次推进 AUDIO、PAGE_RENDER、COMPOSITE、VALIDATE。
8. 用户可关闭窗口；有活动任务时，关闭动作默认提示“后台继续”或“安全退出”。后台继续时最小化到托盘。
9. 重新打开软件后按 WorkflowRun 恢复进度，不重复创建已成功阶段。
10. VALIDATE 通过后才显示完成，并提供 MP4、SRT、元数据下载及“打开项目目录”。

### 3.3 应用级状态

- SETUP_REQUIRED：尚未完成依赖或 Provider 配置。
- READY：所有本地组件健康，可创建任务。
- DEGRADED：项目可浏览，但某个联网 Provider 或媒体组件不可用。
- RECOVERING：正在恢复数据库、过期租约或未完成任务。
- FATAL：数据库损坏、migration 失败或核心运行时缺失；禁止继续写入并提供诊断导出。

## 4. 目标架构

### 4.1 进程与边界

Windows 安装包

- Electron Desktop Host
  - 单实例锁、窗口、托盘、生命周期、运行时监督
  - safeStorage / Windows DPAPI 密钥代理
  - 随机内部令牌、随机本机端口和组件健康汇总
- Next.js standalone
  - 渲染本地 UI
  - 保留现有 BFF Route Handlers
  - 生产构建只使用真实 API adapter
- Hono private app
  - 产品 API、鉴权、严格契约和受控媒体读取
- Durable Worker
  - PARSE、PLAN、AUDIO、PAGE_RENDER、COMPOSITE、VALIDATE
  - Provider Gateway、Edge TTS、LibreOffice、Sharp、FFmpeg
- Portable PostgreSQL
  - 项目、修订、工作流、任务、outbox 和媒体元数据
- Local asset store
  - 原课件、原页、音频、字幕、分页视频、最终媒体和验证报告

外部网络只允许从 Provider Gateway 或 Edge TTS adapter 发出。浏览器渲染进程不得直接访问密钥、数据库、文件系统、PPT、LLM、TTS、FFmpeg 或 Worker。

### 4.2 为什么采用 Electron，而不是重写为 Tauri 或纯静态网页

- 当前 Next.js 使用 BFF Route Handlers，静态导出会丢失必要的服务端能力。
- Electron 可同时提供原生安装、单实例、托盘、窗口、进程监督和 Windows DPAPI 密钥能力。
- Tauri 虽然壳更小，但仍要捆绑并管理 Node、Python、PostgreSQL、LibreOffice 和 FFmpeg，无法显著消除本项目主要体积与复杂度。
- v1 使用 Next.js standalone 输出，避免重写现有页面和 BFF。

### 4.3 数据目录

程序文件与用户数据必须分离：

- 安装目录：只读程序、内置资产和版本化运行时。
- %LOCALAPPDATA%\PPTDigitalHuman\data\db：PostgreSQL cluster。
- %LOCALAPPDATA%\PPTDigitalHuman\data\projects：课件和派生媒体。
- %LOCALAPPDATA%\PPTDigitalHuman\secrets：safeStorage 加密后的密钥 blob。
- %LOCALAPPDATA%\PPTDigitalHuman\logs：滚动日志，默认不记录课件正文或 API payload。
- %LOCALAPPDATA%\PPTDigitalHuman\backups：升级前数据库与配置备份。
- %LOCALAPPDATA%\PPTDigitalHuman\runtime：端口、PID、健康状态和锁文件；异常退出后可重建。

路径必须支持中文、空格和长路径；禁止把绝对磁盘路径返回给浏览器。

### 4.4 PostgreSQL 决策

v1 继续使用 PostgreSQL，不切换 SQLite：

- 当前租约、SKIP LOCKED、outbox、部分索引和任务恢复已经在 PostgreSQL 上验证。
- 换成 SQLite 会重写最关键的任务并发与恢复语义，风险高于捆绑 PostgreSQL。
- Desktop Host 将 PostgreSQL 作为当前用户下的受管子进程，而不是要求用户安装系统服务。
- 首次启动使用 initdb 创建独立 data area；只监听 127.0.0.1 和随机空闲端口。
- 数据库密码随机生成并由 safeStorage 保护；升级前必须备份，migration 失败必须停止并回滚程序版本，不得继续写入。

## 5. API Provider 与密钥设计

### 5.1 Provider 领域模型

packages/contracts 新增严格契约：

- ProviderKind：OPENAI、DEEPSEEK、GLM、KIMI、ANTHROPIC。
- ProviderProtocol：OPENAI_CHAT、ANTHROPIC_MESSAGES。
- ProviderProfile：稳定 ID、显示名、厂商、协议、base URL、model、启用状态、默认状态、能力、版本、最近测试时间和密钥尾号。
- ProviderTestRequest / ProviderTestResult：只返回稳定错误码、延迟、模型和能力，不回显密钥或原始上游响应。
- ProviderSelectionSnapshot：任务冻结厂商、协议、base URL、model、profileVersion 和提示词版本，不包含 API Key。
- TtsProviderKind：EDGE，以及保留的 EXTERNAL_API；v1 只允许 EDGE 进入正式任务。

Prisma 只保存非秘密字段和 credentialRef。API Key 的完整值只存在于 Electron safeStorage 加密文件和执行进程短时内存中。

### 5.2 密钥流

1. BrowserWindow 通过同源设置表单提交密钥。
2. Next BFF 验证请求并转发到 Hono；任何日志中间件必须先对 apiKey 字段脱敏。
3. Hono 通过父子进程 IPC 请求 Desktop Host 保存密钥。
4. Desktop Host 使用 safeStorage 异步 API 加密并原子写入本地 secret blob。
5. Provider Worker 根据 credentialRef 通过认证 IPC 获取短时明文；任务结束后释放引用。
6. 查询设置只返回 configured=true 和最后四位，不提供“查看完整密钥”接口。
7. 修改或删除配置使 profileVersion 增加；已经运行的任务继续使用被冻结的非秘密配置和当时的 credentialRef。

硬性规则：

- 不把 Key 写入 .env、Prisma、任务 payload、错误详情、URL、崩溃报告或诊断包。
- 不把完整上游响应透传到浏览器。
- 401/403 视为配置错误且不可自动无限重试；429、超时和 5xx 按 Retry-After 和有上限退避重试。
- 设置连接测试使用最小请求，不能上传课件内容。

### 5.3 Adapter 结构

建立统一 AgentProvider 接口，输入为内部教学规划请求，输出为 unknown：

- OpenAIAdapter：OpenAI 官方 API。
- DeepSeekAdapter：OpenAI Chat 兼容协议和 DeepSeek 特有错误/思考字段归一化。
- GlmAdapter：OpenAI Chat 兼容协议和智谱预设。
- KimiAdapter：OpenAI Chat 兼容协议和 Kimi 预设。
- AnthropicAdapter：Anthropic Messages API，不模拟 Claude Code CLI。

不要把当前模型名写死在业务代码中：

- Provider 预设给出可更新的默认 base URL。
- 支持在厂商提供模型列表时刷新列表。
- 始终允许用户手动填写模型 ID。
- 数据库记录实际模型 ID 和 Provider adapter 版本，以便重现。

结构化输出按能力降级：

1. 优先使用厂商支持的严格 JSON Schema。
2. 其次使用 JSON object 模式。
3. 最后使用纯文本 JSON 指令、提取和一次受控 repair。
4. 无论哪种方式，最终都必须通过现有 LessonPlan Zod schema；第二次仍失败则任务失败并给出可操作错误。

### 5.4 Edge TTS 与未来 TTS

- 把现有 Edge 实现迁入 TtsProvider 接口，不改变已验证的解码、时长、非静音和 timing 校验。
- v1 设置页只显示 Edge 音色、语速、试听和联网状态。
- 数据模型和接口预留 EXTERNAL_API，但不显示未实现的 Provider 选项。
- Edge 上游不可用时任务进入可重试失败，绝不生成静音或伪音频。
- UI 明确告知 Edge TTS 是联网能力，不能承诺离线生成或企业 SLA。

## 6. 持久工作流设计

### 6.1 问题

当前生成页在浏览器中依次创建 AUDIO、PAGE_RENDER、COMPOSITE/VALIDATE。即使各个任务本身持久，阶段间推进仍依赖页面存活。

### 6.2 目标

新增 WorkflowRun 作为“从已批准讲稿到最终验证媒体”的唯一根任务：

- id、projectId、principalId、status、currentStage、progress。
- approvedLessonPlanRevisionSetHash。
- projectSettingsRevision、ProviderSelectionSnapshot、TtsSelectionSnapshot。
- audioTaskId、renderTaskId、compositeTaskId、validateTaskId。
- cancelRequestedAt、attempt、lastErrorCode、createdAt、updatedAt、completedAt。
- version 和 idempotencyKey。

Workflow Orchestrator 通过 outbox 推进：

1. 校验所有页面已批准且设置可冻结。
2. 创建或复用 AUDIO task。
3. AUDIO 成功后创建或复用 PAGE_RENDER task。
4. PAGE_RENDER 成功后创建或复用 COMPOSITE task。
5. COMPOSITE 成功后创建或复用 VALIDATE task。
6. VALIDATE 成功后才把 WorkflowRun 标记 COMPLETED。

浏览器只创建一次 WorkflowRun 并轮询一个公共投影。关闭、刷新、重启和阶段重试都不再依赖浏览器创建下一阶段。

### 6.3 取消、重试与恢复

- 取消根工作流会标记当前和未开始的子任务；正在执行的 FFmpeg、LibreOffice、TTS 子进程必须收到终止信号并清理临时文件。
- 重试从第一个失败或缺失阶段继续，已经通过内容哈希校验的产物直接复用。
- 应用异常退出后，启动恢复先派发未投递 outbox，再回收过期租约。
- 每个阶段写入原子临时文件，验证大小和 SHA-256 后再改名为最终资产。
- 磁盘不足、数据库不可用或资产完整性失败时进入稳定失败状态，不能标记完成。

## 7. UI 收敛

### 7.1 新增页面

- 首次启动向导：环境检查、数据目录、Provider 配置、Edge 试听。
- 设置页：Provider profiles、默认模型、连接状态、密钥轮换、Edge 音色、数据目录只读展示、诊断导出。
- 应用健康面板：数据库、Worker、LibreOffice、FFmpeg、Edge 和当前 Provider。

### 7.2 修正现有页面

- 生产构建默认 real adapter；Mock 只允许 test/development build，生产启动发现 Mock 必须失败。
- 上传页保持 PPTX、100 MB、损坏/加密/伪装格式和取消边界。
- 解析页继续完整展示原始页面，任何漏页硬阻断。
- 工作台取消“点击生成时自动批准全部待审修订”；必须提供清晰的逐页状态、批量审核和最终确认。
- 至少支持 displayText 与 spokenText 分离，避免公式展示文本直接被 TTS 错读。
- 公式、低置信度解析和 Provider repair 页面标记为高风险，用户必须逐项确认。
- 生成页只展示一个 WorkflowRun，支持后台继续、取消、失败重试和恢复说明。
- 结果页继续提供受控播放和 MP4、SRT、元数据下载。

### 7.3 删除或隐藏无效控件

v1 只展示真正影响最终媒体的配置：

- 保留唯一内置周老师。
- 保留 Edge 音色和语速。
- 字幕固定生成并烧录，同时导出 SRT。
- 数字人固定使用生产验证的位置和安全区。
- 隐藏尚未接通最终渲染的其他教师、全局左右站位、背景主题和字幕开关/样式。

若未来重新显示这些控件，必须先有后端契约、冻结快照、渲染实现和真实媒体测试，不能只改预览。

## 8. 桌面宿主与运行时

### 8.1 Desktop Host 职责

- 获取单实例锁并处理第二次启动。
- 创建随机内部 token 和本机端口，不使用固定生产密钥。
- 初始化目录、密钥存储、PostgreSQL、migration 和运行时 manifest。
- 以受控子进程启动 Next standalone、Hono 和 Worker。
- 分别等待 health/readiness；只有全部可用后才打开 BrowserWindow。
- 对意外退出实施有限次数重启；重启风暴进入 FATAL。
- 活动任务存在时，关闭窗口默认询问后台继续或安全退出。
- 正常退出时停止接单、等待短暂安全点、终止子进程并保存恢复状态。
- 提供脱敏诊断包，不自动上传遥测或用户课件。

### 8.2 Electron 安全基线

- BrowserWindow 只加载本机受信任的 Next 页面。
- nodeIntegration=false、contextIsolation=true、sandbox=true。
- 限制导航、新窗口、权限请求和外部链接。
- 设置严格 CSP；拒绝任意远程脚本。
- Preload 只暴露最小窗口/更新/文件夹选择能力，每条 IPC 验证 sender 和 schema。
- Hono、Next 和 PostgreSQL 只绑定 127.0.0.1。
- BFF 到 Hono 每次携带随机内部 token 和固定本地 principal；外部请求不能绕过 BFF。
- 媒体读取继续使用受控引用、Range、ETag、大小和 SHA 校验。

### 8.3 捆绑组件

离线安装包至少包含：

- Electron 与应用代码。
- Next.js standalone 产物及其静态/public 文件。
- 与构建版本匹配的 Node runtime。
- Windows embedded Python 和锁定依赖。
- PostgreSQL runtime。
- LibreOffice headless runtime。
- FFmpeg、ffprobe、Sharp 需要的 native binary。
- Edge TTS 依赖、固定内置数字人资产和获得再分发许可的中文字体。

构建必须生成 runtime-manifest.json，记录每个组件的版本、平台、SHA-256、许可证和来源。启动时只对关键文件做快速完整性检查，诊断模式可执行全量检查。

## 9. 安装、升级与卸载

### 9.1 安装包

- 使用 electron-builder 生成 Windows x64 NSIS 离线安装包。
- 默认按当前用户安装，普通用户不需要管理员权限。
- 安装过程中不联网下载运行时，避免半安装状态。
- 安装后创建开始菜单和桌面入口，并可选择立即启动。
- 正式公开发布前必须完成代码签名；没有签名证书时只能作为内部或封闭测试版。

### 9.2 升级

v1 先支持签名安装包原地升级，不把自动更新作为首发范围：

1. 关闭接单并等待当前写入安全点。
2. 备份数据库、非秘密设置和 migration 版本。
3. 安装新程序到版本化目录。
4. 启动新版本并运行向前 migration。
5. 健康检查失败则恢复旧程序和数据库备份。
6. 成功后保留最近两份可恢复备份，并按容量策略清理。

### 9.3 卸载

- 默认仅删除程序文件，保留用户项目、数据库、密钥和备份。
- 用户显式选择“同时删除全部本地数据”时，展示准确目录和不可恢复警告后再执行。
- 卸载前终止受管进程并确认目标目录位于应用自己的 LocalAppData 根下。

## 10. 分阶段实施顺序

所有阶段严格串行。每阶段先更新 CURRENT_TASK，只做该阶段；命中 STOP 后不得继续。

### P0：冻结发布基线与文档真相

目标：

- 把本计划批准状态写入 DECISIONS、STATUS 和 CURRENT_TASK。
- 明确生产口型仍是 legacy-binary-v1，两态方案不冒充自然唇形。
- 把 Stage T 真实纵切设为唯一产品后端；旧 CLI 仅保留诊断/批处理用途。
- 列出所有 UI 与渲染不一致项，并冻结 v1 可见设置。

主要文件：

- docs/CURRENT_TASK.md
- docs/STATUS.md
- docs/DECISIONS.md
- docs/ARCHITECTURE.md
- docs/PRD.md
- docs/planning/DEVELOPMENT_ROADMAP.md

验收：

- 文档不再同时声称“尚未接通”和“已有真实纵切”。
- 下一阶段只有 P1，不夹带 Provider、UI 或安装器实现。

STOP：

- 当前工作树中未归属的修改无法安全区分或合并。
- 用户未明确批准从规划进入实施。

### P1：桌面运行时可行性纵切

状态（2026-08-17）：本机实现与专项纵切完成，结论 `PASS_WITH_EVIDENCE_GAPS`。普通用户中文/空格路径下的 PostgreSQL、Prisma migration、Hono、Worker、Next standalone、safeStorage 与无残留停止均通过，未命中本节 STOP。尚缺干净 Windows 10/11 VM、完整离线 runtime staging、正式 migration 制品、Electron 单入口完整 staged 验证、宿主硬崩溃与升级回滚证据；不得据此进入安装或发布结论。

目标：

- 新建最小 desktop workspace。
- 验证 Electron 可启动 Next standalone、Hono、Worker 和受管 PostgreSQL。
- 在无全局 Node/Python/PostgreSQL 的 Windows VM 中完成 health check。
- 验证 safeStorage 加密/解密、父子进程 IPC 和中文数据路径。

计划新增：

- desktop/package.json
- desktop/tsconfig.json
- desktop/src/main.ts
- desktop/src/preload.ts
- desktop/src/supervisor.ts
- desktop/src/runtime-manifest.ts
- desktop/src/secret-broker.ts
- desktop/test/
- scripts/build-runtime-manifest.mjs

计划修改：

- package.json
- package-lock.json
- frontend/next.config.ts
- backend/app/server.ts
- backend/app/worker.ts
- backend/app/config.ts

验收：

- 单一 exe 启动入口可自动拉起全部核心进程并打开页面。
- 关闭后不残留 PostgreSQL、Next、Hono 或 Worker 进程。
- 进程崩溃能进入可解释状态，不产生无限重启。

STOP：

- 无法在标准用户权限下可靠初始化 PostgreSQL。
- Next standalone 丢失 monorepo contracts、public、Sharp 或 BFF 依赖。
- safeStorage 在目标 Windows 版本不可用。
- LibreOffice、FFmpeg、字体或其他运行时再分发许可未确认。

### P2：设置、Provider Profile 与安全密钥

目标：

- 建立跨端严格设置契约、非秘密数据库模型和 DPAPI 密钥保存。
- 提供创建、更新、删除、设默认和连接测试 API。
- 所有公开响应和日志完成密钥脱敏。

计划新增：

- packages/contracts/src/provider.ts
- packages/contracts/src/provider.test.ts
- packages/contracts/src/application-settings.ts
- packages/contracts/src/application-settings.test.ts
- backend/app/provider-repository.ts
- backend/app/provider-service.ts
- backend/app/provider-routes.ts
- backend/app/secret-client.ts
- backend/prisma/migrations/<timestamp>_provider_profiles/migration.sql

计划修改：

- packages/contracts/src/index.ts
- backend/prisma/schema.prisma
- backend/app/app.ts
- backend/app/config.ts
- backend/app/worker-error.ts
- frontend/lib/api/
- frontend/app/api/

验收：

- 数据库、API 响应、日志和诊断包搜索不到测试 API Key。
- 乐观版本冲突、跨 principal 404、未知字段、非法 URL 和删除默认 Profile 均有稳定测试。
- Key 轮换后新任务使用新版本，旧任务快照仍可审计。

STOP：

- 任一完整 Key 出现在持久化数据库、日志或浏览器查询响应中。
- 设置保存成功但 safeStorage 写入失败或无法原子恢复。

### P3：五家 LLM Provider Gateway

目标：

- 把现有 agent HTTP 调用重构为统一 Provider Gateway。
- 实现 OpenAI、DeepSeek、GLM、Kimi 和 Anthropic adapter。
- 保持严格 LessonPlan 校验、一次 repair、稳定错误分类和任务重试语义。

计划新增：

- backend/app/providers/provider.ts
- backend/app/providers/openai.ts
- backend/app/providers/deepseek.ts
- backend/app/providers/glm.ts
- backend/app/providers/kimi.ts
- backend/app/providers/anthropic.ts
- backend/app/providers/structured-output.ts
- backend/app/providers/errors.ts
- backend/app/providers/*.test.ts
- backend/evals/provider-fixtures/

计划修改：

- backend/app/agent-adapter.ts
- backend/app/plan-worker.ts
- backend/app/config.ts
- backend/app/agent-eval.test.ts
- backend/package.json
- backend/README.md

验收：

- 每家 adapter 使用本地 HTTP fixture 覆盖成功、401、403、429、5xx、超时、截断 JSON、非法 schema 和 repair。
- 每家提供 opt-in 真实 API smoke test；CI 不要求真实 Key。
- 至少建立 100 个代表性 slide-level 教学样本，覆盖高数公式、中文长文本、图片页、图表页和低置信度解析。
- 首次严格通过率达到 PRD 的 90%，一次 repair 后达到 99%；达不到则不得把对应 Provider 标记为正式支持。
- 模型 ID 来自可更新预设、模型查询或手工输入，不依赖编译时硬编码的“最新模型”。

STOP：

- Provider 只能返回看似 JSON 但无法稳定通过共享契约。
- 错误分类导致认证失败无限重试，或把模型原始响应暴露到 UI。
- 任何一个声称“正式支持”的厂商未通过自己的 fixture 与真实 opt-in smoke。

### P4：讲稿审核与真实设置收敛

目标：

- 把人工审核从隐含步骤变成硬门。
- 完成 displayText / spokenText 的最小生产闭环。
- 只保留最终渲染真正支持的数字人、音色和字幕设置。

计划修改：

- packages/contracts/src/lesson-plan.ts
- packages/contracts/src/workspace.ts
- backend/app/lesson-repository.ts
- backend/app/lesson-worker.ts
- backend/app/audio-worker.ts
- frontend/components/workspace/
- frontend/lib/api/
- frontend/app/projects/[projectId]/workspace/

验收：

- 存在任一待审、冲突、低置信度或高风险公式页面时，创建视频工作流返回稳定阻断。
- “生成视频”不能暗中批准讲稿。
- 用户能分别修改显示文本和朗读文本，并试听最终 Edge 发音。
- UI 只显示周老师、实际 Edge 音色和语速；隐藏的设置不会残留为误导性项目配置。

STOP：

- 公式朗读不能由用户修正。
- 预览配置与冻结到任务的配置不一致。
- 任何未批准 revision 可进入 AUDIO。

### P5：服务端根工作流

目标：

- 新增 WorkflowRun 契约、数据库模型、repository、orchestrator 和公共投影。
- 把生成页的客户端阶段串联删除。

计划新增：

- packages/contracts/src/workflow.ts
- packages/contracts/src/workflow.test.ts
- backend/app/workflow-repository.ts
- backend/app/workflow-orchestrator.ts
- backend/app/workflow-worker.ts
- backend/app/workflow.integration.test.ts
- backend/prisma/migrations/<timestamp>_workflow_runs/migration.sql

计划修改：

- backend/prisma/schema.prisma
- backend/app/app.ts
- backend/app/dispatcher.ts
- backend/app/worker.ts
- frontend/lib/api/
- frontend/app/api/
- frontend/components/generation/

验收：

- 浏览器关闭在任意阶段边界都不会阻止下一阶段由服务端推进。
- 同一幂等键不会生成重复音频、分页视频或最终媒体。
- 取消、重试、过期租约恢复和应用重启均有 PostgreSQL integration test。
- 最终验证失败时 WorkflowRun 不得显示完成。

STOP：

- 仍存在只有浏览器能创建的下一阶段。
- 崩溃恢复会重复扣费调用 LLM/TTS，或产生两份最终媒体记录。
- 根取消无法停止正在运行的外部子进程。

当前代码收口记录（2026-08-17）：`WorkflowRun` Contract、Prisma 表、repository、orchestrator、workflow worker、Hono/BFF 端点和真实生成页接线已实现；PostgreSQL workflow integration 3/3 通过。实际 Windows 宿主重启、外部子进程硬崩溃回收、clean VM、离线 staging、正式 migration runtime 和升级回滚仍未取得证据，不能写成 P5 的完整外部验收通过。

### P6：首次启动、设置页和生产模式

目标：

- 完成首次启动向导、设置页、健康面板和诊断导出。
- 让安装构建默认真实模式，Mock 永远不能进入发布包。
- 将 BrowserWindow、托盘和后台任务状态接入真实工作流。

计划新增：

- frontend/app/setup/page.tsx
- frontend/app/settings/page.tsx
- frontend/components/settings/
- frontend/components/runtime-health/
- frontend/lib/api/provider-client.ts
- frontend/lib/api/runtime-client.ts
- packages/contracts/src/runtime-health.ts

计划修改：

- frontend/lib/api/index.ts
- frontend/lib/api/real-client.ts
- frontend/lib/api/mock-client.ts
- frontend/app/layout.tsx
- frontend/components/generation/
- desktop/src/main.ts
- desktop/src/preload.ts

验收：

- 无 Provider 时不能上传后误入无法完成的流程。
- 连接测试、密钥轮换、Edge 试听、磁盘告警和组件故障都有可操作中文提示。
- 发布包中设置错误的 Mock 模式会在启动检查直接失败。
- 键盘、焦点、错误恢复、长中文路径和 125%/150% 缩放通过桌面实机测试。

STOP：

- Renderer 能直接调用 Node、读取密钥或任意打开本地文件。
- 页面展示的设置仍与最终媒体不一致。

当前代码收口记录（2026-08-17）：首次启动向导、设置页、Provider 密钥轮换/配置级连接测试、生产上传 Provider 门禁、runtime health/diagnostic strict Contract、健康面板和脱敏 JSON 导出已实现；网页生产 adapter 默认真实模式，打包 Electron 启动拒绝 Mock/stage-t/非法模式。桌面 preload 只暴露公开快照、一次显式 retry 和严格脱敏 Workflow 状态，主进程增加托盘、磁盘告警与后台工作流状态。共享 Contract 48/48、前端 unit 13/13、component 17/17、routes 6/6、完整 backend integration 38 pass/1 个外部 Edge TTS opt-in skip，桌面 27 pass/2 个按环境跳过，0 fail；网页和桌面 typecheck、lint、build，以及 Python backend:test 13/13 均通过。clean Windows 10/11、真实 Provider/Edge TTS、125%/150% 缩放和键盘焦点、完整离线 staging、安装包、硬崩溃回收及升级回滚仍未取得证据，因此 P6 结论为 `PASS_WITH_EVIDENCE_GAPS`，状态为 `EXTERNAL_VALIDATION_PENDING`。

### P7：完整离线安装包与升级链路

目标：

- 构建可在干净 Windows 机器安装的 x64 NSIS 包。
- 捆绑所有运行时，完成版本清单、许可证、升级备份和卸载保留数据。

计划新增：

- desktop/electron-builder.yml
- desktop/build/installer.nsh
- scripts/build-desktop-bundle.mjs
- scripts/verify-desktop-bundle.mjs
- scripts/smoke-installed-app.ps1
- docs/operations/WINDOWS_INSTALLATION.md
- docs/operations/DATA_BACKUP_AND_RECOVERY.md
- THIRD_PARTY_NOTICES.md

计划修改：

- package.json
- package-lock.json
- .gitignore
- README.md
- backend/README.md

验收：

- 干净 VM 无 Node、Python、PostgreSQL、LibreOffice 和 FFmpeg 也能安装、启动和生成样例。
- 安装包离线完成安装；应用仅在 API/TTS 阶段联网。
- 覆盖安装、原地升级、migration 失败回滚和卸载保留/删除数据。
- runtime manifest 中的文件和许可证完整，关键 binary 哈希正确。

STOP：

- 公开发布缺少代码签名。
- 任何捆绑组件许可证或再分发条件不清楚。
- 升级失败会破坏唯一数据库或项目文件。
- 卸载可能越过应用数据根目录删除文件。

当前代码收口记录（2026-08-17）：已完成 x64 NSIS 离线候选、`runtime-manifest` v2、bundle 构建/校验、Prisma migration runtime entry、迁移前 PostgreSQL 备份、卸载保留/删除数据脚本、第三方 notices、安装后启动 smoke 和 bundle 完整启动 smoke。最终本机 bundle `p7-065a181e095d` 包含 15 个组件、85,246 个文件、7 条许可证记录；manifest/hash/size/license 校验通过。最终未签名 NSIS 候选 `math-avatar-desktop-0.1.0-win-x64-unsigned.exe` 大小为 1,008,956,662 bytes，SHA-256 为 `54824DC998A18F59489DE89C21EFDDCC77561F0A85E1A1F3CCB406C198BCF0C3`。PostgreSQL/Prisma migration smoke、真实 `RuntimeBootstrap` 四服务 READY/STOPPED、3 轮 soak、隔离 stale marker recovery 和最终解包 app smoke 均通过；smoke 观察到 3 个 loopback listener，强杀后 1 个 fork child 被精确清理，最终无进程/listener 残留。P8 本机结论为 `PASS_WITH_EVIDENCE_GAPS`，clean Windows 10/11、普通用户安装/升级/回滚/卸载、DPI/焦点、硬崩溃/Job Object、真实 Provider/Edge TTS 和容量/媒体质量仍为 `EXTERNAL_VALIDATION_PENDING`。

### P8：容量、故障注入和候选发布

目标：

- 用真实安装产物完成容量、恢复、安全、媒体质量和用户验收。

当前本机收口记录（2026-08-17）：桌面仓库已完成候选发布审计脚本和 Windows 外部验收矩阵；本机 manifest/hash/license/metadata/第一方密钥模式检查通过，结果为 `PASS_WITH_EVIDENCE_GAPS`。未签名安装包、clean Windows 10/11/另一台普通用户电脑、升级/卸载/故障注入、真实 Provider/Edge TTS、容量和完整播放人工证据仍保持 `EXTERNAL_VALIDATION_PENDING`，不得以本机审计替代发布门。

测试矩阵：

- Windows 10 22H2、Windows 11 当前支持版本。
- 标准用户、中文用户名、中文/空格安装路径、不同 DPI。
- OpenAI、DeepSeek、GLM、Kimi、Anthropic 五家 Provider。
- 10、30、50 页真实课件；成片分别覆盖短、中、接近 60 分钟。
- 解析、PLAN、AUDIO、PAGE_RENDER、COMPOSITE、VALIDATE 每阶段强杀应用。
- 断网、DNS 失败、429、401、5xx、Edge 不可用、LibreOffice 崩溃、FFmpeg 崩溃。
- 磁盘不足、数据库重启、资产被篡改、升级中断。
- MP4 完整解码、H.264/AAC、yuv420p、25 FPS、Fast Start、时长、响度、黑帧、页覆盖、字幕和遮挡。

发布门：

- 50 页和不超过 60 分钟成片在最低支持机器完成，无数据丢失或重复计费。
- 任意阶段杀进程后可恢复，或进入清晰可重试终态。
- 密钥扫描确认数据库、日志、诊断包、API 响应和任务错误中无完整 Key。
- 三套代表性视频必须按完整播放人工审核讲稿、字幕、声音、原页可读性和数字人观感。
- 当前两态数字人若再次被用户判定不可接受，停止发布；不得未经新范围批准自动恢复五档嘴型或进入 L6。

## 11. 验证命令

每个实现阶段完成后，先更新 STATUS 和 CURRENT_TASK，再严格串行运行现有根门禁：

1. npm.cmd run typecheck
2. npm.cmd run lint
3. npm.cmd run backend:test
4. npm.cmd run build

还必须运行与阶段有关的既有专项：

- npm.cmd run test:contracts
- npm.cmd run test:unit
- npm.cmd run test:components
- 对应 PostgreSQL integration / Stage T E2E
- npm.cmd run routes:check

计划中需要新增并最终固化的命令：

- npm.cmd run test:providers
- npm.cmd run test:workflow
- npm.cmd run test:desktop
- npm.cmd run desktop:build
- npm.cmd run desktop:package
- npm.cmd run desktop:verify
- npm.cmd run desktop:smoke:installed
- npm.cmd run test:desktop:soak

`test:desktop:soak` 已创建并在最终候选上通过 3 轮；其余桌面发布命令也已创建并执行相应门禁。`test:workflow` 已在根 `package.json` 和 backend workspace 中固化，并在本机 PostgreSQL 上通过 3/3 workflow integration tests；`test:providers` 已存在，但默认真实上游 smoke 仍按 opt-in 规则跳过，不能写成五家正式上游通过。

## 12. v1 验收标准

v1 只有同时满足以下条件才可称为“可交付软件”：

1. 用户在干净 Windows 10/11 机器上只运行一个安装包即可使用。
2. 软件不依赖系统预装 Node、Python、PostgreSQL、LibreOffice 或 FFmpeg。
3. 用户可配置并测试 OpenAI、DeepSeek、GLM、Kimi 或 Anthropic API。
4. API Key 加密保存，任何公共响应、数据库、日志和诊断包都不出现完整值。
5. 用户可上传不超过 100 MB、50 页的 PPTX，并核对全部原页。
6. 正式生成前必须审核并批准全部讲稿；公式朗读可单独修正。
7. 一个根工作流完成音频、分页渲染、合成和验证，不依赖浏览器阶段串联。
8. 应用关闭、崩溃或短暂断网后可以恢复或明确重试，不重复生成成功资产。
9. 固定内置数字人不遮挡标题、公式、图表、关键文字或字幕安全区。
10. Edge TTS 失败不会生成静音或假成功。
11. 只有媒体硬门通过后才显示完成。
12. 最终可播放并导出 MP4、SRT 和元数据。
13. 50 页与接近 60 分钟的候选样本通过性能、恢复和完整播放人工验收。
14. 升级前自动备份；migration 失败可回滚；卸载默认保留用户项目。

## 13. 明确不在 v1

- SaaS、账号体系、多租户、团队权限和云端对象存储。
- 自定义数字人、用户上传头像、人物训练和其他教师正式口型资产。
- 五档局部嘴型重新上线、GPU 生成式唇形或视频驱动方案。
- 多家正式 TTS Provider；只保留接口扩展点。
- BGM、片头片尾、直播、模板市场、移动端和浏览器远程访问。
- 9:16、1:1 等额外画幅。
- 自动更新服务、远程遥测和云端诊断上传。
- 完整可迁移项目包；v1 交付 MP4、SRT、元数据和本机项目历史。

## 14. 主要风险与处理

| 风险 | 处理 |
| --- | --- |
| 安装包体积很大 | 用户已选择开箱即用；优先离线完整包，后续再评估 Web installer |
| Edge TTS 无企业 SLA | 标记联网依赖，做探针、超时、重试和明确失败；保留 TTS Provider 接口 |
| Provider 模型和协议快速变化 | 不硬编码“最新模型”，分协议 adapter、能力探测、可更新预设和手工模型 ID |
| PostgreSQL 捆绑复杂 | P1 先做标准用户纵切；失败立即 STOP，不在后期才发现 |
| 密钥穿越多进程 | Electron safeStorage + 认证 IPC + 短时内存 + 全链脱敏测试 |
| 长视频耗时与磁盘压力 | 启动前估算空间，按页持久，原子产物，可取消、可恢复，50 页硬门 |
| UI 与渲染不一致 | v1 隐藏未接通控件；每个可见设置必须有冻结快照和媒体集成测试 |
| 当前数字人观感仍有限 | 发布门采用整段播放人工验收；失败停止发布，不越过 L6 STOP |
| 教学讲稿不稳定 | 扩大金样、严格 schema、一次 repair、风险标记和强制人工审核 |
| 升级破坏项目 | 版本化 migration、升级前备份、健康检查和回滚演练 |

## 15. 参考事实来源

仓库内主要事实来源：

- docs/CURRENT_TASK.md
- docs/STATUS.md
- docs/planning/DEVELOPMENT_ROADMAP.md
- docs/PRD.md
- docs/ARCHITECTURE.md
- docs/DECISIONS.md
- docs/planning/TEACHING_QUALITY_ENHANCEMENT_PLAN.md
- docs/planning/LIP_SYNC_ENHANCEMENT_PLAN.md
- frontend、backend、packages/contracts 的当前代码、测试、migrations 和配置

实施前需要持续核对的官方资料：

- Next.js standalone：https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Electron safeStorage：https://www.electronjs.org/docs/latest/api/safe-storage
- Electron Security：https://www.electronjs.org/docs/latest/tutorial/security
- electron-builder NSIS：https://www.electron.build/nsis/
- PostgreSQL server：https://www.postgresql.org/docs/current/app-postgres.html
- OpenAI API：https://platform.openai.com/docs/api-reference
- Anthropic Messages：https://platform.claude.com/docs/en/api/messages
- DeepSeek API：https://api-docs.deepseek.com/zh-cn/
- 智谱 GLM：https://docs.bigmodel.cn/cn/guide/start/introduction
- Kimi Chat API：https://platform.kimi.com/docs/api/chat

## 16. 推荐执行起点

获得实施批准后，只启动 P0，不直接写 Provider、UI 或安装器代码。P0 收口并通过文档门后，再执行 P1 的最小桌面运行时纵切。P1 是整个方案的最高优先级技术风险验证：只有 Electron、Next standalone、受管 PostgreSQL、safeStorage 和中文路径在干净 Windows VM 中共同成立，后续产品化投入才继续。
