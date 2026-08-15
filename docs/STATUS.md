# 项目状态

## 2026-08-14 代码审查修复（本轮）

- 前端：生成按钮现在受逐页批准门禁约束；计划重试使用新的幂等 token，真实任务重试调用服务端快照复制接口；解析失败/取消后停止无意义轮询；上传拖放区不再制造嵌套交互语义。
- 后端：结果媒体、交付清单、字幕、元数据和资产内容均按 `projectId` 做服务端归属校验；并发分页渲染按事务内已提交页面数判断终态；取消与 claim 使用一致的 step→task 锁顺序；claim 不会重新领取已请求取消的任务。
- 完整性：PARSE/PAGE_RENDER 在读取源文件前复核文件大小与 SHA-256；COMPOSITE 校验音频任务快照；失败任务投影为 `failed`，不会被误显示为可交付。
- 已验证：组件测试 16/16、Stage 11A 专项 9/9、Stage 11E 专项 4/4、Stage 11F 集成测试 4/4 已通过；typecheck、lint、backend:test、contracts/unit/build/routes 也已串行通过。
- 未完成项保持诚实记录：Windows 安装包/桌面宿主、Provider 原生适配，以及 GitHub PR 的 CI/审查仍未完成；真实任务重试已改为服务端复制原始 outbox 快照。

## 2026-08-14 Windows 本地单机软件封装规划

- 已完成仓库级现状审计和 Windows 软件封装实施计划，计划文件为 docs/planning/WINDOWS_DESKTOP_SOFTWARE_PLAN.md；本轮只写规划，没有实现桌面宿主、设置页、Provider、工作流或安装器。
- 已确认首发边界：Windows 10/11 本地单机、用户自配 OpenAI/DeepSeek/GLM/Kimi/Anthropic API、Edge TTS、强制讲稿审核、单一内置数字人、一键捆绑运行时、100 MB/50 页/60 分钟上限，以及 MP4/SRT/元数据交付。
- 计划复用现有 Next BFF → Hono → PostgreSQL/outbox → Worker 的真实纵切，推荐 Electron + Next standalone + 受管 PostgreSQL；不围绕旧 JSON CLI 重建第二套产品链。
- 计划识别的主要发布缺口为：默认 Mock、无用户设置和安全密钥存储、Provider 适配不足、生成阶段仍由浏览器串联、UI 设置与最终渲染不一致、无一键运行宿主、无安装/升级/卸载链路，以及只完成三页视频容量验证。
- 当前唇形事实不变：五档方案 L5 FAIL，生产仍为开/闭口两态，L6 STOP 继续有效。软件计划不授权恢复五档嘴型或制作其他教师素材。
- 计划文档完成后按项目规则严格串行通过 typecheck、0-warning lint、backend:test 13/13 和 Next production build；本轮没有新增或运行计划中尚不存在的桌面专项命令。

## 2026-08-13 五档唇形被用户否决并回退

- 用户人工验收判定五档局部嘴型 Demo 不自然，故此前 L5 PASS 已失效，当前准确结论为 L5 FAIL。
- 正式 PAGE_RENDER 已回退为 `teacher-closed.png` / `teacher-open.png` 两张周老师整身图的机械两态切换；渲染版本为 `stage-te-binary-mouth-v1`，素材审计版本写为 `legacy-binary-v1`。
- 五档素材、严格契约、驱动核心和向前 migration 作为未接线的研究/兼容代码保留；新分页渲染不保存 lip-sync timeline。旧五档 Demo 与报告只保留失败证据属性。
- 本轮未开始 L6，未制作林老师或严老师正式嘴型。

## 2026-08-13 数字人唇形增强 L2～L5

- 以下内容是用户播放前的历史自动门记录；用户已否决自然度，因此不再代表当前验收结论。
- L5 使用 `BOUNDARY_ENERGY`，无降级：27,864 ms、62 个真实 word boundary、覆盖率 0.788257；CLOSED/SMALL/MEDIUM/LARGE/ROUND 帧数为 144/56/80/163/254，ROUND 占发声 pose 0.459313。
- 最终 MP4 为 1920×1080、25 FPS、H.264/AAC、yuv420p、Fast Start，可完整解码；视频/音频/时间轴最大误差 16 ms，平均响度 -19.6 dB、峰值 -3.3 dB。时间轴重复重建 hash 完全一致。
- 7 个代表帧人工检查通过，人物区域和课件区域隔离，无整体闪烁或明显嘴部接缝；等待用户播放验收。L6/L7/L8 未开始。

> 更新时间：2026-08-12。代码和 Git 状态是事实来源；文档与代码冲突时，以代码为准并在这里记录。

### 2026-08-12 数字人唇形增强 L1 周老师素材

- 用户确认 `teacher-closed.png`/`teacher-open.png` 对应的周老师素材可用于项目和派生嘴型；`avatar-zhou/mouth-v1` manifest 记录确认范围、源 SHA、画布、锚点、脸部安全框、嘴部 ROI、各文件 SHA/尺寸/alpha 和确定性 bundle fingerprint。
- L1 仅新增素材清单、周老师固定底图与五档局部嘴贴片、构建/验证/审核图脚本和证据；没有接入生产驱动、数据库、Worker、前端 UI、公开 API 或交付格式，没有制作另外两位教师素材。
- 初版候选因整个缩放块边界在下巴形成接缝而未通过人工门；用户授权修复后改为底图回填的窄嘴部裁剪和径向羽化，保持既定 `190×120 @ (590,350)` ROI，不通过扩大 ROI 隐藏问题。
- `node backend/assets/avatar/validate-avatar-assets.mjs` 通过 strict 本地 L1 schema、路径逃逸、PNG 解码/尺寸/alpha/hash、脸部安全框、确定性 fingerprint 和 ROI 外逐像素门禁；CLOSED/SMALL/MEDIUM/LARGE/ROUND 的 ROI 外变化均为 0。
- 最终 100%/400% 审核图人工通过：无硬接缝、肤色跳变或牙齿闪烁风险，三档张口幅度递增且 ROUND 可区分。机器可读证据为 `docs/reviews/LIP_SYNC_V1_L1_ASSET.json`，bundle fingerprint 为 `c86ddb2aabb5b8165cd2c0eb1ca3d5adaa15de227baa1fc84450f9eeca78e2a8`。
- L1 收口门禁严格串行通过：typecheck、0-warning lint、Python 13/13、Next production build；素材构建/预览脚本通过 Node 语法检查，机器验收 JSON 可解析。
- L1 结论 PASS，具备在明确确认后进入 L2 的条件；L2 只允许最小内部契约和向前数据迁移，不能顺带实现 L3 驱动、L5 产品纵切或 L6 林/严老师素材。

### 2026-08-12 数字人唇形增强 L0 POC

- 严格停留在 `docs/planning/LIP_SYNC_ENHANCEMENT_PLAN.md` 的 L0：未修改生产音频/渲染路径、前端 UI、公开 API、任务模型或交付格式，未制作三位教师正式嘴型素材；全部分析为 CPU-only。
- `node-edge-tts@1.2.10` 对三种现有正式音色的 17.8～19.1 秒公开中文金样均生成 49 项合法 word-boundary，82 个非标点汉字覆盖率均为 100%；同一 sidecar 重建时间线 1000 次哈希一致。当前生产子进程仍保持 `saveSubtitles: false`，本轮没有提前接入。
- 三条独立句音频按解码 PCM 真实时长 `4224 + 5232 + 4968 = 14424 ms` 累计；FFmpeg 实际拼接解码时长同为 `14424 ms`，误差 `0 ms`。页级偏移没有按文字长度猜测。
- `pinyin-pro@3.28.2` 仅安装到系统临时目录：MIT、零运行时依赖、解包约 931 KB；9 组高数/多音字/公式朗读金样共 62 个中文音节，拼音和固定 ROUND 分类均 62/62。原始数字、拉丁字母和公式符号不会自动得到音节，必须使用规范化中文 `spokenText`，否则局部标记 unresolved 且不得触发 ROUND。
- 无边界时，三音色真实音频均能生成只含 `CLOSED/SMALL/MEDIUM/LARGE` 的确定性 `ENERGY_ONLY` 时间线；插入 480 ms 静音后最迟 80 ms 闭口，恢复发声为 0 ms，最大相邻开合步长为 1，200 次重建哈希一致且无 ROUND。缺失、空、越界、逆序等 6 类 sidecar 均明确降级，未伪造边界。
- 机器可读证据见 `docs/reviews/LIP_SYNC_V1_POC.json`。L0 总结论为 PASS，未命中 STOP，具备进入 L1 的条件；下一阶段只允许建立“固定底图 + 嘴部局部贴片”的素材规范与周老师素材门禁，不进入驱动、数据库、Worker、正式渲染或另外两位教师素材制作。
- L0 文档收口后的项目门禁按 AGENTS.md 严格串行通过：typecheck、0-warning lint、Python 13/13、Next production build。L0 尚未新增正式专项脚本，因此没有虚构或运行计划中只属于 L2～L8 的 `test:lip-sync`/媒体集成命令。

### 2026-08-05 三位数字人教师与即时预览

- 实机首次加载发现预览设置回调形成父子组件无限更新；已按内容键去重，等值设置不再回写，并增加带父组件 state 的回归用例。此前完整门禁不能替代这条实机证据，状态文档已据此纠正。
- 新增林老师、严老师两份同画风透明数字人素材，并复用原有蓝色西装素材作为周老师；Mock Avatar 数据补齐项目内 `imageUrl`。
- 教师选择器现在可见头像；有效表单值会即时驱动 PPT 页面预览的教师形象与左/右/隐藏站位，无需等待 700ms 自动保存完成。
- 组件回归覆盖林老师到严老师的预览替换和父组件 state 回写；修复后完整串行门禁通过：typecheck、0-warning lint、Python 13/13、Contract 29/29、unit 9/9、component 15/15、Next production build、路由 6/6 与服务回收。内置浏览器控制仍受既有宿主初始化故障阻塞，未把桌面/移动端实点与截图记作通过。
- 本轮没有生成开口/闭口双帧或改变正式渲染 adapter；最终视频仍是原单套口型素材，避免把静态预览素材误报为完整数字人驱动能力。

### 2026-08-05 `127.0.0.1` 开发页面交互恢复

- 此前把上传失效完全归因于非交互 `<span>` 的判断不完整：选择按钮虽然已改为真实控件，但上传、拖拽和首页“查看最近项目”共同失效的主因是 Next.js 开发资源跨来源保护。
- `frontend/next.config.ts` 现按本地 Next.js 16 官方指南允许 `127.0.0.1` 访问开发资源。服务以新配置重启后，`/upload` 返回 200，日志不再报告 `Blocked cross-origin request`。
- 上传边界不会移动或删除用户源文件；桌面只读检查确认 `C:\Users\Fangjunhao\Desktop\test.pptx` 仍存在。若用户指的是其他文件，需要按准确文件名继续只读定位。
- 内置浏览器控制仍受宿主 `process` 属性初始化故障阻塞，未把真实点击记为通过。
- 完整串行门禁通过：typecheck、0-warning lint、Python 13/13、Contract 29/29、unit 9/9、component 13/13、Next production build、路由 6/6 与服务回收。

### 2026-08-05 上传文件按钮恢复

- 上传页“选择文件”由按钮外观的非交互 `<span>` 改为真实按钮，直接调用 react-dropzone `open()` 并停止重复冒泡；拖拽区域行为不变。
- component 13/13 通过，新增“原生文件选择只触发一次”回归；运行中的 `/upload` 已返回包含真实按钮的新页面。
- 完整串行门禁通过：typecheck、0-warning lint、Python 13/13、Contract 29/29、unit 9/9、component 13/13、Next production build、路由 6/6 与服务回收。

### 2026-08-05 三音色真实试听与语速联动

- 默认网页的统一蜂鸣 Mock 已替换为三份版本化真实中文 MP3：清和/Xiaoxiao、致远/Yunyang、明晰/Xiaoyi，文案统一为“生活就像海洋，只有意志坚强的人才能到达彼岸。”
- Mock 在点击试听时冻结当前 `speechRate` 并设置音频 `playbackRate`；真实模式把同一值转换为 Edge rate 进入持久 Worker。试听与最终生成共享 voice/pitch 映射。
- 三份文件经 ffprobe/FFmpeg 验证为可解码 24kHz 单声道 MP3，时长、响度、峰值均有效且哈希互异。Python `edge-tts` 7.2.8 只临时安装到系统临时目录用于生成样本，没有写入项目或系统 Python 依赖。
- 专项通过：前端 unit 9/9、component 12/12、Stage 11D 5 pass；原有外部 Edge opt-in 用例仍按设计跳过。
- 完整串行门禁通过：typecheck、0-warning lint、Python 13/13、Contract 29/29、unit 9/9、component 12/12、Next production build、路由 6/6 与服务回收。

## 当前基线

- 分支：`main`。
- 目录重组、依赖调整、后端原型和详细资料已经按拆分方案提交；提交历史以 `git log --oneline` 为准。
- 本地 `main` 当前相对 `origin/main` ahead 15，尚未执行 push；阶段 T 已在提交 `181a41a` 收口。当前工作树只包含阶段 3 实现与文档更新，未 commit/push。
- 阶段 3～11 的实现和文档均位于当前未提交工作树；阶段 11F 专项 4/4 与最终完整串行门禁均已通过。未经用户要求未 commit/push。
- 当前仓库包含 `frontend/`、`backend/`、`packages/contracts/` 和 `docs/` 四个主要工作区；根目录保留工作区级脚本和配置。
- 页面默认仍使用浏览器内存 Mock；显式 `NEXT_PUBLIC_PPT_DH_API_MODE=stage-t` 已具备 BFF/Hono/PostgreSQL/Worker/受控交付真实纵切。阶段 3 已把首页项目列表和项目生命周期接入同一真实 adapter。
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
- Edge TTS、SRT 字幕、Sharp 分页渲染、逐页数字人设置、FFmpeg H.264/AAC 视频合成和完整媒体硬门。
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

### 阶段 T-A 真实产品入口

- Hono 私有 application service 与 Next Route Handler BFF 已实现真实 multipart PPTX 上传和持久任务查询；页面默认 adapter 仍为 Mock。
- 产品 PostgreSQL migration 新增 Project、Asset、Presentation、GenerationTask、TaskOutbox 和 GenerationTaskStep，不复用 T0 业务表；上传事务同时创建任务快照和 outbox。
- 上传在 BFF 与 application service 双重验证；私有服务检查大小、MIME、ZIP 中央目录、加密标志、解压规模、PPTX 必需结构和 SHA-256。
- 同 principal/同幂等键/同 payload 返回同一 task；不同 payload 返回 409；跨 principal 查询返回 404。公共响应扫描未发现路径、storage key、密钥或堆栈。
- 已从私有 14 页业务课件生成 Git 忽略的前三页副本，源文件未修改；强制 rules planner prepare 得到 3/3 页、3 场景和 3 张 LibreOffice 原页 PNG，无 Provider 调用或渲染错误。
- `test:integration` 3/3、更新后的 Contract 8/8、前端 unit 2/2、T0 回归 7/7 已通过；完整串行门禁仍在本轮文档更新后执行。

### 阶段 T-B 产品 PARSE Worker

- 产品 outbox dispatcher、PostgreSQL lease Worker、heartbeat、租约接管、不可变 TaskStepAttempt、排队/运行中取消均已实现。
- Python/LibreOffice 在 attempt 隔离目录运行；`parsed-deck.json` 先通过严格 Zod，再检查页数、PNG 数量和 1920×1080 格式。
- stable Slide、内容哈希 `SLIDE_RENDER` Asset 和每页真实进度已持久化；私有三页业务切片得到 3/3 Slide/Asset、Task SUCCEEDED、Presentation COMPLETED。
- 漏页注入是非重试硬失败，错误码为 `ORIGINAL_PAGE_COUNT_MISMATCH`，不登记 Slide/原页 Asset，也不生成文本回退页。
- `test:integration` 已扩展为 9/9；`t0:test` 7/7 同时验证四个 migration 的 fresh/forward 应用。

### 阶段 T-C 单 Agent、修订与批准

- strict `stage-tc-agent-v1` Contract 要求逐页精确覆盖，拒绝未知字段、重复/漏页、跨页 Overlay；Provider payload 一律先按 `unknown` 验证。
- 第五个向前 migration 已持久化 LessonPlan、不可变 LessonPlanRevision、PlannedScene 及批准审计；PLAN task/outbox/lease Worker 沿用 T-B 恢复语义。
- Hono/Next BFF/真实 adapter 已提供创建 PLAN task、读取当前修订、用户新修订和显式批准边界；页面默认仍为 Mock。
- 用户于 2026-08-04 批准仅外发私有三页的提取文本、备注和公式候选；真实 DeepSeek V4 Flash 在两次旧结构被 strict 拒绝后，通过修正后的唯一模板生成 3/3 Revision/Scene。PPTX、PNG、路径和 storage key 未外发。
- 专项验证：Contract 12/12；T-A～T-C integration 11/11；T0 7/7，含五个 migration fresh/forward。

### 阶段 T-D 逐句音频与真实字幕时间轴

- strict AUDIO Contract 已覆盖创建请求、逐句音频、SubtitleCue 与 AudioTimeline；TaskKind 包含 `AUDIO`。
- 第六、七个向前 migration 持久化 AudioSegment、SubtitleCue、AudioTimelineRecord，并允许同一 slide 拥有多个句级 AUDIO step。
- AUDIO task 只消费所有 current 且已批准的 revision，并冻结 revision/narration、展示/朗读文本、voice/rate/pitch 与输入哈希。后续修订不改变已创建任务。
- dispatcher/lease Worker 支持句级稳定 step、heartbeat、接管、取消和只重试失败句；Edge TTS 在可终止子进程中运行。
- MP3 经大小、音频流、实际时长和非静音检查后才登记内容寻址 Asset；最终事务生成连续无重叠 SubtitleCue、SRT 与 AudioTimelineRecord。
- Hono、Next BFF 和真实 adapter 已提供 AUDIO 创建与时间轴读取；页面默认仍为 Mock。
- 专项验证：Contract 14/14；T-A～T-D integration 13/13；T0 7/7，含七个 migration fresh/forward；公开占位句真实 Edge TTS 验证 1/1，未外发项目私密数据。

### 阶段 T-E 分页视频渲染

- Render Contract 与第八个向前 migration 已增加 RenderedPage、25/30 FPS、PAGE_FRAME/PAGE_VIDEO Asset 和逐页 lineage。
- GENERATE/PAGE_RENDER task 冻结成功 AUDIO task、current approved revision、原页/音频哈希、Overlay、时长、FPS 与渲染器版本；后续修订不影响已创建任务。
- 每页稳定 lease step 支持 heartbeat、接管、取消和只重试失败页；Sharp/FFmpeg 真实生成 1920×1080 H.264/AAC `yuv420p` 分页视频。
- 原页在 1500×844 区域完整 contain，数字人位于独立右侧面板；highlightBox/arrow 之外的 Overlay 在阶段 T 硬拒绝。
- 专项验证 2/2：3/3 真实分页视频、第二页单页重试、活动取消无半成品。

### 阶段 T-F 最终合成与媒体硬验证

- 新增 strict 合成/最终媒体 Contract、第九个向前 migration、`MediaOutput` 与不可变 `MediaValidationRecord`。
- COMPOSITE 成功只登记候选视频并转入独立 VALIDATE step；验证完成前任务保持非终态，硬门失败会拒绝候选并使任务失败。
- 真实 FFmpeg 合成固定为 1920×1080、25/30 FPS、H.264/AAC、`yuv420p`、Fast Start，并烧录全局 SRT。
- 媒体硬门覆盖完整解码、编码/像素/FPS/尺寸、时长、平均响度、峰值、非静音、黑帧、3/3 页面图像覆盖及右侧数字人面板不遮挡原页/字幕安全区；验证前复核候选视频和基准帧的大小与 SHA-256。
- 专项验证 2/2；全量后端 integration 为 17 通过、1 个外部 Edge 用例按设计跳过；T0 7/7 验证九个 migration。

### 阶段 T-G 受控交付与纵向验收

- strict Delivery Contract 输出 MP4、SRT 与项目元数据清单；公开 URL 只指向同源 `/api/t/...` BFF，不含后端地址、磁盘路径或 storage key。
- Hono/BFF 支持全量、单 Range 206、ETag/304、大小/哈希校验和公开响应头白名单；仅 `SUCCEEDED + VALIDATED + AVAILABLE` 的项目内资产可读，跨 principal 统一 404。
- 显式 `NEXT_PUBLIC_PPT_DH_API_MODE=stage-t` 提供真实 tracer adapter；默认/`mock` 保持既有 Mock 页面，CLI 不受影响。
- 三页 E2E 1/1：HTTP 上传真实 PPTX fixture，依次完成 Python 解析、本地严格 Agent、显式批准、有效音频、真实分页渲染、最终合成、媒体硬门及 MP4/SRT/元数据下载。
- 全量 backend integration 为 18 通过、1 个需显式外发的 Edge 用例跳过，共 19 个；Contract 19/19；T0 7/7。

### 阶段 3 项目管理

- Project Contract 新增归档状态、列表查询、复制幂等与乐观版本输入；产品 migration 向前增加 `ARCHIVED`。
- Hono/BFF/真实 adapter 已覆盖项目列表、读取、复制、归档和删除；复制重新校验源资产并创建独立项目/PARSE task，归档和删除拒绝活动任务及陈旧版本。
- 首页保留原视觉结构，新增搜索、状态筛选、复制、归档、删除、无匹配、错误重试和操作反馈；默认 Mock 与显式真实 adapter 使用同一 API 函数边界。
- 专项检查：Contract 22/22、frontend unit 5/5、`test:components -- projects` 6/6、真实 PostgreSQL project integration 2/2。
- 完整根门禁：typecheck、0-warning lint、Python 13/13 + Contract 22/22 + unit 5/5 + component 4/4、Next production build、`routes:check` 6/6 与服务回收全部通过。浏览器插件因本机运行时兼容错误未能连接，桌面/移动视觉实机检查未执行。

### 阶段 4 真实上传流程

- Upload Contract 扩展到严格 `.pptx`/`.ppt` 扩展名与 MIME 组合；Hono 复核大小并保留 100 MiB、ZIP 条目/展开体积和幂等门。
- 损坏 PPTX、加密 PPTX、MIME 伪装分别返回稳定错误；旧 `.ppt` 检查 OLE 头后返回 `PPT_CONVERSION_UNAVAILABLE`，不创建伪解析任务。
- 显式 `stage-t` 上传页直接消费真实 Project/Task 收据，取消 abort 请求并保留选择；同次失败重试复用幂等键。默认 Mock 上传不变。
- 专项检查：Contract 23/23、`test:components -- upload` 6/6、真实 PostgreSQL upload integration 6/6。
- 完整根门禁：typecheck、0-warning lint、Python 13/13 + Contract 23/23 + unit 5/5 + component 6/6、Next production build、`routes:check` 6/6 与服务回收全部通过。

## 正在进行

- 阶段 11E 已增加分页渲染缓存完整性复核，验证单页站位修改只重渲染该页、attempt 不复用旧目录；25/30 FPS 三页基准均通过并保守冻结默认 25 FPS。专项 4/4，完整门禁待执行。
- 阶段 11D 完整 typecheck/lint/test/build/routes 门禁已通过。
- 阶段 11D 已增加音频采样率、静音和削波硬门，并以输入哈希+资产完整性复核实现跨任务缓存；专项 5 pass，外部 Edge 联网探针 1 skip（opt-in）。完整门禁待执行。
- 阶段 11C 完整 typecheck/lint/test/build/routes 门禁已通过。
- 阶段 11C 已在单 Agent Provider 后增加六模块确定性审核与最多两次受限 JSON 包装修复；离线 `eval:agent` 2/2，首次 Schema 2/4、修复后 3/4，失败样本未被吞掉；T-C integration 2/2 通过。完整门禁待执行。
- 阶段 11B 完整 typecheck/lint/test/build/routes 门禁已通过。
- 阶段 11B 已实现 `.ppt` 持久上传与 Worker 内 LibreOffice 转换；1/10/50/100 页合成覆盖、真实 `.ppt` 全链和私有 14 页导数金样专项 3/3 通过。P-11 OCR 延期通过图片页人工核对警告落实，未伪装为识别成功；完整门禁待执行。
- 阶段 11A 已补齐产品恢复专项与本地资产对账器：outbox 并发重放保持单 step，过期 lease 生成不可变 attempt 并由同一业务 task 恢复，内容寻址资产无重复；对账默认 dry-run，删除必须显式启用且受 `assetRoot/projects`、宽限期和不跟随符号链接约束。专项 T0 7/7、产品恢复/T-B 8/8，以及完整 typecheck/lint/test/build/routes 门禁均已通过。
- 用户于 2026-08-04 批准 P-11 图片公式 OCR 从 Web MVP 延期；阶段 11B STOP 已解除。图片公式继续完整保留在原页并标记人工核对，不计入结构化公式成功率。现有 LibreOffice `soffice.com` 已安装但不在 PATH，可用于受控 `.ppt` 转换 POC，无需安装系统软件。
- 阶段 10 已完成产品 UI 静态审查与修复：最终视频增加受控 SRT→WebVTT 字幕轨、App Router 路由错误恢复、解析/生成等高 skeleton；审查报告为 0 blocker、0 sprint、0 backlog、2 个浏览器证据 unknown。完整门禁通过：typecheck、0-warning lint、Python 13/13、Contract 28/28、unit 7/7、component 12/12、production build、`routes:check` 6/6。
- 当前进入阶段 11A，只处理恢复语义和孤儿资产对账；11A 门禁失败不得进入 11B。

- 阶段 1A、阶段 1B、阶段 2、阶段 T0、阶段 T 的 T-A～T-G、阶段 3 与阶段 4 均已完成；当前进入阶段 5。
- 用户于 2026-08-02 批准 Windows 原生 PostgreSQL + Prisma + PostgreSQL lease worker 作为等价本地方案；Redis/BullMQ 不再属于 T0 方案。PostgreSQL 18.4 已安装为本机服务，最小 POC 代码和运行证据存在，但它不是产品数据库、HTTP 服务或真实 Worker 实现。
- 实际 Windows 用户 PATH 已配置现有 Python 3.10.11；新开的普通终端应使用标准 `python` 命令，项目脚本不依赖 Codex 私有解释器路径。
- Vitest、React Testing Library、一个 API adapter 测试、错误重试组件测试、关键生成确认交互测试、共享 Contract 测试和 `routes:check` 已加入；阶段 1A 与阶段 2 的完整门禁均已通过。
- 阶段 1B 已锁定 `brace-expansion@1.1.18`、`postcss@8.5.23`、`shadcn@4.16.1`、`@modelcontextprotocol/sdk@1.30.0` 和 `@hono/node-server@2.0.12`；官方 audit 从 6 项降至 3 项 high。

## 未完成任务

1. 完成阶段 11F 最终串行门禁并保留结果；任何失败都停止收口。
2. 后续单独确认生产 LLM/TTS、对象存储、部署区域、最大视频时长和完整离线项目包范围。
3. 图片公式 OCR 已获准从 Web MVP 延期；恢复前需确认数据集、准确率、隐私和供应商/本地方案。

## 已知问题

- 默认前端项目、任务和进度仍存于浏览器内存，刷新即丢失；T-A 真实 adapter/BFF 已存在但尚未设为页面默认。
- 前端结果页的 `videoUrl` 为空且 `assetsAvailable=false`，没有后端生成的真实视频资源。
- 后端主链仍保留本地 V0.1 CLI；产品侧已有上传、数据库/outbox、PARSE/PLAN/AUDIO/PAGE_RENDER/COMPOSITE/VALIDATE Worker 和受控本地 HTTP 下载闭环，但尚无对象存储和生产部署。
- 多页场景当前可能只处理 `sourceSlides[0]`；原页渲染失败时的文本回退、`sourceSlideCoverage` 更新和最终结果状态仍有已知缺口。
- 后端产物 JSON 可能包含服务端绝对路径；同一 job 目录重跑可能受到陈旧帧或临时文件影响。
- T-F 产品路径已把页面覆盖、遮挡、黑帧、静音、编码、完整解码与 Fast Start 设为硬门；旧 Python/Node CLI 的基础验证器仍保留原有不足，不能作为产品交付证据。
- DeepSeek V4 Flash 已完成本机 Provider 预检；Edge TTS 开发适配器已用公开占位句验证，正式 TTS 供应商/SLA 与完整 Agent 工具调用兼容性尚未确认。
- 图片公式 OCR 已获准延期；产品路径已有 PostgreSQL integration、真实 FFmpeg 三页端到端、Contract 和前端 unit/component 测试。
- 详细历史问题和实施风险见 `docs/ARCHITECTURE_DECISIONS.md`、`docs/IMPLEMENTATION_PLAN.md` 与 `backend/README.md`。

## 当前阻塞项

- Docker Desktop 4.84.0 已安装，但 WSL2 engine 创建 `docker-desktop` 发行版时报 `HCS_E_HYPERV_NOT_INSTALLED`，engine 当前不可用。用户已停止 Docker 修复并批准等价本地方案，因此 Docker 本身不再是 T0 目标；`backend/Dockerfile` 仍只有静态审查证据。
- PostgreSQL 18.4 与 `postgresql-x64-18` Windows 服务已安装并运行。`npm.cmd run t0:test` 已通过 7/7，覆盖 transaction/outbox、幂等、outbox 重放、并发 lease、heartbeat、Worker kill 接管、取消竞态、重试上限和 migration；该证据只关闭 T-05，不关闭其他 T0 入口条件。
- Windows 组件存储 `DISM /CheckHealth` 报告“可以修复组件存储”；用户于 2026-08-02 明确要求终止正在运行的修复，`DISM` PID 20244 与 `DismHost` PID 8388 已定向强制结束。该次 `RestoreHealth` 未完成，不得视为组件存储已修复。
- P-01 高等数学优先、P-02 内部单用户范围与 DeepSeek V4 Flash Provider 预检均已确认；私有 14 页课件已经离线解析并手工导出原页 PNG，右下角默认数字人位置已确认。自动原页 PNG 已用合成三页 fixture 验证；实质遮挡的提醒逻辑仍须在阶段 T 验证。
- 初始接管所用 Codex 宿主终端未刷新用户 PATH：`python` 命令不可用；重开 PowerShell 后已恢复标准 `python` 调用并通过全部门禁。
- 三页 HTTP 上传到受控下载闭环已通过；完整 E2E 使用本地严格 Agent 与本地有效音频，真实 DeepSeek、私有课件切片和公开占位句 Edge TTS 保留为独立授权证据。正式 TTS SLA、完整页面接线、对象存储签名及生产部署仍未完成。
- 数据库/任务方向已按 ADR-011 接入产品；T-A～T-G 已实现 API/outbox、全链 Worker 和本地受控媒体交付。对象存储、生产部署和正式供应商选择仍未实现。

### 2026-08-04 阶段 11F 最终媒体硬化

- strict 媒体报告新增平均响度与峰值；通过门槛为平均响度 `-35～-8 dB`、峰值 `< -0.05 dB`，与非静音门分开报告。
- VALIDATE 在分析前复核最终候选和逐页基准帧的大小与 SHA-256；候选被篡改时稳定拒绝并写入一致失败终态。
- 专项 4/4 通过，覆盖真实三页全部硬门、显式硬门失败、候选篡改和 HTTP 交付哈希闭环。P-07 未确认时项目包只承诺版本化元数据与资产清单，不承诺完整离线复现工程。
- 最终串行门禁通过：typecheck、0-warning lint、Python 13/13、Contract 29/29、unit 7/7、component 12/12、Next production build、路由 6/6 与服务回收。
- 当前稳定 Next 版本没有同时修复其内嵌 PostCSS 与 Sharp 高危项的兼容补丁；canary 不作为阶段 1B 方案。该残余风险已由用户明确接受，未来升级 Next 或进入生产化前必须重新审查。

## 最近检查

2026-08-03 阶段 T-A 专项检查：

- Git 事实检查：工作开始时 `main` 相对 `origin/main` ahead 10，工作树干净；未 commit/push。
- `npm.cmd run test:contracts`：2 个文件、8/8 通过。
- `npm.cmd run test:unit`：真实 adapter 与既有 adapter 共 2/2 通过。
- `npm.cmd run test:integration`：使用真实 PostgreSQL/migration 和 HTTP，3/3 通过；随后指定 Git 忽略的私有三页业务切片复跑仍为 3/3。
- `npm.cmd run t0:test`：7/7 通过，新产品 migration 未破坏 T0 transaction/outbox/lease/recovery 证据。
- 私有前三页副本强制 `--planner rules` prepare：3 页、3 场景、3 张 PNG，`renderer=libreoffice`、`renderError=null`、`plannerError=null`；未调用 Provider。
- 完整串行门禁已通过：backend/frontend typecheck、0-warning lint、后端 13/13 + Contract 8/8 + unit 2/2 + component 3/3、Next production build，以及 6-route HTTP 200/服务回收检查。

2026-08-03 阶段 T-B 专项检查：

- T-A 已创建四个本地提交，提交后工作树干净且 `main` ahead 14；未 push。
- `npm.cmd run test:integration`：私有前三页业务切片 9/9，通过真实 parse Worker 3/3、outbox replay、lease takeover、queued/active cancel 和漏页硬失败。
- `npm.cmd run t0:test`：7/7，通过四个 migration 的 fresh/forward 应用并保留真实 Worker kill 等 T0 证据。
- 完整串行质量门禁已全部通过：backend/frontend typecheck；lint 0 warning；后端 13/13、Contract 10/10、unit 2/2、component 3/3；Next production build；6/6 路由检查且服务回收。

2026-08-04 阶段 T-C 专项检查：

- 产品 migration 已应用；`t0:test` 7/7，五个 migration fresh/forward 与原恢复语义通过。
- 合成与私有三页切片的 `test:integration` 均为 11/11；真实 Provider 成功持久化 3/3 Revision/Scene，修订、陈旧冲突和批准断言通过。
- Contract 4 文件 12/12；完整串行质量门禁全部通过：backend/frontend typecheck、lint 0 warning、后端 13/13、Contract 12/12、unit 2/2、component 3/3、Next production build、6/6 路由检查与服务回收。

2026-08-04 阶段 T-D 专项检查：

- 两个 T-D migration 已应用；`t0:test` 7/7，七个 migration fresh/forward 与原恢复语义通过。
- `test:integration` 13/13；批准门禁、快照冻结、4 个句级 step、单句重试、取消、音频资产、SRT 和真实时长字幕断言通过。
- Contract 5 文件 14/14；公开占位句真实 Edge TTS 解码/时长/非静音验证 1/1，未外发项目私密数据。
- 完整串行质量门禁已全部通过：backend/frontend typecheck、lint 0 warning、后端 13/13、Contract 14/14、unit 2/2、component 3/3、Next production build（包含两个 T-D BFF 路由）、6/6 路由检查与服务回收。

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

## 最新阶段记录

### 2026-08-04 阶段 10 产品审查

- `ui-audit` 静态审查修复了真实视频无浏览器字幕轨、普通路由无 error boundary、解析/生成加载布局跳变三个问题。
- 新增受控 WebVTT endpoint、可聚焦恢复的 `error.tsx` 和任务工作流 skeleton；复审为 0 blocker/0 sprint/0 backlog、2 个浏览器证据 unknown。
- 专项通过：component 12/12、T-G E2E 1/1、typecheck、0-warning lint。浏览器插件仍因宿主兼容错误不可用，未把视觉/键盘/CWV 记为通过；完整根门禁正在串行执行。

### 2026-08-04 阶段 9 真实结果与受控下载

- 结果页以最终 taskId 读取 FinalMedia、DeliveryManifest 和 Task，真实 MP4 可在同源 BFF 播放，MP4/SRT/元数据均可受控下载。
- 展示最终媒体硬门报告；SRT 保持下载交付，不错误标注为浏览器 WebVTT 字幕轨。
- 每次下载重新读取授权 manifest；真实 E2E 证明刷新 manifest 不新增任务，Range/ETag/哈希和跨 principal 404 均保持有效。
- 专项通过：component 12/12、T-G E2E 1/1；lint 首次因测试 image mock 的 2 个 warning 停止，修正后完整门禁重跑通过：typecheck、0-warning lint、Python 13/13、Contract 28/28、unit 7/7、component 12/12、production build、routes 6/6。

### 2026-08-04 阶段 8 持久生成任务页面

- 真实生成 UI 依次消费 AUDIO、PAGE_RENDER、COMPOSITE/VALIDATE 持久任务；仅在前一任务服务端成功后通过既有幂等边界创建下一任务。
- URL 持久记录当前及上游任务 ID，重挂载恢复轮询而不重复创建；排队/运行态可取消，失败阶段可按服务端错误分类重启。
- GET task 投影当前 RUNNING step 的稳定 slideId；UI 显示真实完成/总量、当前页、错误和冻结上游任务。
- 专项通过：unit 7/7、component 11/11、T-D integration 3/3、三页完整 T-G E2E 1/1；完整门禁通过：typecheck、0-warning lint、Python 13/13、Contract 28/28、unit 7/7、component 11/11、production build、routes 6/6。

### 2026-08-04 阶段 7 数字人与声音配置

- 新增 Project settings JSON 向前 migration、严格设置 Contract、Hono/BFF/真实 adapter，并以项目 version 防止陈旧设置覆盖。
- 新增持久单句 voice-preview AUDIO task 与受控 `audio/mpeg` 读取；生产路径复用 Edge TTS 的解码、时长和非静音校验，Mock 路径使用可解码 HTTP MP3 fixture。
- 工作台保存语速、字幕和逐页数字人候选站位；hidden 进入冻结渲染快照并在真实 Sharp/FFmpeg 页面渲染中省略数字人。
- 专项通过：Contract 28/28、component 10/10、T-D integration 3/3、T-E integration 2/2；完整门禁通过：typecheck、0-warning lint、Python 13/13、Contract 28/28、unit 6/6、component 10/10、production build、routes 6/6。外部 Edge 联网探针按设计 opt-in，本轮跳过。

### 2026-08-04 阶段 6 门禁前状态

- workspace snapshot、原页默认预览、revision 编辑/批准、乐观冲突、页面锁定和 PLAN task 恢复已接入真实 Hono/BFF/PostgreSQL 边界。
- 新增 `LessonPlan.isLocked` migration；锁定页不能修订，陈旧 revision/lock 请求返回 409。
- 单页修改生成该页的新不可变 revision；真实集成测试确认未修改页面 output hash 保持不变。
- 无 revision 项目必须显式创建/恢复 PLAN task，服务端成功前不能以占位讲稿进入生成。
- 专项结果：Contract 27/27、component 9/9、真实 PLAN/revision/workspace integration 2/2；typecheck 与 0-warning lint 通过。完整根门禁待执行。
- 完整根门禁已通过：typecheck、0-warning lint、Python 13/13、Contract 27/27、unit 6/6、component 9/9、production build、routes 6/6 与服务回收。

### 2026-08-04 阶段 6 暂停点

- 阶段 5 已完成完整五项根门禁。
- 阶段 6 已创建 workspace snapshot/lock Contract、`LessonPlan.isLocked` 向前 migration、Hono/BFF/真实 adapter 接线，并开始把工作台改为原页默认预览和真实 revision 编辑。
- migration 已应用且 Prisma Client 已生成。
- 阶段 6 当前不完整：typecheck 因 4 个 Mock slide fixture 缺少 `derivationSteps`、`sceneCount`、`isLocked` 而失败；后续专项测试和完整门禁未运行。
- 按用户要求在此保存并停止；不得进入阶段 7，也不得把阶段 6 标记为完成。

### 2026-08-04 阶段 5 真实解析页接线

- 新增解析快照与原页预览公共边界，稳定页 ID、连续页码、真实页数、原页资产、公式数量、解析置信度与警告均可从 PostgreSQL/Hono/BFF 回读。
- 原页预览按 principal 隔离并在读取时校验大小/SHA-256；缺失原页硬阻断，不生成或展示文本重建替代页。
- 前端真实模式只使用服务端工作单元计算进度，并展示持久化原页核对列表；完成后不再自动跳转，失败/取消不伪造本地重试。
- 专项检查已通过：Contract 25/25、frontend unit 6/6、component 7/7、真实 parse integration 6/6（含 PNG 字节、跨 principal 404、漏页硬失败）。完整阶段门禁正在串行执行。

## 下一步建议

1. DISM 已按用户要求终止；如果后续系统安装或 Windows 功能出现异常，先重新检查组件存储状态，不自动继续 Docker/WSL 修复。
2. T-C 完整门禁通过并得到用户确认后，只进入 T-D AUDIO Worker/真实字幕时间轴；不顺带进入视频渲染、验证或下载。
3. 未完成整个阶段 T 前不得进入阶段 3；数字人或 Overlay 实质遮挡时仍必须提醒并阻断批准。
