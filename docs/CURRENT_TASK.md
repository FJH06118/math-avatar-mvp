# 当前任务

## 2026-08-17 P8 候选发布审计（本机部分，外部验收待补）

- 桌面仓库已新增候选发布审计：校验 v2 manifest、文件/许可证计数、bundle metadata 与源码提交一致性、第三方 notices、安装包 SHA-256 和 bundle 文本密钥模式；依赖包固定测试 canary 单独记录，第一方命中才使审计失败。
- 本机审计结果为 `PASS_WITH_EVIDENCE_GAPS`：最终 runtime `p7-065a181e095d`、15 个组件、85,246 文件、7 条许可证、sourceCommit `065a181e095dbdf23476cf6d241cfff2382d3d98` 和安装包 SHA-256 `54824DC998A18F59489DE89C21EFDDCC77561F0A85E1A1F3CCB406C198BCF0C3` 均匹配；安装包大小 1,008,956,662 bytes，签名状态为 `NotSigned`。
- 最终 bundle verify、PostgreSQL/Prisma migration smoke、真实 RuntimeBootstrap 四服务 READY/STOPPED、3 轮新 bootstrap soak 和隔离 `UNCLEAN -> CLEAN` recovery 均通过。解包候选 20 秒启动 smoke 观察到 3 个 loopback listener；强杀后 1 个 PostgreSQL fork child 被候选路径内精确清理，最终 residual process/listener 为 0。该结果不替代 clean VM、真实安装器交互或硬崩溃/Job Object 证据。
- 已补齐计划要求的根命令 `npm.cmd run test:workflow`，串行执行 Prisma generate/migrate 和 `workflow.integration.test.ts`，本机通过 3/3；这不替代另一台电脑、外部 Provider 或完整媒体证据。
- 已建立 `docs/operations/WINDOWS_ACCEPTANCE_MATRIX.md`，覆盖 Windows 10/11、普通用户/中文路径/DPI、安装升级卸载、migration 失败恢复、强杀/断网/磁盘/篡改、五家 Provider、Edge TTS、容量和完整播放人工验收。clean VM/另一台 Windows 电脑结果必须由外部执行后回填，当前保持 `EXTERNAL_VALIDATION_PENDING`。

## 2026-08-17 P7 完整离线安装包与升级链路（历史基线，已由 P8 候选 supersede）

- 已新增 x64 NSIS 安装配置、bundle 构建/校验、完整打包运行时 smoke、安装后启动 smoke、迁移前 PostgreSQL 备份、v2 runtime manifest、第三方 notices 和卸载保留/删除数据脚本；生产运行时不依赖系统 PATH 中的 Node、Python、PostgreSQL、LibreOffice 或 FFmpeg。
- P7 基线 bundle manifest 为 `p7-03a6e091e0ef`，包含 15 个组件、31,321 个文件和 7 条许可证记录；完整 manifest/hash/size/license 校验通过。该 P7 候选已由上方 P8 runtime/NSIS 候选 supersede，签名状态为 `NotSigned`，不得直接公开发布。
- 最终 bundle PostgreSQL/Prisma migration smoke 通过；基于真实 `RuntimeBootstrap` 的完整启动 smoke 已验证 PostgreSQL、Hono、Worker、Next 全部进入 `READY`，Next HTTP readiness 通过，停止后无本项目残留子进程。最终解包 app 启动 smoke 在 20 秒窗口内存活并实际拉起 bundle PostgreSQL/Node 子进程；按精确根 PID 清理后无残留，但仍未替代 clean VM 安装后 UI/首次启动/真实媒体验收。
- P7 结论为 `PASS_WITH_EVIDENCE_GAPS`：clean Windows 10/11、普通用户安装/覆盖升级/migration 失败恢复、卸载两种路径、125%/150% DPI、硬崩溃恢复、真实 Provider/Edge TTS 和 50 页/60 分钟媒体仍为 `EXTERNAL_VALIDATION_PENDING`。

## P8 下一步：外部容量、故障注入和候选验收

- 本机候选审计已收口；后续只处理真实安装产物的 clean VM/另一台 Windows 验收、容量、故障注入、媒体质量和人工播放。不得把本机 bundle/解包 smoke 写成外部验收完成。

## 2026-08-17 P6 首次启动、设置页和生产模式（本机收口，外部验证待补）

- 已完成首次启动 `/setup`、设置 `/settings`、Provider 创建/编辑/密钥轮换/启用/默认选择/配置级连接测试，以及只返回非秘密字段的真实设置流程；没有 Provider 时真实上传在 BFF/Hono 两侧均被 `PROVIDER_NOT_CONFIGURED` 阻断。
- 已新增严格 `runtime-health` Contract、Hono 健康/脱敏诊断端点、Next 同源 BFF、健康面板和浏览器诊断 JSON 导出。健康结果包含数据库/API/Provider/Edge TTS、桌面宿主、磁盘和 Workflow 状态，不含路径、端口、密钥或堆栈。
- 真实生产模式默认使用 real adapter；打包桌面进程启动时拒绝 Mock/stage-t/非法模式。桌面 preload 仅暴露公开运行时快照、一次显式 retry 和脱敏 Workflow 状态；主进程增加托盘、磁盘告警和后台工作流状态展示。
- P6 本地专项：共享 Contract 48/48，前端 unit 13/13、component 17/17、routes 6/6，完整 backend integration 38 pass/1 个外部 Edge TTS opt-in skip，桌面测试 25 pass/2 个按环境跳过（27 total），0 fail；网页和桌面 typecheck、lint、build 均通过。
- P6 结论为 `PASS_WITH_EVIDENCE_GAPS`：clean Windows 10/11、125%/150% 缩放与键盘焦点、真实 Provider/Edge TTS、离线 staging、安装包、硬崩溃恢复和升级回滚仍为 `EXTERNAL_VALIDATION_PENDING`，不得写成已完成。

## 2026-08-17 P5 服务端根工作流（本地收口，外部验证待补）

- 已新增共享 `WorkflowRun` strict Contract、PostgreSQL `WorkflowRun` 模型与向前 migration；输入快照冻结已批准 revision、授课设置和 Provider 非秘密选择，公开投影只返回稳定 ID、阶段、进度和脱敏错误。
- `backend/app/workflow-repository.ts` 提供创建幂等、取消、重试和 principal 隔离；`workflow-orchestrator.ts` 在服务端推进 AUDIO→PAGE_RENDER→COMPOSITE→VALIDATE，子任务继续复用既有 repository/outbox/lease；`workflow-worker.ts` 支持过期根租约接管。
- 生成页真实模式现在只创建/轮询一个 WorkflowRun，浏览器不再创建下一阶段；结果页仍使用最终 `VALIDATE` task 读取交付清单。Mock 链路保持兼容。
- P5 专项已通过：WorkflowRun PostgreSQL integration 3/3，覆盖同幂等键重放、过期租约恢复、全阶段服务端推进、根取消向子任务传播、重试新子任务和最终验证失败不完成。
- P5 结论为 `PASS_WITH_EVIDENCE_GAPS`：本机真实数据库与现有 Worker 语义已验证；实际 Windows 宿主重启、外部 TTS/FFmpeg 子进程硬崩溃回收、clean VM、离线 staging、正式 migration runtime 和升级回滚仍属于 `EXTERNAL_VALIDATION_PENDING`。

## 2026-08-17 P4 讲稿审核、双文本编辑与真实设置收敛（本地收口，外部验证待补）

- P1 已在桌面仓库 `e19ef99` / `desktop-p1-complete` 和网页 `448c1db` / `web-p1-complete` 本地收口；P2 代码已在网页 `339a46a` / `web-p2-complete`、桌面 `bd63d5c` / `desktop-p2-complete` 完成，均未推送。
- P3 已实现统一 Provider Gateway、OpenAI/DeepSeek/GLM/Kimi/Anthropic adapter、P2 快照与密钥版本解析、稳定错误分类、严格输出校验和一次 JSON 包装修复；P3 本地提交为网页 `ccd1de4` / `web-p3-complete`，未推送。
- 本轮已实现 P4：共享 `reviewFlags`、低置信度/解析警告/公式/高风险推导审核状态，AUDIO、PAGE_RENDER、COMPOSITE 三处服务端人工审核门禁，`displayText`/`spokenText` 独立编辑与冻结，Edge 试听/最终任务共用同一音色、语速和音高映射，以及只展示周老师、Edge 音色、语速和逐页隐藏站位的设置收敛。
- P2 的共享 Provider/Application Settings strict Contract、非秘密 ProviderProfile 数据模型、Hono 设置 API、桌面 safeStorage/DPAPI 密钥代理和 Next 同源 BFF 继续作为 P3 的密钥边界；P3 不把完整 API Key 放入任务快照、日志、数据库或浏览器响应。
- API Key 只能作为受控输入短暂经过 BrowserWindow→Next BFF→Hono→Electron 主进程 IPC；持久化仅保留加密密文、credentialRef、版本和末四位。公开 schema、错误、日志和诊断均不得包含完整 Key。
- P4 本地专项：Contract 44/44；前端 unit 11/11、component 17/17；P4 音频审核门禁包含稳定错误码和批准后解锁；完整 backend integration 33 pass/1 外部 Edge skip；阶段 T-G e2e 4/4。
- P4 结论为 `PASS_WITH_EVIDENCE_GAPS`：显式批准仍是唯一人工确认动作，低置信度/公式/高风险页面在批准前不能创建视频任务；真实 Edge、Provider、clean VM、离线 staging、正式 migration runtime、硬崩溃回收和升级回滚仍待外部验证。
- P2 的安全门是本地数据库/API/日志扫描无完整测试 Key，版本冲突、principal 隔离、strict unknown fields、非法 URL、默认 Profile 删除保护和密钥轮换测试通过；若 safeStorage/密钥 IPC 写入失败，设置请求必须失败且数据库不能留下已配置的半成品。
- P1 的 clean VM、完整离线 staging、正式 migration runtime、宿主硬崩溃回收和升级回滚证据仍是后续缺口；不得因为 P2 本机测试通过而宣称可安装发布。

## 2026-08-17 Windows 桌面 P1 本机运行时纵切

- 用户已确认并仅执行 `WINDOWS_DESKTOP_SOFTWARE_PLAN.md` 的 P1。共享业务 Contract 未修改；没有实现设置、API Key、Provider、真实 LLM/Edge TTS、媒体工作流或安装包。
- Next 已启用 standalone 与 monorepo tracing root；Hono 显式监听 `127.0.0.1`，Hono/Worker 在数据库语义检查成功后发送 strict IPC ready，并支持父进程正常停止。BFF 上游只接受无凭据 loopback HTTP URL。
- 后端可生成 production Hono/Worker ESM bundle；FFmpeg/ffprobe 支持由桌面运行时注入绝对路径。现有媒体编码仍硬编码 libx264，尚未迁移到选定 LGPL 候选的 libopenh264，因此不得宣称完整媒体链兼容。
- 本机普通用户的中文/空格路径全纵切已通过：PostgreSQL 18.4 init、Prisma migrate deploy、真实 Hono/Worker/Next standalone、BFF GET、反序停止与临时目录清理。未调用 Provider、TTS 或媒体任务。
- P1 结论为 `PASS_WITH_EVIDENCE_GAPS`，未命中 STOP。仍缺干净 Windows 10/11 VM、无全局依赖的完整 runtime staging、正式 Prisma migration 制品、Electron 单入口对完整 staged runtime 的验证、Job Object/宿主硬崩溃与升级回滚证据。不得把开发仓库 Prisma CLI 探针写成发布运行时已完成。

## 2026-08-17 P0-1 共享 Contract 跨仓库分发门

- `packages/contracts` 增加独立 npm 制品构建与打包脚本；构建前要求 Contract 源目录无未提交改动，并输出 ESM、类型声明和源提交元数据。
- 桌面仓库只携带编译后的版本化 tarball 与 SHA-256 清单，通过 `file:` 依赖使用；Contract 源码仍只在本仓库维护，没有复制后端业务代码或 schema 源。
- 桌面 API 客户端已改用共享 `ApiErrorSchema`，并增加制品哈希、错误 schema 与成功响应 schema 的运行时测试。真实项目、任务和媒体端点仍未接入。
- 本轮范围仍属于 P0-1 收口；不实现 API Key、Provider、受管 PostgreSQL、Worker、LibreOffice、FFmpeg、安装包或生成流程。

> 更新时间：2026-08-17。制品来自 Contract 源提交 `e626e5fb94c442216b92ed504ae4aade84c76e15`，桌面清单固定 SHA-256。Contract 38/38、制品重建、typecheck、0-warning lint、backend:test 13/13 和 Next production build 已严格串行通过；当前 P1 复核中桌面端 17 个测试通过、2 个按环境跳过，lint/build 通过，专用 PostgreSQL、safeStorage 和全运行时探针通过。

## 2026-08-15 仓库拆分与发布

- 当前仓库继续作为网页与共享服务仓库：Next.js 前端、Hono/Worker 后端、共享 Contract、Edge TTS、渲染、验证和产品文档均保留在这里。
- 已创建并发布独立桌面仓库 [`FJH06118/math-avatar-desktop`](https://github.com/FJH06118/math-avatar-desktop)；当前本地工作树已实现 P0-1 与 P1 本机运行时纵切，但变更仍未提交或推送。
- 桌面仓库仍未实现安装包、API 设置页或 Provider 原生适配；P1 的完整离线 staging、正式 migration 制品、宿主硬崩溃回收和升级回滚仍是证据缺口，不得把它们写成已完成。
- 网页仓库当前修复提交已推送到 Draft PR [#1](https://github.com/FJH06118/math-avatar-mvp/pull/1)；PR 保持 Draft，等待后续桌面宿主和 Provider 实现后再决定是否转为 Ready。

> 更新时间：2026-08-15。两个仓库均不包含用户 API Key、真实课件或本地媒体。

## 2026-08-14 代码审查修复（本轮）

- 已恢复正式生成前的逐页人工批准门禁；存在未批准讲稿时，前端不会自动批准或提交生成。
- 已为最终媒体、交付清单、字幕和元数据增加项目作用域校验，BFF 与后端资源读取均要求合法 `projectId`。
- 已修复并发 PAGE_RENDER 的进度终态判断、取消与领取的锁顺序/竞态、渲染输入文件完整性复核、失败任务状态投影，以及解析任务取消后的轮询行为。
- 已修复 `.ppt` 复制资产的扩展名记录，并增加复合渲染音频任务快照一致性校验。
- 本轮仍未实现 Windows 桌面安装包和 Provider 原生适配；真实模式的任务重试快照 API 已补齐，但桌面宿主与 Provider 适配仍属于后续计划。

> 更新时间：2026-08-14。状态：Windows 本地单机软件封装方案已完成规划，尚未开始实现；用户否决五档局部嘴型 Demo 后的 L5 FAIL 与 L6 STOP 继续有效。

## 2026-08-14 Windows 本地单机软件封装规划

- 已审阅仓库第一方文档、源码、契约、迁移、测试、脚本、配置和资产清单，并以当前代码为事实来源完成实施方案：docs/planning/WINDOWS_DESKTOP_SOFTWARE_PLAN.md。
- 用户确认 v1 为 Windows 10/11 本地单机软件：所有课件、讲稿、任务和媒体留在本机，仅大模型 API 与 Edge TTS 需要联网。
- 大模型首发支持 OpenAI、DeepSeek、智谱 GLM、Kimi 和 Anthropic Claude API；语音首发使用 Edge TTS，同时只预留未来 TTS Provider 接口。
- 正式生成前必须人工审核讲稿；首发只提供一个内置数字人；安装包必须捆绑 Node、Python、PostgreSQL、LibreOffice 和 FFmpeg 等运行时。
- 正式容量冻结为单个 PPTX 不超过 100 MB、50 页，预计成片不超过 60 分钟。v1 导出 MP4、SRT 和元数据。
- 自定义数字人、多人协作、云同步、移动端、模板市场、BGM、片头片尾、直播和多家正式 TTS 均不在 v1。
- 当前只完成计划文档，没有新增依赖、数据库 migration、Provider、UI、桌面宿主或安装包。若用户批准实施，必须从计划 P0 开始；不得直接越过当前门禁进入后续阶段。
- 规划文档收口后已严格串行通过 typecheck、0-warning lint、backend:test 13/13 和 Next production build。本轮没有新增专项测试命令，也没有把计划中的未来命令伪装成已存在或已通过。

## 2026-08-13 回退为开口/闭口两态

- 用户人工播放结论覆盖先前静态抽帧结论：五档局部嘴贴片“不自然、太丑”，因此 L5 改判 FAIL，不能宣称已具备进入 L6 的条件。
- 正式 PAGE_RENDER 现只使用既有 `teacher-closed.png` 与 `teacher-open.png` 两张周老师整身图，按 120 ms 闭口 / 100 ms 开口确定性交替；不加载 `avatar-zhou/mouth-v1`，不生成 SMALL/MEDIUM/LARGE/ROUND，也不依赖 word timing 驱动渲染。
- 新 RenderedPage 记录 `avatar-zhou` / `legacy-binary-v1`，`lipSyncTimeline` 与 hash 保持空值。向前兼容 migration 和 L0～L3 研究素材暂留，避免破坏已存在数据库记录；它们不再接入正式渲染。
- 两态专项、25/30 FPS、页面重试、主动取消与缓存复用回归已通过。旧的五档 Demo 入口已移除，旧 MP4/报告仅是失败历史证据，不是当前可验收产物。
- 当前 STOP：不得进入 L6。下一步如需提升自然度，必须先单独批准新的 GPU/生成式或视频驱动方案范围。

## 2026-08-13 数字人唇形增强 L2～L5

- L2 PASS：新增 strict 共享 lip-sync/timing/timeline/avatar 契约和单个向前 migration；历史 AudioSegment timing 为空，历史 RenderedPage 默认 `avatar-zhou` / `legacy-static-v1` 且 timeline 为空，不做破坏性 backfill。
- L3 PASS：固定后端专用 `pinyin-pro@3.28.2`，建立严格 avatar loader 与唯一 CPU 确定性驱动；路径逃逸、PNG/尺寸/alpha/SHA/ROI/bundle 校验、显式 ENERGY_ONLY、ROUND 约束、平滑与失败终态专项通过。
- L4 PASS：AUDIO 原子保存 timing metadata；PAGE_RENDER 正式冻结 avatar/素材/timing/driver 版本，直接从逐句源音频解 PCM，以五个稳定 pose 和 RLE concat 编码。AUDIO 5 pass + 1 opt-in skip，PAGE_RENDER 4/4，最终媒体/HTTP 4/4。
- L5 自动媒体门曾通过，但用户播放后否决自然度，最终人工验收为 FAIL；下列 27.864 秒、62 个词边界和媒体指标仅为历史自动证据，不能覆盖人工结论。
- 先前 7 个静态代表帧抽检未暴露连续播放中的不自然感，事实证明该检查不足；用户播放结论已将其推翻。
- Demo：`backend/work/lip-sync-zhou-demo/final-v4/zhou-lip-sync-demo.mp4`；报告：`docs/reviews/LIP_SYNC_V1_ZHOU_DEMO.json`。
- 当前 STOP：不得开始 L6 林/严老师正式嘴型素材，直到用户明确验收周老师 L5 Demo。

## 2026-08-12 数字人唇形增强 L1 周老师素材

- 用户已确认既有周老师素材可用于本项目及嘴型派生；确认状态、范围和日期已进入 manifest 与机器可读验收报告。
- 已建立 `backend/assets/avatar/catalog.json` 和 `avatar-zhou/mouth-v1`：1254×1254 不可变底图、固定锚点、190×120 嘴部 ROI，以及 `CLOSED/SMALL/MEDIUM/LARGE/ROUND` 五档 RGBA PNG。未修改 UI、公开 API、任务模型、交付格式或生产渲染路径，也未制作林/严老师素材。
- 第一版缩放整个 ROI，100%/400% 审核发现 SMALL/MEDIUM/LARGE 下巴硬接缝，按 STOP 条件停止；经用户明确授权后，仅在原 ROI 内改为“底图 ROI 回填 + 窄嘴部裁剪 + 径向羽化”，没有扩大 ROI 掩盖问题。
- 最终素材自动门禁通过：strict 本地 L1 schema、相对路径安全、PNG 解码/尺寸/alpha/hash、ROI 位于脸部安全框、确定性 bundle fingerprint；五档合成后 ROI 外变化均为 0 像素。
- 100% 与 400% 人工检查通过：没有下巴接缝或肤色跳变，SMALL→MEDIUM→LARGE 开口递增，ROUND 保持独立圆唇形态，未观察到牙齿闪烁。证据见 `docs/reviews/LIP_SYNC_V1_L1_ASSET.json` 及两张预览 PNG。
- L1 收口已严格串行通过 `typecheck`、0-warning `lint`、`backend:test` 13/13 和 Next production `build`；新增素材脚本另通过 Node 语法检查、机器素材验证与 JSON 解析。
- 当前 L1 已具备进入 L2 的条件，但必须等待用户明确确认。下一阶段准确范围仅为最小内部契约与向前数据迁移；不得提前进入 L3 驱动、L5 正式纵切或 L6 另外两位教师素材。

## 2026-08-12 数字人唇形增强 L0 POC

- 本轮只完成 POC 和证据记录，没有修改生产代码、依赖锁文件、UI、公开 API、任务模型或交付格式，也没有开始三位教师的正式嘴型素材制作。
- Edge 边界：三种现有音色对同一公开 17.8～19.1 秒中文金样均得到 49 项合法边界，非标点中文覆盖率 100%，同一 sidecar 重建 1000 次哈希一致；结论 PASS。
- 多句累计：三句解码时长分别为 4224/5232/4968 ms，累计 14424 ms 与 FFmpeg 实际拼接解码时长完全一致；全局边界单调且未越过逐句真实时长；结论 PASS。
- ROUND POC：`pinyin-pro@3.28.2` 临时离线评估为 MIT、零运行时依赖、约 931 KB；9 组、62 个中文音节的上下文拼音与固定圆唇韵母分类均命中 golden。原始数字/拉丁字母/公式符号只允许 unresolved/no-ROUND，须使用既有规范化中文 `spokenText` 才能分类；结论 `PASS_WITH_LIMITATIONS`，不得随机伪造 ROUND。
- `ENERGY_ONLY`：三音色 CPU 解码后均生成四档确定性时间线；480 ms 插入静音最迟 80 ms 闭口，最大相邻步长 1，200 次重建哈希一致，缺失/损坏 sidecar 均显式降级且不含 ROUND；结论 PASS。
- 证据文件：`docs/reviews/LIP_SYNC_V1_POC.json`。当前具备进入 L1 的条件，但下一阶段准确范围仅为素材规范、manifest/catalog 设计和周老师固定底图/局部嘴贴片门禁；周老师真实纵切仍属于后续 L5，林/严老师素材属于周老师纵切通过后的 L6。
- 文档收口后已按 AGENTS.md 严格串行通过 `typecheck`、0-warning `lint`、`backend:test` 13/13 与 Next production `build`。本轮没有新增生产专项命令；计划中的 `test:lip-sync` 等属于后续正式实现，未伪装为 L0 已存在或已通过。

## 2026-08-05 数字人教师形象与预览联动

- 首次实机打开暴露 `Maximum update depth exceeded`：表单预览 effect 把内容相同但引用不同的设置对象反复写回父组件。现以序列化设置键去重，只在内容真实变化时发布预览设置，并新增父组件 state 回写回归测试。
- 保留现有蓝色西装周老师形象，新增同画风的林老师与严老师透明 PNG；三位教师均通过 `Avatar.imageUrl` 从现有严格 Contract 进入前端，不新增跨端字段。
- “数字人教师”选择器展示当前教师头像，展开项展示三位教师的头像、名称和授课风格，文字与图片相邻时图片使用空替代文本，名称仍是可访问标签。
- 工作台把尚未保存及已保存的有效授课设置同步给页面预览；切换教师会立即替换 PPT 预览中的数字人，站位遵循全局左/右设置及逐页左/右/隐藏覆盖。
- 新增组件回归测试，确认页面预览可从林老师切换为严老师，并确认父组件接收预览设置时不会无限更新；修复后完整串行门禁通过：typecheck、0-warning lint、Python 13/13、Contract 29/29、unit 9/9、component 15/15、Next production build、`routes:check` 6/6。
- 实际最终视频渲染仍使用现有阶段 11 的单套口型素材；本轮只承诺用户明确要求的教师选择与画面预览切换，不伪装成三套可驱动口型的正式渲染素材。

## 2026-08-05 `127.0.0.1` 页面交互恢复

- 进一步排查确认，先前只修复“选择文件”按钮控件并不足以解释拖拽和“查看最近项目”同时失效；开发服务器日志显示，从 `127.0.0.1` 打开时，Next.js 阻止了 `/_next/webpack-hmr` 与开发字体等资源，导致 React 未能可靠接管页面。
- 已按仓库内 Next.js 16 `allowedDevOrigins` 指南，将 `127.0.0.1` 加入开发来源白名单。重新启动开发服务后，带相同 Origin 的 `/upload` 请求返回 200，日志不再出现 cross-origin block。
- 上传实现只读取浏览器提供的 `File` 字节；后端的 rename 仅发生在资产目录内部的临时文件与目标文件之间，不包含桌面源路径，也没有删除或剪切桌面文件的代码。
- 内置浏览器控制仍在连接阶段触发既有宿主兼容故障，因此真实点击证据继续如实记为未取得；代码测试、HTTP 与服务日志验证不能冒充浏览器实点验证。
- 完整门禁通过：typecheck、0-warning lint、根 test（Python 13/13、Contract 29/29、unit 9/9、component 13/13）、Next production build、`routes:check` 6/6。

## 2026-08-05 上传文件按钮恢复

- 上传拖拽区内原先只有按钮外观的 `<span>`，文件选择依赖外层 react-dropzone 点击事件冒泡；已替换为真实 `type="button"` 控件，并在直接用户事件中调用 dropzone `open()`。
- 按钮点击会阻止向外层重复冒泡，因此文件选择器只打开一次；拖拽、格式/大小校验和整个上传流程保持不变。
- 专项 component 13/13 通过，新增断言确认“选择文件”按钮会且只会调用一次原生 file input；当前开发服务 `/upload` 返回 200 且包含真实按钮。
- 完整门禁通过：typecheck、0-warning lint、根 test（Python 13/13、Contract 29/29、unit 9/9、component 13/13）、Next production build、`routes:check` 6/6。

## 2026-08-05 三音色真实试听

- 默认 Mock 试听不再返回统一蜂鸣音；清和、致远、明晰分别使用 Xiaoxiao、Yunyang、Xiaoyi 真实中文 Edge TTS 样本，均朗读“生活就像海洋，只有意志坚强的人才能到达彼岸。”
- 三份版本化 MP3 均为 24kHz 单声道、4.5～5.0 秒、27～30KB，平均响度 `-27.4～-20.5 dB`、峰值 `-7.5～-5.3 dB`，SHA-256 各不相同。
- Mock 试听 URL 冻结点击瞬间的 `0.75×～1.50×` 授课语速，并通过播放器 `playbackRate` 应用；真实模式继续将相同语速转换为 Edge TTS rate 交给持久 AUDIO Worker，不会双重加速。
- 正式生成与试听统一音色映射和基准音高：清和 Xiaoxiao `+0Hz`、致远 Yunyang `-2Hz`、明晰 Xiaoyi `+2Hz`。
- 专项已通过：voice-preview unit 2/2、前端 unit 合计 9/9、component 12/12、Stage 11D 音频/试听 5 pass + 1 个原有外部 Edge opt-in skip。
- 完整门禁已通过：typecheck、0-warning lint、根 test（Python 13/13、Contract 29/29、unit 9/9、component 12/12）、Next production build、`routes:check` 6/6。

## 2026-08-04 阶段 11F 最终门禁前状态

- 最终 MP4 除编码、尺寸、FPS、时长、Fast Start、完整解码、非静音、黑帧、逐页覆盖和遮挡策略外，新增平均响度 `-35～-8 dB` 与峰值 `< -0.05 dB` 硬门；指标进入 strict 公共报告。
- VALIDATE 在调用媒体分析器前重新读取候选 MP4 和全部逐页基准帧，复核文件大小与 SHA-256；任何缺失或篡改都会拒绝候选并使任务以 `MEDIA_ASSET_INTEGRITY_FAILED` 终止。
- 专项 4/4：真实三页通过全部硬门；人为 Fast Start 失败被拒绝；候选字节篡改被拒绝；三页 HTTP 全链继续通过 MP4/SRT/元数据、Range/ETag、大小与哈希闭环。
- 成功终态一致为 Task `SUCCEEDED`、MediaOutput `VALIDATED`、Asset `AVAILABLE`、validation/step `passed/SUCCEEDED`；失败终态为 Task `FAILED`、MediaOutput `REJECTED`、Asset `INVALID`。
- P-07“项目包”仍未确认，按路线图默认仅交付版本化元数据、讲稿/场景引用和资产清单；本阶段不宣称完整离线复现工程。
- 最终门禁：typecheck、0-warning lint、根 test（Python 13/13、Contract 29/29、unit 7/7、component 12/12）、Next production build、`routes:check` 6/6 均通过。

## 2026-08-04 阶段 11E 门禁前状态

- PAGE_RENDER 按冻结 page inputHash 复用同项目已验证分页资产，命中前复核 frame/video 大小与 SHA-256；逐页设置只使对应页重新渲染。
- 三页测试确认只修改第 2 页站位时，第二任务仅调用一次渲染 adapter；第 1/3 页复用同一 asset，第 2 页生成新 asset。
- attempt 目录必须全新创建；复用已有目录会拒绝执行，因此旧 frame/page.mp4 不能污染重试。
- 25/30 FPS 三页真实 H.264/AAC `yuv420p` 均通过；保守冻结默认 25 FPS，30 FPS 保留显式选项。基准记录位于 `docs/reviews/STAGE_11E_RENDER_BENCHMARK.json`。
- 阶段 11E 专项 4/4。最大视频时长未确认，因此只声明媒体闭环已测 3 页；阶段 11B 的 10/50/100 页仅代表解析覆盖，不外推视频容量。

## 2026-08-04 阶段 11D 门禁前状态

- Edge TTS 候选在登记前除解码/时长/非静音外，新增 16–48kHz 采样率与峰值削波硬门；稳定错误码区分静音、削波和采样率失败。
- AUDIO Worker 按冻结的输入哈希查找同项目已登记音频，读取前复核文件大小与 SHA-256；命中后复用同一内容寻址 Asset，不再次调用 Provider。
- 字幕 cue 保持连续无重叠，最后 cue 结束时间等于总时长；缓存任务仍生成独立 AudioSegment/Timeline 审计记录。
- 阶段 11D 专项：5 pass、1 个外部 Edge 联网用例 opt-in 跳过；本地真实 FFmpeg 覆盖可解码 24kHz、安全峰值、静音、削波、8kHz 拒绝与缓存零 Provider 调用。

## 2026-08-04 阶段 11C 门禁前状态

- 在现有单次 Provider 调用后增加六个确定性模块审核：内容理解、教学规划、讲稿生成、公式推导、视觉分镜、结果审核；任何模块失败都拒绝持久化。
- Provider payload 仍先按 `unknown` 解析；只允许最多两次受限 JSON 包装修复（去 Markdown fence、提取唯一对象），不修补业务字段或放宽 strict Schema。
- Prompt、Contract 和 model 版本继续写入 revision；离线报告位于 `docs/reviews/STAGE_11C_AGENT_EVAL.json`。
- `eval:agent` 2/2：样本真实分母 4，首次 Schema 2/4（50%），受限修复后 3/4（75%），失败样本仍失败；六模块对三个合法样本均 3/4 分母中的 3 次通过。
- T-C 产品 integration 2/2 回归通过。P-07 未确认时继续沿用所有 revision 均 pending 人工批准，因此 L2/L3 不自动进入生成。

## 2026-08-04 阶段 11B 门禁前状态

- `.ppt` 上传先验证 OLE 复合文档头并登记原始源资产；PARSE Worker 在 attempt 内用独立 LibreOffice profile 转为 `source.pptx`，随后复用同一 strict Contract、原页渲染和持久化路径。
- 合成 1/10/50/100 页课件完整解析并生成连续 1920×1080 原页；包含图片的页面产生“OCR 已延期、人工核对”警告。
- 用户指定的私有 14 页导数金样完整通过 14/14；测试只读取源文件，临时产物位于系统临时目录且已回收，没有提交真实课件。
- 阶段 11B 专项 3/3 通过：四档页数覆盖、真实 `.ppt` 上传→转换→PARSE 全链、14 页金样。

## 2026-08-04 阶段 11B 当前目标

- 验证 1/10/50/100 页 PPTX 的解析覆盖、稳定页码与可解释差异，并增加 14 页导数金样证据。
- 用本机现有 LibreOffice 实现受控 `.ppt`→`.pptx` 转换后再走同一 PPTX 安全校验/解析路径；不安装系统软件、不增加第二套解析器。
- 图片公式 OCR 已获准延期：保留完整原页并产生明确人工核对警告，不实现或伪装 OCR。
- 本阶段不处理阶段 11C Agent、11D 音频、11E 渲染或 11F 媒体。

## 2026-08-04 阶段 11A 完成与 11B STOP

- 阶段 11A 完整串行门禁通过：typecheck、0-warning lint、根 test（Python 13/13、Contract 28/28、unit 7/7、component 12/12）、Next production build、`routes:check` 6/6。
- 阶段 11A 专项通过：T0 7/7；产品恢复/T-B 8/8。覆盖真实子进程 kill、重试上限、并发 outbox 重放、lease 接管、活动取消与孤儿资产 dry-run/显式清理。
- 进入阶段 11B 前必须确认 P-11：图片公式 OCR 是否允许从 Web MVP 延期。当前未获批准，按路线图仍是 MVP 必需能力，因此不得静默跳过或继续 11B～11F。
- 本机已有 `C:\Program Files\LibreOffice\program\soffice.com`，但不在 PATH；`.ppt` 转换可在 P-11 决定后先用现有 LibreOffice 做受控 POC，无需立即安装系统软件。

## 2026-08-04 阶段 11A 门禁前状态

- 新增本地资产对账器：默认只报告，按数据库 Asset 清单复核文件存在性、大小与 SHA-256；仅在显式启用删除且超过宽限期时清理 `assetRoot/projects` 下未登记普通文件，符号链接不跟随也不删除。
- 新增产品恢复专项：同一 outbox 三次并发投递只产生一个稳定 step；模拟 Worker 丢失后租约接管为不可变 attempt 2，真实 PARSE 完成后仍只有一个 task、一个 step、3 个原页资产。
- T0 迁移回归由陈旧的 9 条固定清单修正为当前 12 条向前迁移，并在隔离 schema 中逐条 fresh/forward 应用。
- 专项门禁通过：T0 7/7（含真实子进程 kill、取消/完成竞态、重试上限），产品恢复与 T-B 8/8（含重复投递、lease 接管、活动取消和孤儿对账）。

## 2026-08-04 阶段 10 完成状态

- 完整串行门禁通过：typecheck、0-warning lint、根 test（Python 13/13、Contract 28/28、unit 7/7、component 12/12）、Next production build、`routes:check` 6/6。
- 阶段 10 的静态审查结论为 READY；浏览器宿主故障造成的 2 项动态 unknown 仍如实保留，不计为已验证证据。
- 阶段 11A 本轮唯一目标：补齐产品 outbox/lease/重复投递/取消竞态/Worker kill-retry 与本地孤儿资产对账证据；不改 UI、Contract 或媒体格式。

## 2026-08-04 阶段 10 门禁前状态

- `ui-audit` 对 main diff 的项目列表、上传、解析、工作台、生成、结果、错误/加载状态执行 24 项规则；修复前发现真实视频缺少 WebVTT track 的发布阻塞项和路由错误恢复/任务加载布局缺口。
- 新增按最终 task/principal 授权的 SRT→WebVTT 只读端点；源 SRT 读取前复核大小/SHA，BFF 只转发安全响应头，结果页使用 `<track kind="captions">`。
- 新增 App Router `error.tsx`，错误标题自动聚焦并提供重试/返回列表；解析/生成首次加载改为与最终工作流等高的 skeleton。
- 修复后审查 JSON 位于 `docs/reviews/STAGE_10_UI_AUDIT.json`：0 blocker、0 sprint、0 backlog、2 unknown，静态 verdict READY。
- 浏览器技能仍在连接时触发宿主 `Cannot redefine property: process`，因此颜色对比、实际 Tab 顺序、桌面/移动截图与 CWV 未验证；该证据缺口没有被写成 pass。
- 专项通过：component 12/12、三页 T-G E2E 1/1（含 VTT 与跨 principal 404）、typecheck、0-warning lint。

## 2026-08-04 阶段 9 门禁前状态

- 结果页用最终 VALIDATE task 同时读取 FinalMedia、DeliveryManifest 与 Task，映射真实受控 MP4、SRT、元数据、时长、大小和生成时间。
- 播放与下载 URL 均为同源 BFF 地址；每次下载重新读取 manifest，刷新清单不会创建任务或触发重渲染。
- 页面展示 H.264/AAC、像素格式、FPS、完整解码、Fast Start、非静音、黑帧、页面覆盖和遮挡安全的服务端验证报告。
- MP4/SRT/元数据提供独立下载错误与重试；SRT 不伪装成浏览器原生 WebVTT track。
- 专项通过：component 12/12、三页 T-G E2E 1/1，覆盖 full/range/ETag、大小/SHA、跨 principal 404 与 manifest 刷新任务数不变；typecheck 通过。
- 本地 HTTP 交付没有到期签名 URL；“续签”语义在阶段 9 表现为重新读取授权 manifest，不绑定对象存储。

## 2026-08-04 阶段 8 门禁前状态

- 生成页在真实模式从持久 AUDIO task 开始，只有服务端成功终态才幂等创建 PAGE_RENDER，再创建 COMPOSITE/VALIDATE；浏览器不执行媒体工作。
- 当前任务、audioTaskId、renderTaskId 写入 URL；重挂载直接恢复并轮询当前任务，不重复创建首段任务。
- Task 公共投影新增真实运行 step 的 currentSlideId；UI 展示服务端工作单元、错误码派生的可重试性、取消、失败阶段重启和上游冻结任务 ID。
- 失败重启使用新的、确定范围的幂等键创建同阶段任务；既有内容寻址资产仍由后端唯一约束去重，旧 attempt/任务审计保留。
- 专项通过：frontend unit 7/7、component 11/11、T-D task projection/settings/preview integration 3/3、三页 T-G HTTP 全链路 1/1、typecheck。
- 浏览器控制插件仍因本机运行时错误不可用，实机重挂载点击验证仍是证据缺口；真实 Edge 联网探针仍为 opt-in。

## 2026-08-04 阶段 7 门禁前状态

- Project settings 已进入 PostgreSQL JSON 字段并使用项目 version 做乐观并发；语速、字幕样式、全局站位和逐页 left/right/hidden override 可刷新恢复。
- 真实试听通过单句持久 AUDIO task、既有 Edge TTS Worker 和受控同源音频端点完成；Worker 仍执行解码、时长与非静音硬校验，浏览器响应不暴露路径或 storage key。
- Mock 试听已改为真实 HTTP MP3 fixture，组件不再用纯计时器冒充播放。
- 分页渲染冻结逐页站位；明确 hidden 的页面不会合成数字人，其他候选继续使用阶段 T 已验证的右侧安全面板。
- 专项检查通过：Contract 28/28、component 10/10、Stage T-D settings/preview integration 3/3（另 1 个外部 Edge opt-in 跳过）、Stage T-E render integration 2/2、typecheck 通过。
- 外部真实 Edge TTS 联网探针仍保持 opt-in，本轮没有外发项目内容；浏览器控制插件的运行时兼容错误仍使实机视觉证据缺失。

## 阶段 11A 预定目标（仅在阶段 10 完整门禁通过后进入）

硬化 outbox、lease、重复投递、取消竞态、Worker kill/retry 和孤儿资产对账；不得跳过失败的恢复门禁进入 11B。阶段 11A 不改变 UI 或媒体格式。

## 2026-08-04 阶段 6 门禁前状态

- 工作台真实模式通过 workspace snapshot 读取原页、解析数据、当前 revision、批准状态与锁定状态；默认预览直接使用受控原页资产。
- `LessonPlan.isLocked` migration 已应用；锁定/解锁使用 expected revision，锁定页修改与陈旧 revision 均返回 409。
- 用户修改讲稿只创建该页的新不可变 revision；真实集成测试确认其他页面 output hash 不变。
- 无初始 revision 时，工作台可显式创建或恢复持久 PLAN task，并展示服务端真实工作单元；占位讲稿不能进入生成。
- 生成确认动作会先显式批准所有待批准 current revision；页面保存冲突不会静默覆盖。
- 专项检查通过：Contract 27/27、workspace component 9/9、真实 PLAN/revision/workspace integration 2/2，typecheck 与 0-warning lint 通过。
- 浏览器控制插件此前因本机 `Cannot redefine property: process` 无法启动，桌面/移动实机视觉检查仍是证据缺口；不把它记作已通过。
- 完整门禁已通过：typecheck、0-warning lint、根 test（Python 13/13、Contract 27/27、unit 6/6、component 9/9）、production build、`routes:check` 6/6。

## 阶段 7 当前目标

在阶段 T 的真实 AUDIO/渲染边界上接入设置持久化、真实可解码试听、语速/字幕，以及逐页数字人候选站位和允许隐藏；不绑定生产 TTS、不建设自定义数字人上传、不做音素级口型或额外画幅。

## 2026-08-04 历史暂停续接点

- 阶段 5 完整门禁已通过：typecheck、0-warning lint、根 test、production build、`routes:check` 6/6。
- 阶段 6 已开始：增加 workspace Contract、原页默认预览、真实 revision 工作台快照、页面锁定字段/migration、锁定 API/BFF/adapter、真实讲稿修订映射，以及批准后再进入生成的前端接线。
- `20260804203000_stage_6_workspace_locks` migration 已成功应用，Prisma Client 已重新生成。
- 当前最后一次 `npm.cmd run typecheck` **失败**，只剩 `frontend/src/lib/api/mock-client.ts` 的 4 个 Mock `ParsedSlide` fixture 尚未补齐新增必填字段：`derivationSteps`、`sceneCount`、`isLocked`。
- 下一次从修复上述 4 个 fixture 开始；随后重新运行 typecheck，再补阶段 6 Contract/component/integration 测试。阶段 6 的 lint/test/build/routes 门禁均尚未执行，不得宣称完成或进入阶段 7。
- 工作树包含阶段 3～6 的连续未提交改动；全部保留。未 commit、未 push。

## 当前阶段与本轮唯一目标

阶段 3“首页与项目列表”：在不重做现有首页视觉的前提下，让搜索、状态筛选、复制、归档和删除使用统一 Project Contract，并让显式 `stage-t` adapter 在真实 PostgreSQL 中完成项目生命周期操作。

## 已实现

- Project Contract 新增 `archived`、列表查询、复制幂等输入、乐观版本输入和严格公共响应 Schema。
- 产品数据库增加向前 `ARCHIVED` 生命周期 migration；没有破坏性 down migration。
- Hono 私有服务新增项目列表、单项目读取、复制、归档和删除端点：
  - 每次请求重新检查 internal token 与 principal；
  - 默认列表隐藏归档项目，搜索与状态过滤经过 strict Contract；
  - 复制重新读取并校验源课件大小/SHA-256，在新项目命名空间创建源资产和 PARSE task；
  - 归档/删除使用 `expectedVersion`，陈旧版本返回 409；
  - 有活动任务的项目拒绝归档和删除；跨 principal 统一返回 404。
- Next BFF 只转发公共 Project Contract，不暴露 token、principal、后端地址、storage key 或磁盘路径。
- 前端项目列表保留现有视觉结构，新增搜索、状态筛选、复制、归档、删除、成功/失败/重试和无匹配结果状态；Mock 与真实 adapter 走相同函数边界。
- `.pptx` 上传仍按阶段 4 接线；阶段 3 的“新建课程”继续进入既有上传页，不在本阶段重做上传流程。

## 明确不处理

- 不处理阶段 4 上传扩展、阶段 5 解析页、阶段 6 审核工作台、阶段 7 设置/试听、阶段 8 任务页、阶段 9 结果页或阶段 10 E2E。
- 不实现正式认证、团队权限、对象存储、OCR、生产 Provider 或部署。
- 不 commit/push，不覆盖本地 `main` 已领先的 15 个提交。

## 阶段 3 专项证据

```powershell
npm.cmd run test:contracts
npm.cmd run test:unit
npm.cmd run test:components -- projects
npm.cmd exec --workspace @ppt-digital-human/backend -- tsx --test app/stage-3-projects.integration.test.ts
```

当前结果：Contract 22/22、unit 5/5、component 6/6、真实项目 integration 2/2；typecheck 与 0-warning lint 快速检查通过。

## 阶段 3 完整门禁结果

已严格串行运行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

结果：typecheck 0 error；lint 0 warning；根 test 中 Python 13/13、Contract 22/22、unit 5/5、component 4/4；Next production build 成功并收集新增项目 BFF 路由；`routes:check` 6/6 且服务回收。浏览器插件因本机运行时兼容错误未能建立控制连接，桌面/移动视觉实机检查未执行，不计为根门禁通过证据。

## 阶段 4 当前目标

把既有上传页从“Mock 上传 → Mock 创建项目 → Mock 解析任务”增量接到阶段 T 的真实 multipart 上传边界，补齐中文名、100 MiB、MIME/结构、取消、幂等、损坏/加密/超限和断网错误；`.ppt` 必须返回稳定的“转换能力未就绪”，不得伪装解析成功。

阶段 4 不进入解析页数据接线（阶段 5），不在浏览器解包 PPT，不实现 `.ppt` 转换、对象存储、分片上传或生产认证。

## 阶段 4 已实现

- 上传 Contract 同时接受严格匹配扩展名/MIME 的 `.pptx` 与 `.ppt`，拒绝伪装 MIME、未知字段和超过 100 MiB 的声明。
- Hono 在持久化前复核真实字节大小；PPTX 继续检查 ZIP 必需结构、加密标记、条目数与展开体积。
- 加密 PPTX 返回 `ENCRYPTED_PPTX` 与取消密码保护提示；损坏 PPTX 返回 `INVALID_PPTX_STRUCTURE`。
- `.ppt` 请求真实到达服务端并检查 OLE 头，然后稳定返回 `PPT_CONVERSION_UNAVAILABLE`，明确要求另存为 `.pptx`；不创建伪 PARSE task。
- 显式 `stage-t` 上传页直接使用真实 multipart adapter 的 Project/Task 收据，不再串联 Mock upload/create/job；同一次选择的失败重试复用幂等键，取消会 abort 真实请求且保留文件。

专项结果：Contract 23/23；`test:components -- upload` 6/6；真实 upload integration 6/6；快速 typecheck 与 0-warning lint 通过。

完整门禁结果：typecheck 0 error；lint 0 warning；Python 13/13、Contract 23/23、unit 5/5、component 6/6；Next production build 与 `routes:check` 6/6 全部通过。

## 阶段 5 当前目标

把阶段 T 的真实 PARSE task、稳定 slideId、真实页数、原页资产和解析警告接入现有解析页面。真实 adapter 的进度只来自服务端工作单元；原页缺失必须阻断或显示可审计错误，不能用重排文字页冒充。

阶段 5 不调用 LLM，不在浏览器解析 PPT，不修改阶段 6 审核表单或阶段 7～9 媒体页面。

## 阶段 5 已实现

- 新增严格解析快照 Contract：真实 PARSE task、稳定 slide ID、连续页码、公式数量、置信度、解析警告与同源原页预览 URL。
- Hono 新增解析快照与原页预览端点；每次请求重新鉴权并按 principal 隔离，原页读取前复核大小与 SHA-256，公共响应不暴露磁盘路径或 storage key。
- 缺失原页资产返回可审计的 `ORIGINAL_PAGE_NOT_FOUND`，不会用重排文本页冒充原页。
- Next BFF 只白名单转发解析 Contract 与安全图片响应头；真实 adapter 可读取解析快照。
- 解析页把真实 task 工作单元映射为唯一真实阶段，不伪造多阶段进度；完成后保留在核对页展示原页、公式数量、置信度与警告，由用户显式进入工作台。
- 真实模式不伪造服务端重试；取消/失败明确要求重新上传创建新任务。

专项结果：Contract 25/25，frontend unit 6/6，component 7/7，真实 PostgreSQL parse integration 6/6。完整门禁结果将在本阶段结束后补记。
