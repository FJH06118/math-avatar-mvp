# 基于当前成果的后续能力路线图

> 更新：2026-08-23
> 性质：规划工件；不代表任何后续功能已实现、任何外部供应商已验收，或 Windows 安装候选已重建。

## Context

当前工作树已完成一条新的、可自动验证的技术闭环：PowerPoint COM 动画事实提取、严格 `animation-manifest-v1`、原页多模态 PLAN 输入、动画教学语义解释，以及静态降级与进程回收边界。它解决了“解析时不能忽略动画、模型不应猜动画事实”的技术问题，但真实 WPS/旧 `.ppt`/复杂动画、七类真实 Provider、100 页容量和重建后的桌面包仍是人工验收缺口。

附件《总结1》提出的其余两条诉求也还没有形成可交付能力：正式渲染目前只支持右侧独立面板或隐藏，五档嘴型方案已被人工播放否决；“用户描述需求后直接修改”也不能绕过修订、审核和媒体验证边界。后续工作应先验证刚完成的核心链路，再按“安全布局 → 有限人物动态 → 受约束自然语言改稿”的顺序推进。

## 已核实的事实

- 动画事实来自 `backend/powerpoint_animation_adapter.py` 的隔离 COM 进程；PLAN 只能产生 `animationUnderstanding`，且 `packages/contracts/src/agent.ts` 会核对 effect ID 顺序，不能改写触发器或计时。
- `backend/app/render-adapter.ts:15-70` 将原页放在右侧面板之外的 `1500×844` 内容区；`packages/contracts/src/render.ts`、`backend/app/render-repository.ts` 和 `backend/app/teaching-settings.ts` 的正式允许值只有 `right-panel` 与 `hidden`。前端预览可画左侧，但正式设置规范化会丢弃左侧，因此不能把它称为正式能力。
- 旧五档唇形实验的 L5 已由人工播放判定失败；当前 `RenderedPage` 保持 `legacy-binary-v1` 和空 `lipSyncTimeline`。不应以静态帧或自动媒体指标推翻该结论。
- 现有不可变 `LessonPlanRevision`、显式批准、乐观版本和 PLAN/Worker 边界已经适合承载“提出修改 → 查看差异 → 批准后生成”，但不适合让自然语言直接改 PPT、执行代码或跳过审核。

## Approach

### A. 先完成当前核心链路的证据收口

1. 固化一份仅包含现实状态的验收矩阵，按来源、页面比例、文件格式、动画类别和 Provider 分类记录输入哈希、环境、预期事实、实际结果和人工结论。最低覆盖：原生 PowerPoint 与 WPS、普通 PPTX/旧 `.ppt`、4:3/纵向、无动画、主序列/交互序列、Morph/复杂路径/媒体触发器、PowerPoint 缺失和损坏文件。
2. 将自动化结果与人工结果分开记录。自动化只证明 Contract、静态降级、异常回收和 fixture 行为；Provider 真实账号、教学解释质量、播放语义和安装版 UI 必须保持 `MANUAL_TESTING_REQUIRED`，直到有可复查的人工作业证据。
3. 仅在本轮源码和专项测试通过后，按用户明确授权在桌面仓库重建新候选并执行既有 Windows 验收矩阵。不得把当前旧安装包、离线 fixture 或本机构建替代为新源码的安装验收。
4. 收口文档真相：更新当前路线图、README、PRD/架构中的过时“仅 Mock/仅三页/下一步仍是阶段 3”等描述，使它们指向当前代码和待人工验收项；历史记录留在状态/交接文档，不删除证据。

**完成标准：** 每个外部断言都有“通过、失败或未执行”的明确状态；失败的动画/Provider/安装样本不会被当作静态成功或供应商支持；当前桌面候选是否包含动画功能可由版本和验收记录独立证明。

### B. 实现受控的左栏 / 右栏 / 隐藏站位（第一个新功能纵切）

这是附件中“数字人位置需要灵活”的最小可交付定义：三个模板化安全布局，而不是自由拖拽、截图猜测或自动换边。

1. 先把 `left-panel | right-panel | hidden` 定义为共享的版本化布局规格。规格应以归一化 `slideRect`、`avatarPanelRect`、`subtitleSafeRect` 和布局版本为事实来源；后端按 1920×1080 转成像素，前端按同一规格渲染预览。共享规格是必要的，因为它保护“预览与成片几何一致”这一共同不变量。
2. 扩展 `packages/contracts/src/render.ts`、渲染 payload、`RenderedPage`、缓存输入哈希和媒体验证，使三种 placement 都是冻结任务输入；旧记录仍按 `right-panel`/`hidden` 读取，不做破坏性回填。
3. 将 `backend/app/teaching-settings.ts`、`frontend/src/lib/api/teaching-settings.ts` 与 `teaching-settings-form.tsx` 收敛到同一能力表。任何显示给用户的左/右/隐藏选项必须确实影响最终 PAGE_RENDER；在功能完成前，不能继续显示无效选项。
4. 在 `backend/app/render-adapter.ts` 中以布局规格替代散落坐标，并在 `media-adapter.ts` 增加可证明的几何门：PPT 完整 contain 在内容区，人物面板与 PPT/字幕安全区不相交，隐藏没有遗留人物像素。此阶段不做 OCR、图表识别或自动选边。
5. 以一页、两种栏位和隐藏的真实音频作为 tracer bullet；通过后再扩展到多页、4:3/纵向和缓存/重试/取消回归。

**完成标准：** 三种布局在预览和最终 1920×1080 MP4 中一致；左右栏都不遮挡完整原页或字幕；只变更某一页站位只重渲染该页；任何几何门失败都阻止媒体进入 `VALIDATED`。

### C. 人物观感：先做一个受控 POC，再决定口型或固定手势

五档嘴型失败意味着不能直接“继续优化”既有驱动。推荐先做低风险的**固定手势 POC**，而不是同时重启口型、增加手势和制作多位教师素材：它不改变音频时间轴，且可被新的安全面板约束。

1. 在生产路径之外建立一次性 POC：最多 2–3 个已获许可的低幅度手势/姿势，固定在安全面板内，使用显式 `none | explain | emphasize` 白名单，而不是由模型任意生成动作。记录来源许可、帧率、尺寸、透明度、哈希和面板安全区。
2. 只在真实 15–20 秒中文样片上作连续播放人工 A/B 验收，覆盖三种现有音色、至少一次停顿、公式讲解和长句。评估“是否自然、是否闪烁、是否越界、是否干扰阅读”，不以单帧截图或 ffmpeg 成功替代播放评价。
3. POC 通过后才把 gesture cue、资源版本和 layout version 冻结进 PAGE_RENDER 输入与缓存键；失败则删除/隔离 POC 产物并继续使用当前二态头像，不改变生产语义。
4. 把口型改进保留为独立立项。只有用户明确批准新的技术路线（例如新的可控素材、视频驱动或受限生成式方案）后，才重新建立完整的素材、同步、人工验收与回退计划；不得恢复已被否决的 L5 方案，也不得以手势成功来宣称口型已解决。

**完成标准：** 任一人物动态都在连续人工播放中通过预先记录的验收；资源在面板外像素不变；取消/重试/缓存与媒体硬门保持成立。未通过时，正式渲染保持现状。

### D. 最后引入“自然语言提出修改”，且只生成可审核提案

第一版只服务于讲稿/教学编排修改，不直接编辑 PPT 二进制、不执行代码，也不让模型替用户批准。

1. 定义一个最小 `ChangeProposal` 请求：`projectId`、单页或明确页集合、`expectedRevision`、用户意图文本和受限修改类型。首批只允许修改教学目标、`displayText`/`spokenText`、推导说明、现有 overlay 和已实现的 layout/gesture cue；动画事实、源页、权限、Provider 密钥和媒体验证规则不可写。
2. 复用现有 Provider snapshot、严格 `unknown` 验证、持久任务/幂等和 `LessonPlanRevisionEditRequest` 语义。模型输出的是受限差异提案，UI 必须展示逐字段 diff、影响页、风险标记和预计需重生成的下游任务；用户选择“应用”后才创建新的 pending revision。
3. 现有显式批准、锁定、乐观并发和生成门继续生效。陈旧 `expectedRevision`、锁定页、无视觉能力、超出允许类型、Prompt 注入、输出结构无效或 Provider 失败均不得写入修订。
4. 先用一个单页 vertical slice 验证“自然语言改写一段讲解 → diff → 人工批准 → 只重建受影响音频/页面”；验证通过后才考虑多页批量提案。不要建设通用 Agent 编排、任意工作流或“直接修改整份 PPT”。

**完成标准：** 同一意图/同一基线可幂等恢复提案；未点击应用不会产生 revision 或媒体；批准前不能生成；批准后仅失效受影响的下游资产，且动画事实与原页完整性仍由确定性链保持。

### E. 每一阶段后的桌面候选和人工回归

每个完成的源码阶段都先通过本仓库的串行门禁，再由用户授权决定是否进入桌面候选重建/安装。对本地源码、已安装包、真实 Provider 和外部 PPT 的证据分别标记；任何一项未验证都不是发布通过。

## Key decisions

- **优先级是证据收口，再扩展体验。** 动画/多模态正处于人工验收阶段，不能在其缺口上继续叠加 `CreateVideo`、自动布局或生成式人物能力。
- **灵活站位采用三种安全模板。** 左/右/隐藏已直接满足清晰的用户需求；自由拖拽、自动选边和视觉理解不是第一个版本所必需。
- **固定手势优先于再次接线失败的五档口型。** 这是推荐的最小实验，不是绕过口型 L5 人工失败的替代性“验收”。口型必须独立重立项。
- **自然语言是提案接口，不是执行权限。** 它只产生可验证、可比较、可撤销的 pending revision；人工批准和媒体硬门不会因语言模型存在而被弱化。
- **不新增第二套队列、存储或渲染框架。** 复用 PostgreSQL/outbox/lease Worker、现有 revision 和 Sharp/FFmpeg；只有 POC 证明现有路径不足时，才单独评估依赖或 GPU/外部服务。

## Files to modify

### 当前证据与文档真相

- `docs/CURRENT_TASK.md`、`docs/STATUS.md`：记录阶段状态和通过/失败/未执行证据。
- `docs/planning/DEVELOPMENT_ROADMAP.md`、`README.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`：消除已被代码超越的阶段和能力描述。
- `docs/reviews/`：新增人工验收矩阵与每次外部测试报告；不提交真实密钥、课件或媒体。

### 安全布局纵切

- `packages/contracts/src/render.ts`、`packages/contracts/src/project.ts`：placement 和布局版本的严格 Contract。
- 新建一个仅含归一化常量/校验的 `packages/contracts/src/render-layout.ts`，并从 `index.ts` 导出；不在其中放前端组件或 FFmpeg 逻辑。
- `backend/app/teaching-settings.ts`、`render-repository.ts`、`render-worker.ts`、`render-adapter.ts`、`media-adapter.ts`：冻结布局、渲染、验证和缓存失效。
- `frontend/src/lib/api/teaching-settings.ts`、`frontend/src/components/workspace/teaching-settings-form.tsx`、`slide-preview.tsx`：只呈现真正支持的选项，并依据共享布局规格预览。
- 对应 Contract、前端组件、Stage T-E/T-F/T-G 集成测试：覆盖历史兼容、三种布局、字幕/原页安全、缓存、取消和失败终态。

### 人物动态 POC

- `backend/assets/avatar/` 与 Git 忽略的评测工作目录：资源 manifest、哈希与验收样片；仅在许可确认后添加受控资源。
- `backend/app/render-adapter.ts`、`render-repository.ts`、`render-worker.ts`：仅在 POC 通过后冻结 gesture 版本和 cue。
- `docs/reviews/`：记录连续播放人工验收、拒绝原因和是否可进入正式路径。

### 自然语言修改提案

- `packages/contracts/src/agent.ts`、`lesson-plan.ts`：受限 ChangeProposal/差异 schema。
- `backend/app/lesson-plan-repository.ts`、`plan-worker.ts` 或明确的新提案 worker：使用现有 snapshot、幂等、错误和 revision 边界，不从 HTTP 请求直接调用 Provider。
- `frontend/src/components/workspace/`、`frontend/src/lib/api/real-tracer.ts`、对应 BFF/Hono route：意图输入、差异审阅、应用/取消和冲突提示。
- Contract、Provider fixture、revision、AUDIO/PAGE_RENDER 缓存和端到端测试：覆盖无副作用预览、锁定/陈旧冲突、拒绝越权字段、批准门和精确失效范围。

## Out of scope

- PowerPoint `CreateVideo`、屏幕录制、完整动画视觉复现、Morph/路径/媒体效果重建。
- 图片公式 OCR、截图驱动的自动换边/遮挡检测、任意自由拖拽位置、9:16/1:1 新画幅。
- 恢复已失败的五档嘴型，或把固定手势当作口型修复证据。
- 未经明确授权使用真实 Provider Key、外部课件、桌面包重建/安装或可产生费用的测试。
- 自然语言执行脚本、修改 PPT 二进制、自动批准讲稿、绕过 revision/锁定/媒体验证，或通用多 Agent 编排。

## Verification

每项实现按当前项目规则串行运行，避免共享 PostgreSQL、attempt 目录和 `frontend/.next` 竞争。

### 当前源码与动画/多模态回归

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:test
npm.cmd run test:contracts
npm.cmd run test:provider-gateway
npm.cmd run test:integration
npm.cmd run build
```

预期：全部退出码为 0；真实 PowerPoint/Provider opt-in 用例若未授权，必须清楚显示为 skip/pending，不能计为通过。

### 布局阶段新增/扩展的专项检查

```powershell
npm.cmd run test:contracts
npm.cmd run test:components -- workspace
npm.cmd run test:stage-11e
npm.cmd run test:stage-11f
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:test
npm.cmd run build
```

预期：left-panel、right-panel、hidden 都以相同布局版本进入任务输入；旧任务仍可读取；三种布局均通过解码、时长、原页覆盖、字幕安全和最终状态断言。

### 动态人物与自然语言阶段

- 动态人物新增专项必须验证资源许可/哈希、面板外像素稳定、25/30 FPS 解码、取消/重试/缓存和连续人工播放结论；人工不通过即为失败。
- 自然语言提案新增专项必须验证：无“应用”不写 revision、陈旧/锁定拒绝、schema/注入失败安全拒绝、批准前生成受阻、批准后只使受影响页的音频/渲染失效。
- 每个阶段的外部 Provider、PowerPoint、桌面包和人工播放结果分别写入验收矩阵；不以离线 fixture 代替。

## Assumptions and invalidation

| 假设 | 当前状态 | 失效时处理 |
| --- | --- | --- |
| 首发继续以 16:9、本机内部单用户和显式人工批准为边界 | 已由现有 Contract/决策支持 | 先更新 PRD/DECISIONS，再设计身份、画幅或审批变化；不在本计划中兼容猜测。 |
| 三模板面板足以满足近期“位置灵活” | 推荐，未做真实用户验收 | 若用户需要自由位置或自动换边，另立视觉/几何 POC，不扩展本阶段。 |
| 固定手势资源可获得明确项目许可 | 未验证 | 不制作/接线手势，保持二态头像并只保留口型新立项的决策门。 |
| 真实 Provider、外部 PPT 和桌面安装可由用户在合适时授权测试 | 未验证 | 相关验收保持 pending；不访问凭据或对外发课件。 |
| 现有 revision/worker 架构可承载单页语言修改提案 | 代码结构支持，但尚未实测该新流 | 先实现单页 tracer bullet；若需第二套队列或无法保持批准边界，停止并重新设计。 |

## Risk and rollback

| 风险 | 影响范围 | 缓解与回退 |
| --- | --- | --- |
| 外部 PPT 或真实 Provider 证明动画/视觉理解不可靠 | 当前动画功能的验收结论和桌面候选 | 记录具体样本/Provider 为失败或 pending；保留静态降级与人工批准，不把功能扩大到动画视觉重建。 |
| 新布局让预览与成片漂移或破坏已验证缓存 | 仅新的 PAGE_RENDER task 与其下游媒体 | layout version 必须进入输入哈希；保留 right-panel/hidden 解析，停止发布新 layout version 并重建受影响任务，不修改历史媒体。 |
| 手势资源无许可、闪烁或越过安全面板 | POC 样片；若错误接线可能影响新的渲染任务 | POC 先在生产路径外执行；任何失败只隔离 POC 资产，不改变已验证二态 renderer。通过后仍以资源/布局版本使缓存失效。 |
| 自然语言提案越权、幻觉或意外产生费用 | 单次提案任务、候选 revision 与 Provider 调用 | 提案在“应用”前不落 revision；严格字段白名单、单次调用、稳定错误与人工 diff/批准。失败时保留原 revision 和所有已验证资产。 |

## STOP conditions

- 当前动画/多模态人工矩阵暴露事实丢失、动画顺序/时序误导、Provider 视觉误判、资源泄露、100 页突破预算或桌面版本不一致时，先修复并复验，不进入布局或人物功能。
- 左右栏需要 OCR/截图推断才能安全、预览与成片不能使用同一布局规格、或任一布局遮挡 PPT/字幕时，停止在布局 tracer bullet，不自动回退为“看起来可用”。
- 人物动态连续播放未通过人工验收、资源许可不清楚、或破坏现有媒体/缓存/取消门时，不接入正式渲染。
- 自然语言提案无法限制字段、不能确保无副作用预览、无法处理陈旧/锁定 revision，或会改变动画事实/原页时，停止该功能而不是放宽 Contract。
- 任一阶段的必需命令失败、依赖新增无 POC、真实凭据/外部安装需要新授权，均停止并在状态文档记录证据。

## Review Notes

- 初稿依据：2026-08-23 的工作树、`docs/CURRENT_TASK.md`、`docs/STATUS.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、既有教学质量/唇形/Windows 计划，以及《总结1》的三项诉求。
- 此计划将“技术解析”从新增开发事项降为人工验证事项，将“灵活站位”收窄到可证明的三模板，将“口型/动作”拆成许可与人工播放门，并把自然语言功能限制为 revision 提案。

| 维度 | 初稿 | 收口后 | 收口方式 |
| --- | ---: | ---: | --- |
| 完整性 | 4/5 | 5/5 | 补充了外部验收、布局、动态人物和提案流的失败/停止/回退路径。 |
| 可行性 | 4/5 | 5/5 | 每个新方向都以单页或生产外 POC 为 tracer bullet；未验证依赖留在显式决策门。 |
| 范围 | 4/5 | 5/5 | 明确不做 CreateVideo、OCR、自由拖拽、失败嘴型恢复和任意 Agent 执行。 |
| 可测试性 | 4/5 | 5/5 | 加入现有串行命令、布局媒体门和各阶段新增专项的可观测通过条件。 |
| 风险 | 4/5 | 5/5 | 明确了外部证据、缓存/布局、资源许可和语言提案的影响范围与回退方式。 |
| 假设 | 3/5 | 5/5 | 将产品边界、资产许可、外部授权和 worker 承载能力逐项标记为已支持或未验证及失效动作。 |

最终自审：6/6 维度均为 5/5；没有把未验证的外部条件写成通过，也没有要求为未来需求预建通用框架。
