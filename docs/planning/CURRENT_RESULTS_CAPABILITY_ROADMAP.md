# 下一阶段产品闭环路线图（重规划版）

> 更新：2026-08-23
> 状态：Active planning artifact
> 目标：先形成可安装、可审核、不会静默丢失 PPT 动画的 Windows 单机内测闭环，再交付受约束的自然语言改课闭环。
> 说明：本文件替代 2026-08-23 的上一版《基于当前成果的后续能力路线图》；它不代表下述功能、真实 Provider、外部课件或新桌面候选已经验收通过。

## 1. 为什么要重规划

上一版有四个结构性问题：

1. 把“已识别动画事实”当成了“动画只剩外部验收”。代码实际只把 `animationManifest` 送入 PLAN；正式 PAGE_RENDER/COMPOSITE 仍以静态原页为底图，完全不消费动画时间轴。
2. 把 WPS、旧 `.ppt`、七类真实 Provider、复杂动画、100 页容量和桌面安装全部放在新功能之前，形成一个无法短期关闭的全局前置门。
3. 把没有已授权素材、且用户尚未确认价值的固定手势放入主线，而真正影响成片可信度的动画处置、字幕时序和安装闭环没有被定义成发布结果。
4. “自然语言修改”只有方向，没有任务模型、持久化实体、并发边界、应用事务和可验证的最小范围。

新版按两个可交付版本组织工作，并把人物动作降为独立 R&D。外部证据在它所支撑的发布声明前完成，不再要求一次性验证所有供应商、文件来源和极端容量。

## 2. 目标发布结果

### Release A：Windows 单机内部 Beta

用户可以在安装版中完成“导入课件 → 解析 → 审核讲稿与动画处置 → 试听 → 生成 → 播放/导出”的闭环，并满足：

- 含动画的页面绝不会在没有提示和明确选择的情况下被静态化。
- 简单自动计时动画只有在原生视频 POC 通过并满足白名单时才允许保留；其他动画必须由用户明确接受静态成片。
- 数字人支持左栏、右栏、隐藏三种安全模板，预览和最终成片使用同一版本化几何规格。
- 字幕时间来自最终已验证音频；能可靠对应时使用 Edge 单词边界，不能对应时保守退回讲稿分段边界，不猜公式字幕时间。
- 至少一个真实多模态 Provider、真实 Edge TTS、10 页完整生成和一组金样课件在同一个可追溯桌面候选上通过。

Release A 是内部 Beta，不等于公开发布、全 Provider 支持、任意 PowerPoint 动画保真、100 页视频容量或 clean Windows 广泛兼容。

### Release B：受约束的自然语言改课 Beta

用户可以对单页输入修改要求，系统生成结构化字段差异；只有用户点击“应用”才创建新的 pending revision，之后仍需显式批准并重建受影响媒体。第一版不改源 PPT、不改动画事实、不执行代码、不自动批准。

### Optional R&D：人物动作/新口型

不进入 Release A 或 Release B 的关键路径。只有取得明确许可的新素材、用户确认值得做且连续播放验收标准确定后，才另立 POC。已失败的五档嘴型路线不恢复。

## 3. 已核实的当前基线

| 领域 | 当前真实能力 | 尚未具备 |
| --- | --- | --- |
| 产品链 | 已有 PostgreSQL/outbox/lease、不可变 revision、显式批准、AUDIO/PAGE_RENDER/COMPOSITE/VALIDATE 和受控下载 | 仍缺一个基于新源码重建并完成真实业务验收的桌面候选 |
| 动画 | COM 可提取严格 `animation-manifest-v1`；PLAN 只能解释 effect ID，不能改事实 | 最终渲染器不消费动画清单；当前成片把所有页面作为静态 PNG |
| 数字人 | 正式渲染支持 `right-panel` 或 `hidden`，生产口型是开/闭两态 | `left-panel` 尚未进入最终 Contract/Worker/renderer；无通过验收的新动作素材 |
| 字幕/音频 | Edge adapter 已记录 `WordTimingCapture`；最终音频和每个 narration segment 都有验证后时长 | 当前 SRT 主要按 narration segment 整段计时，未形成可靠的细粒度显示文本映射 |
| 修订 | 用户编辑会创建新的 pending revision，具备锁定、乐观并发、批准和精确下游失效基础 | 没有 `REVISION_PROPOSAL` 任务、提案实体、结构化 diff 或应用事务 |
| 桌面 | 独立 Electron 仓库已有 bundle、安装、smoke、升级/回滚相关脚本 | 当前桌面候选未包含本轮动画/多模态源码，也没有新的真实 Provider/Edge/金样验收 |

证据分级：

- **已由代码核实**：上表中的数据流、Contract、渲染输入和任务边界。
- **已有官方 API 依据但仍需实测**：PowerPoint [`Presentation.CreateVideo`](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.presentation.createvideo) 可按幻灯片计时导出视频，`CreateVideoStatus` 可轮询状态；`AdvanceOnTime/AdvanceTime` 可配置自动换页时间。
- **尚未核实**：逐页隔离后动画保真、交互触发器/Morph/媒体行为、长课件导出稳定性、WPS 播放等价性。它们不能因 API 存在就写成已支持。

## 4. 强制执行顺序

```text
M0 文档真相与最小金样
  ↓
M1 动画处置门：先保证绝不静默丢动画
  ↓
M2 PowerPoint 原生视频 POC（独立 GO / NO-GO）
  ├─ GO：只对白名单页面启用原生动画底片
  └─ NO-GO：禁用原生底片，保留 M1 的显式静态处置
  ↓
M3 左/右/隐藏布局 + 字幕时序收敛
  ↓
M4 重建并验收一个 Release A 桌面候选
  ↓
M5 单页自然语言修改提案
  ↓
Release B 验收

Optional R&D 人物动作：M4 后独立决定，不阻塞任一发布
```

M2 失败是一个有效结论，只关闭“原生动画底片”，不得阻塞 M3/M4。M1、M3 或 M4 的发布必需门失败时，Release A 必须停止。

## 5. 里程碑计划

### M0：修正文档真相，建立最小金样

**目的**

让接手者从文档中看到当前代码，而不是继续按 8 月初的 Mock/阶段 3 状态开发；同时给后续动画、布局、字幕和桌面验收提供固定输入。

**实施**

1. 更新 `PRD.md`、`ARCHITECTURE.md` 和 `DEVELOPMENT_ROADMAP.md` 的当前态；历史阶段保留为历史，不再与“当前入口”混排。
2. 固化五个合成、可提交、无隐私的金样：
   - `static-math-16x9.pptx`：公式、图表、长短讲稿和两段以上 narration；
   - `static-4x3.pptx`；
   - `static-portrait.pptx`；
   - `animated-auto-simple.pptx`：仅主序列、自动计时、进入/强调/退出；
   - `animated-unsupported.pptx`：至少含交互触发器或复杂路径，用于验证保守处置。
3. 为每个金样记录生成脚本/来源、源 SHA-256、预期页数、预期动画分类和人工观察点。不要提交用户私有课件或生成媒体。
4. 用当前 renderer 生成一次 `animated-auto-simple` 基线，记录“清单存在但最终视频静态”的可复查证据；它是缺陷基线，不是通过证据。
5. 把 Provider 支持声明改为逐供应商证据；Release A 只选择一个真实 Provider 作为发布门，其余保持“adapter 已实现、真实账号未验收”。

**完成标准**

- 活跃文档不再出现“当前只有 Mock/没有媒体 Worker/下一步阶段 3”等与代码冲突的描述。
- 五个金样可重复生成，哈希与预期事实稳定。
- 当前动画静态化问题有输入、输出、版本和人工结论，不再只靠文字推断。
- 根门禁未因文档/fixture 调整退化。

### M1：建立动画处置门，禁止静默静态化

**目的**

先解决产品诚信问题。即使 M2 最终失败，用户也必须知道哪些页含动画、成片如何处理，并作出可审计选择。

**Contract 与持久化**

1. 新增严格 `AnimationDispositionV1`，与 COM 动画事实分离，最小字段包括：
   - `manifestHash`：绑定当前源动画清单；
   - `mode`：`NOT_APPLICABLE | ACCEPT_STATIC | PRESERVE_NATIVE`；
   - `reason`/`decidedBy`/`decidedAt`：记录用户选择或系统派生依据。
2. 将 disposition 放入 `LessonPlanRevision.payload`，不新增第二套审核实体：
   - 无动画页面由服务端派生 `NOT_APPLICABLE`；
   - 有动画页面必须由用户选择；选择会创建新的 pending revision；
   - `PRESERVE_NATIVE` 在 M2 GO 前不出现在可选能力中；
   - 新上传/重新解析导致 manifest hash 变化时，旧选择自动失效。
3. 旧 revision 保持可读；但旧项目只要当前页存在动画且没有匹配 disposition，新的 GENERATE/Workflow 必须返回稳定 `ANIMATION_REVIEW_REQUIRED`，不能沿用历史批准静默生成。

**界面与工作流**

1. 工作台逐页显示：效果数、序列类别、支持评估、元数据来源、静态降级警告和当前处置。
2. `ACCEPT_STATIC` 文案明确说明“最终视频不会播放本页动画”，不使用“兼容”“已保留”等模糊词。
3. disposition 随 revision 显式批准，并冻结到 Workflow/PAGE_RENDER 输入哈希、交付清单和结果页报告。
4. 最终结果至少报告：含动画页数、原生保留页、明确静态页、无法读取动画元数据页。公共报告不暴露路径或 COM 内部数据。

**完成标准**

- `animated-auto-simple` 和 `animated-unsupported` 在没有选择时均无法创建生成工作流。
- 用户明确接受静态并批准后可以生成，结果页仍清楚标记静态处置。
- `static-*` 金样无需多余点击，既有生成链无回归。
- 修改 manifest 或替换源课件后旧选择不再有效；重放同一请求保持幂等。

### M2：PowerPoint 原生视频 POC 与局部集成门

**目的**

验证“用 PowerPoint 自身渲染简单动画，再复用现有 FFmpeg 叠加数字人、字幕和 TTS”是否真实可行。此阶段先证明，不先承诺生产支持。

**POC 实施**

1. 新建隔离的 Python/COM video adapter。它只能操作源文件的临时字节副本：禁用宏、记录副本哈希、导出后确认原源 SHA-256 未变化，并沿用精确 PID/超时/取消回收策略。
2. 对副本设置 `SlideShowSettings.AdvanceMode = ppSlideShowUseSlideTimings`，按最终 AudioTimeline 设置 `SlideShowTransition.AdvanceOnTime/AdvanceTime`，调用 `CreateVideo(..., UseTimingsAndNarrations=true, VertResolution=1080, FramesPerSecond=25)`，轮询 `CreateVideoStatus`。
3. 第一轮只测一页 `animated-auto-simple`，且仅允许：主序列、`WITH_PREVIOUS/AFTER_PREVIOUS` 自动触发、已知普通进入/强调/退出效果；排除 `ON_CLICK`、交互序列、Morph、媒体、复杂路径、自定义/未知效果和宏。
4. 验证 PAGE_RENDER 所需的逐页隔离：在副本中只保留目标页或以 PowerPoint 可证明等价的方式隐藏其他页。若隔离改变效果、主题、计时或导出范围，不得把整份课件导出后粗略切片冒充逐页能力。
5. 以已知时间点取帧，验证目标区域在动画前/中/后发生预期变化；验证最终时长与 AudioTimeline 差值不超过 400 ms、1080p/25fps、完整解码、原页边界、进程回收和临时文件清理。

**GO 条件**

- 连续 10 次导出无挂起/残留进程，源文件哈希不变。
- 逐页隔离与源 PowerPoint 播放在金样的关键帧/计时上通过人工对照。
- 可取消、超时、失败重试和缓存键都能接入现有 page-level worker；不需要第二套队列或整份视频不可恢复的单体任务。
- 原生视频可作为 base layer 进入现有 FFmpeg 合成，数字人/字幕/音频叠加后仍通过 Stage 11F 媒体硬门。

**GO 后的生产收敛**

1. 只对白名单页面开放 `PRESERVE_NATIVE`；能力判定来自 COM 事实，不由模型决定。
2. adapter/version、PowerPoint 版本、manifest hash、AudioTimeline hash、布局版本和处置方式进入 input hash/交付报告。
3. 任一页导出失败时该任务失败并给出可操作错误；不得自动改成静态。用户可返回审核页主动改选 `ACCEPT_STATIC`。
4. 在 `DECISIONS.md` 新增决策，明确支持子集、回退和未支持效果；D-51 的“尚未实现视觉重放”只有在本门通过后才能更新。

**NO-GO 条件与回退**

以下任一项成立即关闭本轮原生集成：逐页隔离不可靠、导出无法稳定取消/回收、源副本策略不能证明安全、时序不可重复、关键帧与原播放不一致，或集成要求推翻当前可恢复 page worker。回退是保留 M1 的显式 `ACCEPT_STATIC`；M3/M4 继续执行，Release A 只声明“识别并明确处置动画”，不声明保留动画。

### M3：三模板安全布局与字幕时序收敛

**目的**

解决成片最直接的可用性差距：人物位置与预览一致，字幕和最终音频一致。

#### M3-A：左栏 / 右栏 / 隐藏

1. 建立唯一、版本化的归一化布局规格：`slideRect`、`avatarPanelRect`、`subtitleSafeRect` 和 `layoutVersion`。前端预览与后端 1920×1080 像素换算都从该规格派生。
2. 正式 Contract 仅允许 `left-panel | right-panel | hidden`。不做自由拖拽、自动换边或截图猜位置。
3. placement 与 layout version 冻结到 PAGE_RENDER、RenderedPage、缓存输入和交付清单；旧任务按其旧 renderer/version 继续可读，不做破坏性回填。
4. 媒体门验证完整 PPT `contain`、人物面板不侵入 slide/subtitle safe rect、hidden 没有遗留人物像素；M2 GO 时同一几何同时适用于静态和原生视频 base layer。

#### M3-B：字幕按可靠程度分级

1. 继续以 narration segment 作为最小可审核单位；编辑器显示分段边界，过长字幕要求用户/模型拆段，不在渲染阶段用猜测比例强拆。
2. 当 `displayText` 与 `spokenText` 经确定性规范化后可一一对应时，使用已持久化的 `WordTimingCapture` 生成更细 cue。
3. 公式读法、替换读音或其他无法安全映射的双文本继续使用该 narration segment 的最终验证时长；不把 spokenText 的词时间硬套到不同 displayText。
4. 字幕必须连续、无重叠，最后 cue 结束等于 AudioTimeline 总时长；每 cue 不超过两行并位于 `subtitleSafeRect`。无法排版时在审核/生成前失败，而不是缩成不可读文字。

**完成标准**

- 三种 placement 在工作台预览和最终 MP4 的几何一致；4:3、纵向和 M2 的两种 base layer 都通过同一安全门。
- 只改一页 placement 只重建该页和必要下游合成，不使其他页缓存失效。
- 单词级路径的时间边界相对 Edge capture 误差不超过 100 ms；保守分段路径的 cue 边界等于对应 AudioSegment 边界。
- 长字幕、双文本公式、hidden、左右切换、取消、重试和缓存均有专项回归。

### M4：构建并验收一个 Release A 桌面候选

**目的**

只在 M1～M3 收口后重建一次候选，验证用户实际安装和使用的同一套字节；不在每个小改动后反复打包。

**候选可追溯性**

1. 记录网页仓库 commit、共享 Contract tarball 名称/SHA-256、桌面仓库 commit、runtime manifest、安装包 SHA-256 和签名状态。
2. 候选只包含干净源码；未提交 diff、开发目录绝对路径、真实 Key、用户课件和生成媒体不得进入 bundle。
3. 结果报告同时记录 M2 为 GO 或 NO-GO；桌面 UI 只能显示候选实际包含的动画能力。

**Release A 必过矩阵**

1. 本机普通用户全新安装、保留数据升级、卸载保留数据、失败回滚；应用正常退出后无自有进程或 loopback listener 残留。
2. 选择一个真实多模态 Provider 作为 Beta Provider，完成视觉探针、真实 PLAN、稳定错误和一次显式失败重试。其余 Provider 不阻塞 Beta，也不获得“已验收”声明。
3. 真实 Edge TTS 完成试听、最终音频、字幕和完整 MP4 播放；网络不可用时错误可操作，不能投影为成功。
4. 五个金样全部跑到最终交付；动画金样验证 M1 处置，若 M2 GO 再验证白名单原生播放。
5. 以 10 页课件完成一次上传到最终视频的端到端运行，覆盖取消、重启恢复和失败重试。Beta 暂定最大完整生成页数为 10；在 30/50/100 页视频容量另行通过前，UI/文档不得沿用“解析支持 100 页”暗示视频也支持 100 页。
6. Windows 125%/150% 缩放、键盘焦点、安装后首次启动设置和结果页播放做人工检查。

**完成标准**

- 上述必过项在同一候选上全部 PASS，并能从安装包哈希追溯到两个仓库和 Contract 制品。
- 任一外部未测项标为 `EXTERNAL_VALIDATION_PENDING`，不并入 PASS。
- 未签名、未测 clean VM/外部电脑时只能称“本机内部 Beta 候选”，不能公开发布。

### M5：单页自然语言修改提案

**目的**

复用现有 revision/批准/worker 基础，交付一个小而完整的“描述要求 → 查看差异 → 应用 → 批准 → 精确重生成”闭环。

**第一版范围**

- 一次只处理一个 `slideId`。
- 只允许修改 `teachingGoal`、narration 的 `displayText/spokenText` 和 `derivation`。
- `scenes`、layout、gesture、overlay、动画 manifest/disposition、源 PPT、权限、Provider 配置和媒体规则全部只读或不进入第一版。

**任务与数据模型**

1. 在既有任务系统增加 `REVISION_PROPOSAL` task kind/stage/event；继续使用 PostgreSQL/outbox/lease/attempt/cancel/retry，不从 HTTP route 直接调用 Provider。
2. 新增 `LessonPlanChangeProposal` 持久实体，至少包含：
   - `id/projectId/presentationId/slideId`；
   - `baseRevisionId/baseRevision`、`taskId`；
   - `status: PENDING | APPLIED | DISMISSED`；
   - 原始 intent、严格结构化 proposed fields/diff、input/output hash；
   - `createdAt`、`appliedAt`、`appliedRevisionId`。
3. 请求冻结当前 revision、原页/解析/动画事实的只读摘要、Provider 非秘密快照和用户 intent。Worker 最多执行一次外部调用；显式重试创建可追踪后继或幂等重放，不自动重复收费。
4. Provider 输出先作为 `unknown` 通过 strict schema；输出是字段化提案，不接受任意 JSON Patch、代码、文件路径或未声明字段。

**应用事务**

1. UI 展示原值/建议值、影响字段、风险和预计失效的下游资产；生成提案本身不写 revision 或媒体。
2. “应用”事务重新验证当前 revision 与 `baseRevision` 相同、页面未锁定、proposal 仍为 PENDING；随后创建一个新的 pending immutable revision，并原样保留 scenes、动画理解和动画处置。
3. 同一 proposal 只能应用一次；陈旧 revision、锁定页、越权字段和重复应用返回稳定冲突。
4. 用户仍需显式批准新 revision。批准后只使该页受影响的 AUDIO/PAGE_RENDER/COMPOSITE 输入失效，并继续通过既有媒体硬门。

**完成标准**

- 不点击“应用”时，revision/task media 数量不变。
- 应用后只出现一个新的 pending revision；未批准不能生成。
- 陈旧、锁定、恶意 prompt、非法 schema、Provider 失败和重复请求均无越权副作用。
- 源 PPT、animation manifest、其他页面 revision/output hash 均不变。
- 从意图输入到最终重新生成视频有一条单页真实 E2E。

### Optional R&D：人物动作或新口型

进入条件：Release A 已完成；用户明确要求继续；资源具有可记录许可；连续播放的人工验收问题和样片时长已确定。

第一轮最多 2～3 个低幅度固定动作，必须锁在人物面板内，并用显式 cue 白名单。任何 POC 都在生产路径外开始；只有 15～20 秒连续中文样片通过“自然、无闪烁、不越界、不干扰公式/字幕”人工 A/B 后，才另写正式接入计划。当前开/闭两态始终是回退，五档嘴型 L5/L6 结论不变。

## 6. 关键决策

- **动画识别、教学理解和成片保留是三个不同能力。** 任何一项不能替代另一项的验收。
- **M1 是最低可发布诚信门。** 即使原生导出失败，系统也必须阻止无提示静态化，并让用户明确接受结果。
- **原生导出采用独立 POC 决策门。** PowerPoint API 的存在只证明接口可调用，不证明逐页保真和生产稳定。
- **外部验证按发布声明分层。** 一个 Beta Provider 进入 Release A 门；其余 Provider、WPS、旧 `.ppt` 动画和 100 页视频容量分别保留自己的证据状态。
- **布局采用三种模板，不做自由位置。** 这是可以让预览、缓存和媒体安全门共同证明的最小能力。
- **字幕准确优先于伪精细。** 只有显示/朗读文本可确定对应时才使用词时间，否则保持可审核分段时间。
- **自然语言只产生提案。** 它没有修改源文件、应用 revision、批准或发布媒体的隐式权限。
- **人物动作不在主线。** 没有许可素材和连续播放通过证据，就没有生产接入。
- **只复用现有架构。** 不新增第二套队列、对象存储、渲染框架或通用 Agent 编排。

## 7. 预计修改文件

### M0

- `docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/planning/DEVELOPMENT_ROADMAP.md`：修正当前态与发布定义。
- `docs/CURRENT_TASK.md`、`docs/STATUS.md`、`docs/reviews/`：记录金样、基线和证据状态。
- `backend/tests/fixtures/` 或现有合成 fixture 位置：只增加可重复生成的无隐私金样及预期 manifest。

### M1

- `packages/contracts/src/animation.ts`、`lesson-plan.ts`、workspace/result/workflow 相关 Contract。
- `backend/app/lesson-plan-repository.ts`、review/workflow/render/delivery repository 与 route：持久化、冻结、阻断和报告 disposition。
- `frontend/src/components/workspace/`、generation/result 组件及 API adapter：展示事实、选择处置和明确静态风险。
- Contract、revision、workflow、component、Stage T-E/T-F/T-G 测试。

### M2

- 新建 `backend/powerpoint_video_adapter.py` 及受控 runner；复用现有 COM 生命周期工具，不复制一套进程管理。
- `backend/app/render-adapter.ts`、render worker/repository、asset/cache/delivery 层：只在 GO 后接入原生 base video。
- Python 单元、opt-in 真实 PowerPoint video、关键帧/时长、Stage T-E/T-F 与取消恢复测试。
- `docs/DECISIONS.md`、`backend/README.md`：仅按 GO/NO-GO 事实更新。

### M3

- `packages/contracts/src/render.ts` 与新建的纯数据 `render-layout.ts`：placement、归一化 rect 和 layout version。
- `backend/app/teaching-settings.ts`、`render-repository.ts`、`render-adapter.ts`、`media-adapter.ts`、`audio-worker.ts`：布局冻结、几何门和分级 cue。
- `frontend/src/components/workspace/teaching-settings-form.tsx`、`slide-preview.tsx`、讲稿分段编辑与 API 类型。
- Contract、component、Stage 11D/11E/11F/T-G 测试。

### M4

- 网页仓库：版本化 Contract tarball、Release A 验收报告和状态文档。
- 桌面仓库 `D:\Workspace\projects\web\math-avatar-desktop`：vendor Contract、bundle manifest、安装候选和 `docs/operations/` 证据；只有用户授权后才构建/安装或访问真实账号。

### M5

- `packages/contracts/src/task.ts`、`agent.ts`、`lesson-plan.ts`：proposal 请求/结果/任务/错误 Contract。
- `backend/prisma/schema.prisma` 与向前 migration；proposal repository/worker/dispatcher/route。
- Next BFF、workspace proposal UI、diff/apply/dismiss adapter。
- Contract、provider fixture、repository/worker/integration/component/E2E 测试。

## 8. 明确不做

- 首版复现任意 PowerPoint 动画、交互点击、Morph、媒体、复杂路径、宏或插件行为。
- 用屏幕录制、固定等待、整份视频粗切或模型猜测冒充逐页原生动画保真。
- 为 Release A 一次性验收七类 Provider、所有 WPS/旧 `.ppt` 来源或 100 页最终视频。
- OCR、图片公式结构化识别、自由拖拽/自动换边、新画幅、云端多用户、计费或协作权限。
- 恢复失败五档嘴型，或在没有许可素材/用户确认前制作生产手势。
- 自然语言直接改 PPT 二进制、执行脚本、任意 JSON Patch、自动应用/批准或绕过媒体验证。
- 新建第二套队列、存储、任务状态机、通用 Agent 平台或与当前里程碑无关的抽象。

## 9. 验证计划

所有命令串行运行，避免共享 PostgreSQL、attempt 目录和 `frontend/.next` 竞争。

### 每个源码里程碑的根门禁

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:test
npm.cmd run build
```

全部退出码必须为 0；专项跳过只记为 skip/pending，不计 PASS。

### M0

```powershell
git diff --check
npm.cmd run backend:test
npm.cmd run test:contracts
```

另人工核对五个金样的预期页面/动画事实及当前静态成片基线。

### M1

```powershell
npm.cmd run test:contracts
npm.cmd run test:components -- workspace
npm.cmd run test:integration
npm.cmd run test:workflow
```

必须显式覆盖：无处置阻断、接受静态、manifest 变化失效、旧 revision 兼容、批准门、幂等、交付报告。

### M2

```powershell
python -m unittest backend.tests.test_powerpoint_video_adapter -v
$env:PPT_DH_REAL_POWERPOINT_VIDEO_TEST='1'
python -m unittest backend.tests.test_powerpoint_video_adapter_real -v
npm.cmd run test:stage-11e
npm.cmd run test:stage-11f
```

真实用例必须断言源哈希、关键帧、时长、分辨率/FPS、取消/超时、10 次循环和 PowerPoint PID 回收；未安装 PowerPoint 时明确 skip，不得写成 GO。

### M3

```powershell
npm.cmd run test:contracts
npm.cmd run test:components -- workspace
npm.cmd run test:stage-11d
npm.cmd run test:stage-11e
npm.cmd run test:stage-11f
```

另对 16:9、4:3、纵向、左右/隐藏、双文本公式和长字幕做最终 MP4 帧/字幕人工检查。

### M4（桌面仓库 `apps/desktop`）

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run desktop:verify
npm.cmd run desktop:package
npm.cmd run desktop:smoke:installed
```

构建、安装、真实 Provider 和 Edge 调用须先满足用户授权与环境要求。最终报告必须记录安装包 SHA-256、两个仓库 commit、Contract tarball SHA-256、候选签名状态和每个人工矩阵项。

### M5

```powershell
npm.cmd run test:contracts
npm.cmd run test:provider-gateway
npm.cmd run test:integration
npm.cmd run test:workflow
npm.cmd run test:components -- workspace
```

必须有“未应用零副作用、陈旧/锁定拒绝、只改一页、批准前阻断、批准后精确失效”的真实数据库断言。

## 10. 假设与失效动作

| 假设 | 证据状态 | 假设失效时 |
| --- | --- | --- |
| Release A 面向 Windows、本机单用户、人工批准 | 现有产品与桌面架构支持 | 若目标改为云端/多人，先重写 PRD 和身份/存储架构，不扩展本计划 |
| 本机有 Microsoft PowerPoint 才启用原生动画 | API/现有 COM 链支持，video 行为未验证 | 没有 PowerPoint 或 M2 NO-GO 时只提供显式静态处置 |
| 一个真实 Beta Provider 足以形成内部闭环 | 产品选择，尚待用户环境验证 | 若没有任何可用账号，M4 保持 blocked，不用 fixture 宣称 Beta |
| Edge 单词边界只在双文本可确定对应时可用于字幕 | 代码已有 capture；映射规则未实现 | 不可对应时退回 narration segment，不做近似词对齐 |
| 10 页是第一版完整视频的最低可用容量 | 规划目标；目前只证明解析可到 100 页、媒体闭环测过 3 页 | 10 页失败则不发布 Release A；通过后仍不外推 30/50/100 页 |
| 当前 revision/outbox/lease 可承载单页提案 | 代码结构已核实，新 task 尚未实测 | 若不能保持单次调用和原子应用，停止 M5，不引入第二套队列 |
| 桌面仓库继续以 Contract tarball 接入网页仓库 | 当前依赖已核实 | 若分发机制变化，先更新跨仓库版本决策和可追溯门 |

## 11. 风险与回退

| 风险 | 最小影响范围 | 缓解与回退 |
| --- | --- | --- |
| PowerPoint 原生导出逐页不保真或挂死 | M2 原生动画能力 | 临时副本、哈希、超时、PID 回收和 10 次循环；NO-GO 后关闭 `PRESERVE_NATIVE`，保留 M1 |
| 原生视频迫使整份课件单体导出，破坏恢复模型 | M2 | 不接入；禁止用粗切补救，继续静态处置 |
| disposition 沿用到变化后的源课件 | M1 生成诚信 | 绑定 manifest hash；新解析自动失效并重新审核 |
| 左右布局预览与最终成片漂移 | M3 PAGE_RENDER | 唯一布局规格和 layout version 入 hash；失败时停用新版本，旧任务保持可读 |
| display/spokenText 不同导致字幕假精确 | M3 字幕 | 只在确定映射时用词边界；否则用最终 segment 时长并要求人工分段 |
| 真实 Provider/Edge 费用、限流或网络失败 | M4 外部调用 | 单个 Beta Provider、单次调用、显式重试、费用前置说明；失败不降级为假成功 |
| 桌面升级损坏数据或候选不可追溯 | M4 安装生命周期 | 复用备份/回滚、记录全部哈希与 commit；任一失败不覆盖稳定候选 |
| 自然语言越权或陈旧应用 | M5 单页 revision | strict 字段、无副作用 proposal、乐观并发、单事务应用、人工批准；失败保留原 revision |
| 人物动作素材无许可或播放不自然 | Optional R&D | 完全隔离主线；失败即保留开/闭两态，不影响 Release A/B |

## 12. STOP 条件

- **M0**：文档仍无法确认哪一份是当前事实，或金样不可重复生成时，不进入实现。
- **M1 / Release A 全局 STOP**：含动画页面仍能在没有匹配 disposition 时生成，或结果页无法报告处置时，禁止构建 Beta 候选。
- **M2 局部 STOP**：逐页隔离、时序、源文件安全、取消或进程回收任一失败，判定 NO-GO；只停止原生动画，不阻塞 M3/M4。
- **M3 / Release A 全局 STOP**：预览/成片几何不一致、PPT/字幕被遮挡、字幕映射需要猜测，或缓存跨 layout/version 复用时，禁止构建 Beta 候选。
- **M4 / Release A 全局 STOP**：Beta Provider、Edge TTS、10 页全链、安装/升级/回滚或进程清理任一必过项失败，不发布 Release A。
- **M5 / Release B 局部 STOP**：proposal 不能保持零副作用、应用不能保持不可变 revision/乐观并发/显式批准，停止 Release B，不放宽权限。
- **Optional R&D 局部 STOP**：素材许可不明或连续播放不通过，停止人物动态，不影响任何主线结论。

## 13. Review Notes

### 重审前评分（上一版）

| 维度 | 分数 | 主要问题 |
| --- | ---: | --- |
| 完整性 | 2/5 | 没有解决动画如何进入最终视频或如何由用户明确接受丢失 |
| 可行性 | 2/5 | 七家账号、WPS、外部课件、桌面候选被合成一个超大前置门；手势又缺素材 |
| 范围 | 2/5 | 外部矩阵、布局、手势、自然语言混在一条线，没有清晰发布结果 |
| 可测试性 | 3/5 | 有命令，但缺动画视觉 golden、时序、安装候选和提案事务验收 |
| 风险 | 4/5 | 已有 STOP/回退意识，但多为全局停止，无法局部降级继续交付 |
| 假设 | 2/5 | 把动画识别等同成片处置，对 Provider、素材和原生导出能力假设过多 |

### 重写后评分

| 维度 | 分数 | 解决方式 |
| --- | ---: | --- |
| 完整性 | 5/5 | 定义 Release A/B、M1 明确处置、M2 GO/NO-GO、M4 安装闭环和所有失败路径 |
| 可行性 | 5/5 | 复用现有 revision/worker/media/desktop；高风险原生导出先单页 POC，失败可局部关闭 |
| 范围 | 5/5 | 两个发布与 Optional R&D 分离；七 Provider、WPS、100 页和任意动画不再挤入同一门 |
| 可测试性 | 5/5 | 每个里程碑有固定输入、可观察结果、专项命令、人工证据和明确阈值 |
| 风险 | 5/5 | 每个风险限定影响范围并给出不损害现有链路的回退；M2/M5/R&D 均可局部停止 |
| 假设 | 5/5 | 已验证、官方可查和待实测事实分开；每个未验证假设都有失效动作 |

最终自审：6/6 维度达到 5/5。最重要的修正是把“动画事实已识别”与“成片已保留动画”彻底分开，并让原生导出失败仍能交付一个诚实、可审核的内部 Beta。
