# 项目决策

> 本文记录跨会话必须保留的确定结论。详细 ADR 见
> `docs/ARCHITECTURE_DECISIONS.md`。标为“已确定”只表示方向已经确认，不代表代码已经实现。

## 已确定

### D-41 P4 以显式批准作为讲稿人工审核确认，双文本进入任务快照

- **决策**：解析低置信度、解析警告、非 valid 公式和 L2/L3 推导统一投影为 `reviewFlags`。未批准且存在标记的页面在 AUDIO、PAGE_RENDER、COMPOSITE 入口返回稳定 `HUMAN_REVIEW_REQUIRED`；没有标记但未批准仍返回 `LESSON_PLAN_NOT_APPROVED`。用户修改 `displayText` 与 `spokenText` 后，必须显式批准当前不可变 revision，批准才是解除审核门的唯一确认动作。
- **原因**：生成按钮不能替用户批准，也不能仅依赖前端状态；公式朗读需要可直接修正，同时审核状态必须进入持久 revision/任务快照，才能防止陈旧文本或未经审核页面进入音频和视频。
- **影响**：字幕显示文本与 Edge TTS 朗读文本分开保存并冻结；试听和最终 AUDIO 使用同一 Edge voice/rate/pitch 映射。真实供应商和外部媒体验证仍不因本地门禁通过而自动视为完成。

### D-42 P4 设置 UI 只暴露已接入最终渲染器的能力

- **决策**：首发设置只显示周老师、三种 Edge TTS 音色、0.75×～1.50× 语速和逐页隐藏周老师；服务端将历史/不受支持的头像、背景、caption 样式、左右全局站位和非隐藏覆盖规范化为当前渲染器实际能力。
- **原因**：渲染器固定使用 `avatar-zhou`/`legacy-binary-v1`，字幕与背景样式未形成可冻结的渲染输入；继续展示这些控件会让预览、配置和最终视频产生错误预期。
- **影响**：设置 Contract 仍保留兼容字段以避免破坏旧记录，但公开项目投影、前端表单和 PAGE_RENDER 快照只使用支持的值；未来接入新渲染能力时必须新增版本化契约和对应任务快照测试。

### D-40 P3 使用统一 Provider Gateway，任务优先使用冻结快照

- **决策**：PLAN Worker 统一通过 Gateway 调用 OpenAI、DeepSeek、GLM、Kimi 和 Anthropic；协议适配器只负责请求/响应形态，输出一律经过 `unknown` 边界、`stage-tc-agent-v1` strict Contract 和最多一次 JSON 包装修复。Provider Profile 快照优先于环境回退，按 principal、profileVersion、keyVersion 和完整非秘密配置校验后从桌面密钥代理读取对应 key 版本。
- **原因**：旧的单一 OpenAI-compatible 直连无法覆盖 Anthropic Messages，也无法保证任务重试继续使用创建时的 Provider 版本；统一错误分类可以避免鉴权失败无限重试，并阻止上游原始文本进入公共错误。
- **影响**：`AGENT_AUTH_FAILED`、`AGENT_RATE_LIMITED`、`AGENT_TIMEOUT`、`AGENT_PROVIDER_FAILED`、`AGENT_OUTPUT_INVALID` 和 `AGENT_CONFIG_MISSING` 成为 Worker 层稳定边界。fixture 和离线评测通过不等价于供应商正式支持，正式声明还需要每家 opt-in real smoke。

### D-39 P2 Provider 密钥由桌面主进程版本化代理

- **决策**：Provider profile 的数据库记录只保存 `credentialRef`、`keyConfigured`、`keyLast4` 和 `keyVersion`；完整 API Key 通过 Hono/Worker 到 Electron 主进程的受控 IPC 写入 safeStorage/Windows DPAPI 加密文件，按 credentialRef 保留版本。BrowserWindow 没有读取完整 Key 的接口。
- **原因**：P2 需要支持密钥轮换、旧任务版本审计和保存失败回滚，同时不能把明文密钥放入 Prisma、Next 环境变量、浏览器响应、日志或诊断包。
- **影响**：P2 只实现配置保存、删除、默认选择和配置级测试；真正的五家 Provider HTTP adapter 及任务冻结/调用进入 P3。若 safeStorage 或密钥 IPC 不可用，保存必须失败，不能降级到明文或环境变量。

### D-36 共享 Contract 以可追溯 npm 制品跨仓库分发

- **决策**：`packages/contracts/src` 继续作为唯一源码；从源目录干净的网页仓库构建 ESM npm tarball，桌面仓库通过本地 `file:` 依赖使用，并固定源提交、版本和 SHA-256。
- **原因**：当前没有受信 registry/release 流水线。版本化本地制品可先满足离线安装、运行时 Zod 校验和跨仓库可追溯性，又不复制业务 schema 或绑定开发者机器的相邻目录。
- **影响**：Contract 更新必须按“网页源码与测试 → 重新打包 → 桌面清单/依赖更新 → 两仓库回归”顺序执行；制品生成物不在网页仓库提交。该决策只完成 Contract 分发门，不表示桌面业务 API 或运行时已接通。

### D-38 P1 后端制品保持构建输出，不复制业务源码到桌面仓库

- **决策**：网页仓库用 esbuild 生成 Hono/Worker production ESM 探针制品，桌面只通过 runtime manifest/路径监督；业务源码和 Prisma migrations 继续唯一存在于网页仓库。
- **原因**：复制后端实现会制造第二事实来源；直接用 tsx 源码启动也不能代表可捆绑生产制品。
- **影响**：本机全纵切使用现有 Prisma CLI 验证迁移顺序，但正式独立 migration 制品、完整依赖 staging 和 clean VM 仍是明确缺口。P1 结论只能为 `PASS_WITH_EVIDENCE_GAPS`。

### D-37 P1 桌面生命周期使用主进程 IPC 与数据库语义就绪

- **决策**：Hono 显式绑定 `127.0.0.1`；Hono/Worker 只接受 strict、版本化父进程 IPC shutdown，并在实际数据库查询成功后发送 ready。Next BFF 上游配置只接受不含凭据的 loopback HTTP URL。
- **原因**：TCP 开端口或进程存活不等于数据库迁移和业务服务可用；renderer 也不能成为进程控制或内部秘密边界。
- **影响**：该 IPC 是桌面内部运行时协议，不扩展共享业务 Contract。P1 未改变 lease/outbox/任务调度语义，未新增 Provider 或真实密钥。

### D-35 网页与 Windows 软件拆为两个 GitHub 仓库

- **决策**：`FJH06118/math-avatar-mvp` 作为网页与共享服务仓库，新增 `FJH06118/math-avatar-desktop` 作为 Windows 桌面软件仓库；桌面端只维护宿主、设置保护、运行时监督和安装升级，不复制后端业务代码。
- **原因**：网页迭代与桌面封装的发布节奏、构建工具和安装产物不同；拆分可降低相互污染，同时保留版本化 HTTP/共享 Contract 的单一业务事实来源。
- **影响**：跨仓库 Contract 变更必须先在网页仓库完成并记录版本，桌面仓库再适配；桌面仓库当前只有 P0 骨架，不能被误认为已有安装包或 Provider 原生适配。

### D-34 正式渲染回退为开口/闭口两态

- **决策**：按用户人工验收结果，撤下五档局部嘴型正式接线；PAGE_RENDER 只使用既有周老师开口/闭口两张整身图确定性交替。
- **原因**：自动同步与媒体门不能证明视觉自然度；用户播放后明确判定五档贴片效果不可接受。
- **影响**：新渲染标记 `stage-te-binary-mouth-v1` / `legacy-binary-v1`，不生成 lip-sync timeline。D-33 保留为失败实验历史，不再描述当前生产路径；L6 继续停止。

### D-33（已撤回）唇形增强采用严格 timing 审计、唯一 CPU 驱动和局部贴片 RLE

- **决策**：Edge timing metadata 必须原子保存或显式记为 `UNAVAILABLE`；唯一驱动核心使用词边界限定发声区间、PCM 能量控制开合、固定 `pinyin-pro@3.28.2` 提供可靠 ROUND 提示。无边界时只用 `CLOSED/SMALL/MEDIUM/LARGE`，音频/时长失配则失败。
- **原因**：这能保留停顿、响度和简化发音信息，同时避免随机圆唇、机械二态和五张整身图造成的闪烁。
- **影响**：正式 PAGE_RENDER 使用固定底图、五张局部贴片和 RLE concat；缓存冻结 avatar/素材/timing/driver 全部版本。首个 ready bundle 仅为 `avatar-zhou/mouth-v1`，林/严老师必须在 L6 单独制作并通过素材门禁后才可进入正式渲染。

### D-01 原 PPT 页面是默认视觉底板

- **决策**：默认完整 `contain` 展示原页，再添加受控教学叠加；整页重设计必须得到用户明确授权。
- **原因**：最大限度保留公式、图表、版式和教师已有内容，并能证明页面覆盖。
- **替代方案**：默认重绘每页；只提取文本后重新排版。
- **影响**：每个非跳过页至少完整展示 1.5 秒；数字人应移动、缩小或隐藏以避免遮挡。原页缺失时应阻断或进入可审计的人工降级，不能自动全页重构；当前文本重建回退不满足最终保真要求。

### D-02 MVP 使用一个模块化课程导演 Agent

- **决策**：LLM 只输出版本化、受约束的教学计划；PPT 解析、TTS、渲染、媒体检查和存储是确定性工具。
- **原因**：降低多 Agent 协调和不可复现风险，便于审核、重试和定位。
- **替代方案**：多个自治 Agent 分别负责脚本、动画、渲染；让模型直接生成可执行代码。
- **影响**：模型输出必须验证，不能直接执行 JavaScript、Shell、HTML、FFmpeg 命令或用户表达式。

### D-03 生成前必须经过显式人工批准

- **决策**：准备阶段与渲染阶段之间保留可修改的审核产物和批准门禁。
- **原因**：数学推导、讲稿和视觉计划存在内容风险，不能由模型输出直接驱动最终交付。
- **替代方案**：上传后全自动生成；只在最终视频后检查。
- **影响**：用户批准的修订必须成为渲染输入，后续异步结果不得静默覆盖。当前 CLI 已有 `approve` 步骤。

### D-04 保留现有 CLI 作为迁移适配器与黄金样例

- **决策**：现有 Python/Node CLI 不直接充当生产 Web 后端，但在迁移期间用于真实三页样例、回归和语义对照。
- **原因**：它已证明 PPTX→TTS→视频链路可运行，直接重写会丢失可比较基线。
- **替代方案**：立即删除并从零重写；让 Next.js 同步调用 CLI。
- **影响**：新服务应逐步封装其能力并建立契约/黄金测试，不能把长任务塞进 Route Handler。

### D-05 浏览器、BFF、应用服务和 worker 分层

- **决策**：浏览器只调用公开 API；Next.js BFF 只处理会话、范围和公共校验；业务事务和资源授权属于私有后端应用服务；重任务属于 worker。
- **原因**：隔离密钥和系统工具，支持持久任务、幂等、重试与独立扩展。
- **替代方案**：浏览器直连模型/FFmpeg；Route Handler 同步完成视频；前端直接导入后端实现。
- **影响**：阶段 T-A～T-G 已实现 Next BFF/Hono、产品事务、PARSE/PLAN/AUDIO/PAGE_RENDER/COMPOSITE/VALIDATE Worker 与受控下载；阶段 3 在相同边界加入项目列表、复制、归档和删除。页面默认仍为 Mock，逐屏真实接线按阶段 4～9推进。

### D-06 共享业务契约以严格 Zod schema 为源

- **决策**：跨前端、API 和 TypeScript worker 的业务契约只能定义在 `packages/contracts/`，类型使用 `z.infer` 生成；所有外部 payload 先按 `unknown` 验证。
- **原因**：避免手写接口漂移，并把网络、模型、文件和队列边界变成可测试门禁。
- **替代方案**：各端各自维护 interface；先强制类型断言再使用。
- **影响**：`packages/contracts/` 已引入稳定 project/presentation/slide/task/step/revision/asset ID、版本化 API 元信息、受控资产引用和严格 Schema；页码不是 `slideId`。Python/Node CLI 的跨语言 JSON 迁移仍留到后续阶段。

### D-07 长任务必须真实持久化和可恢复

- **决策**：任务与步骤状态持久化；命令幂等、可取消、带心跳，失败只重试失败步骤和失效的下游步骤。
- **原因**：视频生成耗时长，浏览器计时器或单进程内存不能支撑刷新、崩溃和并发。
- **替代方案**：前端轮询虚构进度；每次失败从头生成。
- **影响**：完成状态必须晚于最终验证。MVP 前端使用轮询，不把 WebSocket/SSE 作为前置条件；T-B 已把 PostgreSQL outbox/lease 接入产品 PARSE 任务流程并验证 heartbeat、租约接管、取消与失败隔离，后续步骤仍须沿用同一语义。

### D-08 模型和 TTS 供应商保持可配置

- **决策**：供应商及模型名只来自服务端配置；生产模型不得有代码默认值；兼容性验证通过后才能成为依赖。
- **原因**：供应商能力、结构化输出、区域可用性和 SLA 会变化。
- **替代方案**：在代码中固定 DeepSeek、OpenAI 或单一 TTS。
- **影响**：现有 Edge TTS 和 `deepseek-chat` 仅是原型现状，不是生产承诺；真实集成前必须做供应商 spike。

### D-09 对外只交付受控资源引用

- **决策**：内部资源使用稳定 asset ID、内容哈希和 storage key；浏览器只得到已授权 HTTP/短期签名 URL。
- **原因**：绝对路径和存储键会泄露基础设施并绕过授权。
- **替代方案**：把本地路径直接写入 API；让浏览器访问共享盘。
- **影响**：当前本地 JSON 可保留为 CLI 调试产物，但未来公共契约必须移除绝对路径。

### D-10 渲染必须确定性且通过媒体门禁

- **决策**：渲染只接受版本化模板、白名单动画、有限坐标、固定种子和受限表达式；最终验证通过前不能交付。
- **原因**：保证安全、复现性和失败定位，防止陈旧帧或部分输出污染重试。
- **替代方案**：执行模型生成的代码；只检查文件是否存在。
- **影响**：需要按任务/尝试隔离临时目录，并补齐 ffprobe、全解码、覆盖、遮挡、黑帧、静音、时长和哈希门禁。

### D-11 T0 采用无 Docker 的 PostgreSQL 持久任务方案

- **决策**：用户已批准在 Windows 普通开发环境中使用原生 PostgreSQL + Prisma + PostgreSQL lease worker；T0 不要求 Docker、Redis 或 BullMQ。
- **原因**：当前 Docker Desktop 的 WSL2 engine 无法启动；单一 PostgreSQL 可以同时承载领域事务、outbox 和 lease，减少本地依赖及数据库/队列双写故障面。
- **替代方案**：继续修复 Docker Compose；PostgreSQL + BullMQ/Redis；仅用内存或本地 JSON 模拟队列。
- **影响**：2026-08-02 的真实多连接 PostgreSQL POC 已用 `npm.cmd run t0:test` 通过事务、幂等、outbox 重放、`FOR UPDATE SKIP LOCKED` 并发领取、heartbeat、租约到期接管、取消、Worker kill、重试上限和向前迁移；T-A～T-G 已进一步实现产品数据模型、HTTP 边界、全部纵切 Worker 和交付，阶段 3 沿用相同数据库与 principal 边界。若后续证据失败，先更新 ADR，不静默加入第二套队列。

### D-12 首发评测范围为高等数学优先，Contract 保持通用

- **决策**：首发评测以高等数学课件为重点，不承诺所有学科同等效果；跨学科业务 Contract 不为数学专用字段收窄。
- **原因**：现有金样、公式和教学审核风险均以数学内容为主，需要先在可评测的窄范围内建立真实证据。
- **替代方案**：从首版即承诺全学科同等质量。
- **影响**：T0 与阶段 T 的 fixture、Prompt 预检和人工审核优先验证数学场景。未来扩大学科范围时，先补数据集、Prompt、指标和范围决策。

### D-13 首发用户为内部单用户

- **决策**：阶段 T 仅在本机/测试环境面向内部单用户，使用固定 principal；该 principal 不得作为生产身份方案。
- **原因**：当前没有账号、权限或租户隔离实现，先用受限身份边界验证真实纵向切片。
- **替代方案**：首版支持个人账号或机构团队。
- **影响**：阶段 T 不建设正式登录、团队权限或计费。若转向个人账号或机构团队，必须先修订范围并增加最小 identity，机构分支还需 `tenantId`、隔离与越权测试。

### D-14 无头原页渲染优先 LibreOffice

- **决策**：在普通 Windows 开发终端中，默认使用 LibreOffice `soffice.com`、每次独立临时 profile 和 `pypdfium2==5.12.1` 完成 PPTX → PDF → 逐页 PNG；仅 LibreOffice 不可用时才回退 Windows PowerPoint COM。
- **原因**：受限开发终端无法创建或接管交互式 PowerPoint COM，会稳定返回“指定的登录会话不存在”。`soffice.com` 是控制台启动器，可避免 GUI 启动器留下无窗口进程；`pypdfium2` 是固定的项目 Python 依赖，替代路径/编码不可靠的 Codex 私有 `pdftoppm` 包装器。
- **替代方案**：继续要求人工导出 PNG；把 `soffice.exe` 或 Codex bundled `pdftoppm` 当成运行时依赖；默认使用 Office COM。
- **影响**：T0 合成三页 fixture 已验证 3/3 份 1920×1080 PNG，用户指定私有课件已验证 14/14 份 1920×1080 PNG。LibreOffice 与 PowerPoint 的字体、公式和版式差异仍须在阶段 T/11B 以批准金样和真实课件人工抽查；这不构成阶段 T 的遮挡或媒体门禁通过。

### D-15 阶段 T 私有应用服务采用 Hono

- **决策**：阶段 T 使用 Hono 4.12.31 + `@hono/node-server` 2.0.12 构建独立 Node/TypeScript application service；Next Route Handlers 继续只作为公开 BFF。
- **原因**：Prisma、PostgreSQL lease worker 和现有媒体编排均已有 Node/TypeScript 边界；Hono 使用 Web Request/Response 语义、依赖小，并且精确版本已存在于当前锁文件。它不会把重任务塞进 Next 或新增另一种业务运行时。
- **替代方案**：Node `http` 手写路由；Python FastAPI；让 Next Route Handler 直接访问 Prisma/CLI。
- **影响**：私有服务必须重新验证 principal/scope、Zod 和上传结构；BFF 只转发公共 Contract 与内部鉴别。Hono 选择不改变现有 Python/Node CLI 的适配器身份，也不允许同步运行 LibreOffice、Provider、TTS 或 FFmpeg。

### D-16 阶段 T-D 使用句级 AUDIO step 与 Edge TTS 子进程

- **决策**：AUDIO task 冻结所有 current approved revision 的逐句文本和语音参数；每个 narration 使用稳定 step 与独立 attempt。Edge TTS 仅作为开发适配器，在可终止的子进程中运行；正式 Provider 保持未定。
- **原因**：句级边界允许只重试失败句，并让输入哈希、音频资产和字幕 cue 可追踪。子进程边界能在取消或租约丢失时终止网络合成，避免迟到结果覆盖终态。
- **影响**：同一 AUDIO task 串行领取句子以确保最终时间轴原子收口；MP3 必须通过解码、时长和非静音校验才登记。T-D 不拼接视频，也不构成 Edge TTS 的生产 SLA 承诺。

### D-17 阶段 T-E 使用右侧面板的逐页 Sharp/FFmpeg 渲染

- **决策**：每个源页形成独立 PAGE_RENDER step；原页完整 contain 到 1500×844 区域，数字人放在不与原页相交的右侧面板。阶段 T 只渲染 highlightBox/arrow，输出 25 或 30 FPS 的 1920×1080 H.264/AAC `yuv420p` 分页 MP4。
- **原因**：页级边界允许只重试失败页；独立数字人面板在缺少可靠元素几何时仍能严格避免遮挡标题、公式、图表与字幕安全区。
- **影响**：T-E 不做最终视频交付；完整解码、Fast Start、黑帧、静音、页面覆盖和最终状态属于 T-F 硬门。

### D-18 阶段 T-F 将合成候选与验证终态分离

- **决策**：COMPOSITE 只生成内容寻址的候选 MP4；独立 VALIDATE step 通过全部硬门后才把 `MediaOutput` 标记为 `VALIDATED` 并结束任务。失败候选标记 `REJECTED`，对应 Asset 标记 `INVALID`。
- **原因**：FFmpeg 成功退出只证明文件生成，不证明完整解码、正确编码/封装、时长、非静音、页面覆盖或遮挡安全。
- **影响**：T-G 只能签发或流式读取 `VALIDATED` 资产；不能用文件存在、任务合成完成或客户端判断替代服务端验证记录。

### D-19 阶段 T-G 使用项目范围内的本地 HTTP 交付

- **决策**：阶段 T 不提前绑定对象存储或公共签名 URL；Hono 在每次读取时校验 principal、验证终态、Asset 生命周期、大小和 SHA-256，Next BFF 只转发 Range/ETag 与公开响应头。
- **原因**：这足以验证浏览器 HTTP 下载、范围请求、完整性和跨项目拒绝，同时不引入尚未确定的云厂商与正式认证架构。
- **影响**：公开清单只含稳定 asset ID 和同源 BFF URL；阶段 9/生产部署可在保持 Contract 的前提下替换存储 adapter。真实 adapter 必须显式用 `stage-t` flag 开启，默认 Mock 不变。

### D-20 阶段 3 项目删除使用版本保护并允许可审计孤儿清理

- **决策**：复制项目会在新的项目命名空间重新登记并校验源课件；归档和删除必须携带 `expectedVersion`，且活动任务存在时拒绝操作。数据库删除成功后再回收本地项目目录。
- **原因**：避免陈旧页面删除新版本、避免运行中任务失去所有权，并确保复制项目不跨项目共享内部 storage key。
- **影响**：数据库删除后若文件回收失败，资产已不可通过 API 到达，但可能留下磁盘孤儿；阶段 11A/11F 的 reconciler 与孤儿清理负责对账，不以回滚数据库删除冒充成功。

## 待确认
### D-21 阶段 6 页面锁定属于 LessonPlan，修订保持不可变

- **决策**：锁定状态持久化在可变的 `LessonPlan` 聚合根，内容继续写入不可变 `LessonPlanRevision`；锁定/解锁和修改都校验 current revision。
- **原因**：锁定表示用户对“当前页面后续是否允许变更”的意图，不应伪造一个内容 revision；同时 expected revision 能阻止陈旧页面覆盖新审核结果。
- **影响**：锁定页修改返回 `REVISION_LOCKED` 409；单页修改只创建该页新 revision，不删除其他页 revision 或下游资产。无 revision 时必须先完成持久 PLAN task，不能让占位讲稿通过生成门禁。

### D-22 阶段 7 试听复用持久 AUDIO Worker，站位冻结进渲染任务

- **决策**：真实音色试听创建单句 AUDIO task，完成后只通过鉴权同源 BFF 暴露 MP3；教学设置以 Project version 更新，逐页 hidden 在创建 PAGE_RENDER 时冻结进不可变 payload。
- **原因**：试听也必须满足既有解码、时长、非静音和 principal 隔离门禁；渲染时读取可变设置会破坏重试可复现性。
- **影响**：Mock 使用可解码 HTTP fixture 而非计时器。阶段 T 已验证的安全站位仍为右侧面板；left/right 候选均可持久化，但在新增并验证其他安全布局前，渲染只执行右侧安全面板或显式 hidden。

### D-23 阶段 8 用 URL 恢复多任务生成链，不在浏览器复制队列状态

- **决策**：生成页轮询单个持久 Task；AUDIO、PAGE_RENDER、COMPOSITE/VALIDATE 的依赖 ID 写入 URL，只有前一任务成功才调用下一阶段幂等创建端点。
- **原因**：现有后端各阶段已具备事务、outbox、lease 和独立恢复语义；新增浏览器工作流表或本地计时器会制造第二事实来源。
- **影响**：重挂载恢复同一 task，不重复创建。用户重试失败阶段时创建新的审计任务/attempt 链，内容寻址资产仍去重；取消只请求后端合法终态，UI 不乐观伪造完成。

### D-24 阶段 9 结果页重新读取交付清单，不把交付续取当作重渲染

- **决策**：最终 taskId 是结果页恢复键；播放、MP4、SRT 和元数据 URL 来自重新授权的 DeliveryManifest，验证报告来自 FinalMedia。
- **原因**：交付地址可能刷新，但已验证媒体内容与生成任务不应因此变化；SRT 也不能冒充浏览器要求的 WebVTT track。
- **影响**：清单刷新是只读操作且不新增任务。当前本地 HTTP URL 不过期；未来短期签名 URL 只替换 downloadUrl 生成方式，保持 task/asset scope、Range/ETag 和完整性语义。

### D-25 阶段 10 保留 SRT 交付，并提供受控 WebVTT 播放投影

- **决策**：SRT 是可下载交付物；浏览器字幕轨通过最终 task 的鉴权端点把已验证 SRT 只读转换为 WebVTT。
- **原因**：HTML `<track>` 要求 WebVTT，直接把 SRT URL 填入 track 会造成字幕静默不可用；为此重新生成媒体或复制字幕资产都没有必要。
- **影响**：VTT 请求按 principal 授权并在转换前复核源资产哈希，不登记新资产、不创建任务；未来可缓存转换结果，但不能绕过相同授权与完整性门禁。

### D-26 阶段 11A 的本地孤儿资产清理默认 dry-run

- **决策**：本地资产对账以数据库 `Asset` 为登记清单，先报告缺失、损坏和未登记文件；删除未登记文件必须由调用者显式开启，并满足 `assetRoot/projects` 根约束与宽限期。符号链接只报告，不跟随也不删除。
- **原因**：任务提交、Worker 终止或文件落盘与数据库登记之间可能留下孤儿；自动立即删除会把仍在写入的候选或配置错误误判为垃圾。
- **影响**：恢复测试可以在临时根中验证实际清理，而生产调用应先审查 dry-run 报告再启用删除。已登记但缺失/损坏的资产只报告，生命周期修复与下游媒体判定由对应业务恢复流程处理。

### D-27 图片公式 OCR 从 Web MVP 延期

- **决策**：用户于 2026-08-04 明确批准 P-11 图片公式 OCR 延期；阶段 11B 不引入 OCR 引擎或外部识别服务。
- **原因**：当前 Web MVP 优先验证可复现的原页保留、结构化公式候选和人工审核闭环，图片公式识别的模型、准确率、数据外发与部署边界尚未完成 POC。
- **影响**：图片中的公式必须保留在完整原页中，并产生可审计的“需要人工核对/未执行 OCR”警告；不得把图片公式转写率计入结构化公式成功率，也不得宣称已支持图片公式 OCR。后续恢复该能力前需单独确定数据集、准确率门槛、供应商/本地方案和隐私边界。

### D-28 阶段 11C 保留单 Agent，并限制 JSON 修复范围

- **决策**：继续使用一个 Provider 调用；六个课程导演模块实现为 strict Contract 后的确定性审核步骤。只允许最多两次 JSON 包装修复，不补字段、不删除未知业务字段。
- **原因**：当前收益来自可测试的模块边界与错误定位，而不是引入多 Agent 编排或第二运行时；自动“修好”业务内容会掩盖模型契约失败。
- **影响**：首次与修复后的 Schema 率按真实分母分别报告；模块失败统一产生可重试的 `AGENT_OUTPUT_INVALID`，revision 仍记录 Provider/model/Prompt/Schema 版本，所有 Agent revision 继续等待显式人工批准。

### D-29 阶段 11D 音频缓存以冻结输入哈希和已验证资产为边界

- **决策**：同项目中 voice/rate/pitch、revision、narration 与 spokenText 完全一致时允许跨任务复用音频 Asset；命中缓存前必须复核文件大小和 SHA-256。
- **原因**：内容寻址文件只能证明输出字节相同，冻结输入哈希才能证明语义与 Provider 参数相同；跳过完整性复核会传播损坏缓存。
- **影响**：缓存命中不调用 TTS，但新任务仍创建独立 AudioSegment、SubtitleCue、AudioTimeline 和 attempt 审计。候选音频必须通过解码、时长、16–48kHz、非静音与无削波门禁后才可首次进入缓存。

### D-30 阶段 11E 默认 25 FPS，分页缓存不跨输入快照

- **决策**：25/30 FPS 都保留在 Contract 中；默认生成继续使用 25 FPS。分页缓存键冻结 source/audio/overlay/avatar/FPS/renderer version，命中前复核 frame/video 完整性。
- **原因**：三页基准中两档均通过媒体硬门；最大视频时长和容量尚未确认，25 FPS 以更少帧数作为保守默认。逐页缓存必须确保单页修改不会重渲染其他页或复用陈旧视觉状态。
- **影响**：30 FPS 只能显式请求；不得把三页媒体结果外推为 10/50/100 页容量。attempt 目录复用会直接失败，旧 frame 或 page.mp4 不参与新 attempt。

### D-31 阶段 11F 以落盘完整性和显式响度指标收口最终媒体

- **决策**：VALIDATE 在 FFmpeg 分析前复核候选 MP4 与所有逐页基准帧的实际大小和 SHA-256；最终报告必须包含平均响度与峰值，通过范围分别为 `-35～-8 dB` 和 `< -0.05 dB`。项目包范围未确认时沿用路线图默认，只交付版本化元数据、讲稿/场景引用和资产清单。
- **原因**：数据库中已有哈希不能证明文件落盘后未缺失或被篡改；“非静音”也不能证明音量适合交付。完整离线复现工程会引入尚未确认的运行时、供应商、模型、系统依赖和许可边界。
- **影响**：完整性或任一媒体硬门失败都会使 Task、MediaOutput 和候选 Asset 收口为 `FAILED/REJECTED/INVALID`；只有全部通过才形成 `SUCCEEDED/VALIDATED/AVAILABLE`。当前交付不得宣称包含完整离线复现工程。

### D-32 默认试听使用版本化真实样本，语速与真实 Worker 保持同一语义

- **决策**：Mock 模式为清和、致远、明晰提交三份公开示例句的真实中文 MP3，播放器按点击瞬间的授课倍速播放；真实模式继续创建持久 AUDIO 任务，并使用相同的 voice/rate/pitch 映射。试听文案固定为“生活就像海洋，只有意志坚强的人才能到达彼岸。”
- **原因**：统一蜂鸣音无法帮助用户判断音色，也没有验证语速设置；让默认页面运行时联网 TTS 会引入不稳定性和隐式数据外发。版本化样本可离线复现，真实模式仍保留后端质量门和审计。
- **影响**：三份静态 MP3 必须保持可解码、互异和无削波；Route Handler 只允许三种稳定 voice ID 与 `0.75～1.50` 倍速。浏览器不得直接调用 TTS，最终生成与试听不能使用不同音色映射。


| 事项 | 已知候选或问题 | 确认前的处理 |
| --- | --- | --- |
| 数据库与 ORM 的产品接入 | Windows 原生 PostgreSQL 18.4 + Prisma 7.9.1 已通过 T0 POC；T-A/T-B 已用于产品上传事务、outbox、PARSE task/step/attempt、Slide 和 Asset。 | 后续阶段沿用向前迁移和相同 Contract，不另建第二套产品存储。 |
| 持久任务的产品接入 | T-B～T-F 已实现产品 PARSE/PLAN/AUDIO/PAGE_RENDER/COMPOSITE/VALIDATE dispatcher/lease Worker、attempt、真实进度、取消与失败恢复。 | T-G 只增加受控交付，不并行维护 Redis/BullMQ。 |
| 后端 HTTP 框架 | Hono 4.12.31 + `@hono/node-server` 2.0.12 已实现上传、任务、规划、修订和批准边界。 | 后续端点沿用同一私有服务；CLI 保持适配器身份。 |
| 阶段 T 单 Agent Provider | 用户已授权私有三页提取文本/备注/公式候选外发；DeepSeek V4 Flash 在 strict Prompt 修正后通过 3/3 真实 PLAN Worker。 | 保持 OpenAI-compatible、Provider-neutral；不发送 PPTX/PNG/路径，不把当前模型写成生产绑定。 |
| 渲染实现 | 当前为 Sharp+FFmpeg；Remotion 等仅为候选。 | 先用真实三页样例确定语义和质量缺口。 |
| 生产 LLM | 供应商、模型、结构化输出兼容性和区域可用性未验证。 | 不使用代码默认生产模型。 |
| 正式 TTS | Edge TTS 用于开发原型；正式 SLA 供应商未定。 | 不把 Edge TTS 写成生产承诺。 |
| 文件存储与部署 | 本地、S3/OSS、部署区域和签名 URL 方案未定。 | 公共契约先只暴露 asset ID/URL 语义。 |
| 帧率与模板 | 当前原型 12 fps，交付帧率和模板版本仍需质量验证。 | 12 fps 只作为现状记录。 |
| 图片公式 OCR | 用户已批准从 Web MVP 延期；当前保留完整原页并产生人工核对警告。 | 不得宣称已实现 OCR；恢复前单独确认数据集、准确率、隐私和方案。 |

### 待确认的产品决策

1. 单视频最大时长。
2. 是否允许上传自定义数字人。
3. 是否支持 9:16 和 1:1；16:9 已确认。
4. 是否需要背景音乐和品牌片头。
5. L2 数学风险是否强制人工确认；确认前不得自动进入最终生成，L3 始终人工确认。
6. 是否必须部署在中国大陆，以及相应供应商方向。
7. 项目包仅含版本化元数据，还是包含完整离线复现工程。
8. 是否需要用量计费和团队权限。
