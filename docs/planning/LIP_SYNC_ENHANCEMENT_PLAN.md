# 数字人多嘴型唇形增强实施计划

## Context

当前仓库同时存在两条视频入口，但两条都没有音频语义驱动的自然唇形：

- 旧 CLI 在 `backend/video/create-video.mjs:50-105` 预合成整张开口/闭口头像，并按闭口 `0.12s`、开口 `0.10s` 机械交替；它不读取静音、词边界或发音信息。
- 正式产品 `PAGE_RENDER` 在 `backend/app/render-adapter.ts:15,55-70` 硬编码 `teacher-closed.png`，整页视频实际是静态闭口。
- 正式 AUDIO 子进程在 `backend/app/edge-tts-child.mjs:13` 关闭了字幕/词边界保存；当前安装的 `node-edge-tts@1.2.10` 已请求 `wordBoundaryEnabled`，启用 `saveSubtitles` 后会写出词级起止时间，但仓库尚未校验、持久化或消费它。
- `backend/app/render-repository.ts:74-87` 的分页输入哈希没有真实冻结 `avatarId`、数字人素材内容、嘴型时间轴或驱动算法版本，所以教师选择与正式成片可能不一致，缓存也不能正确失效。
- 当前开口/闭口是两张独立全身图；本次扫描显示两图约 25.2% 像素发生变化，差异扩散到嘴部以外，继续生成更多整身姿态会产生人物闪烁。
- `docs/product/PPT-Digital-Human-Video-PRD-v1.0.md:570-582` 已把“音频包络控制嘴部开合”列为 MVP，把音素级口型、Live2D 和高精度面部驱动列为后续能力。本计划保持这条产品边界。

目标是把首版升级为三位教师均可用的稳定五嘴型素材包，以“词边界限定说话区间 + 音频能量控制开合幅度 + 拼音韵母提示圆唇”驱动；缺少词边界时确定性降级为多级能量驱动。正式产品和旧 CLI 共用同一驱动核心，但不引入 GPU、Live2D、云端唇形服务、新 Worker、公开 API 或设置 UI。

## Confirmed outcome

### 首版素材状态

每位教师提供同规格的五种嘴型：

| 状态 | 语义 | 开合等级 |
| --- | --- | --- |
| `CLOSED` | 静音、停顿、句首句尾常态 | 0 |
| `SMALL` | 轻声或发音过渡 | 1 |
| `MEDIUM` | 常规讲话 | 2 |
| `LARGE` | 强音或高能量讲话 | 3 |
| `ROUND` | 有可靠发音提示时的圆唇元音 | 2 |

`ROUND` 是形状状态，不是第四档张口幅度。相邻帧平滑约束按表中的开合等级计算。

### 驱动模式

- `BOUNDARY_ENERGY`：词边界限定发声区间，音频包络选择 `SMALL/MEDIUM/LARGE`，离线拼音韵母提示在可靠区间内选择 `ROUND`。
- `ENERGY_ONLY`：词边界缺失、为空或未通过严格校验时使用；只选择 `CLOSED/SMALL/MEDIUM/LARGE`，不随机使用 `ROUND`。
- 音频无法解码、包络无法生成或时长无法对齐时失败为稳定的非成功终态，不退回旧机械开闭口，也不生成看似成功的成片。

三位教师最终都必须通过发布门禁；实施顺序为周老师真实纵切先行，随后补齐林老师和严老师。任何正式任务都不得把未准备好的教师静默替换成周老师。

## Approach

### L0. 先关闭两个最小 POC，不改生产路径

1. **Edge 词边界 POC**
   - 对三种当前正式音色各合成一条固定、公开的 15～20 秒中文金样。
   - 临时启用 `node-edge-tts` 的 `saveSubtitles`，读取其随 MP3 生成的 JSON sidecar。
   - 验证每项都有非空文本、`0 <= startMs < endMs <= audioDuration + tolerance`，排序后不逆序；非标点中文覆盖率写入报告。
   - 同一条音频和同一份 sidecar 反复构建时间轴，输出哈希必须完全一致。这里不要求两次在线 TTS 重新合成的字节或时间完全相同。
   - 若 sidecar 缺失或不合格，记录为 `UNAVAILABLE` 并验证 `ENERGY_ONLY`；不得从字幕句长伪造词边界。

2. **圆唇拼音 POC**
   - 优先评估后端专用的 `pinyin-pro`，因为现有依赖没有上下文拼音/韵母能力；候选当前提供 Node/TypeScript 支持、MIT 许可和零运行时依赖。
   - POC 使用真实高数口播词汇覆盖多音字、数字、拉丁字母、公式朗读和常见圆唇韵母；产出“输入文本 → 拼音/韵母 → 是否圆唇”的固定 golden。
   - 只有准确性、许可证、锁文件变化和安装体积均被接受后，才把精确版本固定到 `backend/package.json`；前端不得依赖它，也不得进入浏览器 bundle。
   - 若 POC 不通过，不安装该依赖，`ROUND` 素材仍保留但首版驱动只使用四个幅度状态。不得用手写的不完整汉字表或随机时间片替代。

3. 把 POC 结论写入 `docs/reviews/LIP_SYNC_V1_POC.json`，至少包含依赖版本、许可、测试语句哈希、三音色边界状态、覆盖率、选择结果和明确降级结论。

### L1. 建立“固定底图 + 嘴部局部贴片”素材规范

1. 在主仓库建立按稳定业务 ID 组织的素材包：

   ```text
   backend/assets/avatar/
   ├── catalog.json
   ├── avatar-zhou/
   │   ├── manifest.json
   │   ├── base.png
   │   └── mouth/{closed,small,medium,large,round}.png
   ├── avatar-lin/...
   └── avatar-yan/...
   ```

2. 每个 `manifest.json` 严格记录：
   - `schemaVersion`、`avatarId`、`assetVersion`；
   - 原始画布宽高、人物锚点、嘴部 ROI；
   - 底图和五张贴片的相对路径、SHA-256、宽高；
   - bundle fingerprint，由规范化 manifest 和所有素材哈希确定性生成。

3. 资产制作规则：
   - 现有教师静态图是不可变底图来源；生成或修图工具只用于嘴部 ROI。
   - 即使工具输出整张人物图，也只能提取嘴部 ROI，不能把重绘后的头发、眼镜、脸型、衣服、手势或轮廓写回底图。
   - 五个贴片使用完全相同的 ROI、画布和锚点；透明区域不得改变底图。
   - 先完成周老师五状态并做真实纵切；算法通过后以同一规则制作林老师、严老师。

4. 增加素材硬门：
   - catalog/manifest 必须通过 strict Schema；相对路径不能逃逸素材根目录。
   - 所有 PNG 可解码、尺寸/alpha/哈希符合 manifest。
   - 将每个贴片合成回底图后，ROI 外像素必须逐字节不变。
   - 嘴部 ROI 不得越过脸部安全框；五个成图在 100% 和 400% 放大下人工检查无接缝、肤色跳变和牙齿闪烁。
   - 任一教师失败时，该教师不能进入正式 catalog 的 `ready` 集合。

### L2. 增加最小内部契约和向前数据迁移

1. 在 `packages/contracts/src/lip-sync.ts` 定义并测试以下 strict Zod Schema：
   - `LipPoseSchema`：上述五个状态；
   - `WordTimingCaptureSchema`：版本、`AVAILABLE/UNAVAILABLE`、provider、相对句段的词文本和起止毫秒；
   - `LipSyncRunSchema`：连续的 `startFrame/endFrame/pose`；
   - `LipSyncTimelineSchema`：schema/driver/config 版本、`12|25|30` FPS、总时长、总帧数、模式、连续 run、输入哈希与统计信息；
   - `AvatarMouthManifestSchema` 和 `AvatarCatalogSchema`。

2. 时间轴采用 run-length encoding，不逐帧保存重复状态。Schema 必须验证：
   - 第一段从第 0 帧开始，最后一段覆盖 `totalFrames`；
   - run 连续、无重叠、无空洞，相邻 run 不得重复同一 pose；
   - 相邻帧最多跨一个开合等级；
   - 时间轴时长与音频时长误差不超过一帧；
   - `ENERGY_ONLY` 不得包含 `ROUND`；
   - 同一规范化输入生成同一 SHA-256。

3. 使用一个向前 Prisma migration，保持既有行可读，不做破坏性 backfill：
   - `AudioSegment.timingMetadata Json?`：新音频保存严格词边界结果或显式 `UNAVAILABLE`；历史 `null` 表示旧资产没有捕获元数据。
   - `RenderedPage.avatarId String`：历史行默认记为实际旧渲染人物 `avatar-zhou`。
   - `RenderedPage.avatarAssetVersion String`：历史行记为 `legacy-static-v1`。
   - `RenderedPage.lipSyncTimeline Json?` 与 `lipSyncTimelineHash String?`：新渲染必须存在并通过 Schema/哈希复核；历史行为 `null`，不伪造新能力。

4. 这些字段保持后端内部审计用途；现有公共 `AudioTimeline`、`RenderedPage`、下载清单、CLI 参数和最终 MP4/SRT/讲稿文件名不增加字段。

### L3. 在 AUDIO 阶段捕获并冻结词边界

1. 修改 `backend/app/edge-tts-child.mjs`：
   - 开启 sidecar 保存；仍由现有独立子进程、超时和取消机制管理。
   - 不把不可信 JSON 直接传入业务层；只写 attempt 目录内的候选文件。

2. 修改 `backend/app/audio-adapter.ts`：
   - MP3 通过现有解码、时长、采样率、静音和削波门后，再按 `unknown` 读取 sidecar 并用共享 Schema 校验。
   - 对边界排序、范围、文本和音频时长做交叉校验；轻微编码尾差只允许固定容差内 clamp，超出则保存显式 `UNAVAILABLE`，不能猜测修复业务时间。
   - Adapter 返回音频质量指标和 `timingMetadata`；sidecar 不是独立公共 Asset。

3. 修改 `backend/app/audio-repository.ts` 和 `audio-worker.ts`：
   - AUDIO 输入哈希和 config hash 增加 `timingCaptureVersion`，让新正式任务不误用完全没有时间元数据的旧缓存。
   - 新缓存命中前除音频字节完整性外，还必须解析 `timingMetadata`；显式 `UNAVAILABLE` 是合法、可复用的降级结果。
   - 成功事务把音频 Asset、AudioSegment 和时间元数据原子写入；失败不得留下半登记元数据。
   - 历史成功 AudioSegment 不回填、不重新外发文本；若用户显式拿历史音频继续渲染，按 `ENERGY_ONLY` 审计。

4. 扩展现有固定公开短句的 Edge opt-in 测试，验证三音色均可解码，并如实报告边界是 `AVAILABLE` 还是 `UNAVAILABLE`。测试不得外发课件正文。

### L4. 实现两条入口共用的确定性嘴型驱动核心

1. 在 `backend/lip-sync/` 放置最小纯 ESM 核心和 TypeScript 声明，使 Node `.mjs` CLI 与 `tsx` Worker 调用同一实现；产品侧在调用前后用 `packages/contracts` 严格解析。不要创建通用媒体框架或第二套运行时。

2. 核心只接收纯数据：
   - 单声道 PCM 样本、采样率、音频时长与目标 FPS；
   - 可选、已校验的词边界和对应口播文本；
   - 固定版本的驱动参数和可选韵母分类器。

3. Adapter 使用现有 FFmpeg 把待渲染页/场景音频解码为 16 kHz、mono、signed 16-bit PCM。解码失败、样本数异常或音频时长差超过容差时返回稳定错误，不在核心中调用 shell。

4. 首版算法按以下顺序确定性运行，参数先作为版本化常量经金样调优后冻结：
   - 以约 40 ms 窗计算每个输出帧附近的 RMS/dBFS 包络；全静音输入直接输出全程 `CLOSED`。
   - 用当前音频的低/高分位估计 noise floor 和 speech peak，并把阈值限制在安全范围，避免不同音色响度造成固定阈值失真。
   - 采用约 40 ms attack、80 ms release、上下行 hysteresis；连续静音达到 160 ms 后必须闭口。
   - 归一化能量分为 `SMALL/MEDIUM/LARGE`；相邻帧最多改变一个开合等级，非停顿状态默认至少保持两帧，防止高频抖动。
   - `BOUNDARY_ENERGY` 对边界前后使用小于两帧的固定 padding，边界外只能闭口；在边界内把拼音音节按顺序映射到时间区间，只有受认可的圆唇韵母且能量已过说话阈值时才选择 `ROUND`。
   - 单个词无法得到可靠拼音时，该词只用幅度状态，不让整段任务失败；整个边界集合不可靠时切换为 `ENERGY_ONLY`。

5. 输出 `LipSyncTimeline` 和规范化哈希。统计至少包括：模式、各 pose 帧数、最长静音响应、开合最大步长、边界覆盖率和圆唇覆盖率，供测试/审计使用，不进入用户可编辑设置。

### L5. 用一页周老师真实纵切证明正式产品路径

1. `backend/app/render-repository.ts` 创建分页任务时必须严格读取项目的 `avatarId`；设置缺失、未知或素材未 ready 时返回稳定错误，不再硬编码周老师。

2. 每页 RENDER snapshot 和 `inputHash` 冻结：
   - 已有 source/audio/overlay/placement/FPS；
   - `avatarId`、avatar bundle fingerprint、`assetVersion`；
   - 每个 AudioSegment 的 timing metadata/hash；
   - lip-sync schema/driver/config 版本；
   - renderer version 升级为新的明确版本。

   即使页面选择 `hidden`，上述全局人物版本仍按已确认验收标准进入缓存键，确保 `avatarId` 或素材变化不会命中旧分页视频。

3. `backend/app/render-adapter.ts`：
   - 先按当前逻辑生成完整原页和教学 overlay 的静态母版。
   - 每个词边界最初都相对单句 AudioSegment；按 `slideOrder/segmentOrder` 和已冻结的逐句真实时长累加为页级偏移，逐句末尾不得越过对应 segment，最终页级边界与拼接后的页音频在一帧内对齐。
   - 从素材 manifest 合成五个稳定人物 pose；每页每个 pose 只由 Sharp 生成一次，不逐帧写数百张 PNG。
   - 生成页级 PCM 和嘴型时间轴，把相邻相同 pose 合并为 FFmpeg concat run，再以请求的 25/30 FPS 编码 H.264/AAC `yuv420p`。
   - `frameBytes` 继续使用 `CLOSED` 作为结构基准帧；动态视频和音频时长必须与时间轴在一帧内一致。
   - 继续沿用 fresh attempt 目录、heartbeat、取消进程树、输出解码/FPS/时长校验。

4. `backend/app/render-worker.ts`：
   - 在登记 PAGE_FRAME/PAGE_VIDEO 前严格解析时间轴并复核 hash。
   - 事务内把实际 `avatarId`、素材版本、时间轴 JSON/hash 与 RenderedPage 一起写入。
   - 新版缓存命中时同时复核 frame/video 字节完整性、时间轴 Schema/hash 和素材/驱动版本；任一不合格返回 `RENDER_CACHE_INVALID`，不回退旧缓存。

5. 首个 tracer bullet 只使用周老师和一页 15～20 秒真实中文音频，依次证明：
   - 正常边界模式或如实的能量降级；
   - 停顿闭口、开合平滑、圆唇不随机；
   - 重试/取消/缓存/最终媒体门均未破坏。

   周老师纵切失败时停止，不横向制作另外两套素材。

### L6. 扩展到三位教师并硬化验证

1. 周老师纵切通过后，按 L1 同规格制作林老师、严老师五贴片；三者必须使用前端既有稳定 ID：`avatar-zhou`、`avatar-lin`、`avatar-yan`。

2. 增加三位教师的集成覆盖：
   - 相同 PPT/音频切换 `avatarId` 会改变 page input hash 和 PAGE_VIDEO hash；
   - 成片实际人物与选择一致；未知/未 ready 教师明确失败；
   - 同一教师、同一音频、同一素材和版本命中缓存时 adapter 调用为零；
   - 只改嘴型算法/素材版本也必须使缓存失效。

3. 调整 `backend/app/media-adapter.ts::verifyCoverage`，只比较原 PPT 安全画布区域或明确 mask 掉嘴部动态 ROI；这只是消除合法嘴动对页面覆盖对比的干扰，不能放宽原页覆盖、遮挡、黑帧、静音、响度、Fast Start 或完整解码门。

4. 增加页级唇形专项硬门：
   - 静音持续至少 160 ms 时最迟两帧闭口，重新发声最迟两帧响应；
   - 相邻帧最大开合步长为 1；
   - 相同输入时间轴/hash 完全一致；
   - `ENERGY_ONLY` 不含 `ROUND`；
   - 三套人物 ROI 外像素完全稳定；
   - 25/30 FPS 均可解码，音视频/时间轴误差不超过一帧。

### L7. 让旧 CLI 复用核心，不保留机械二态实现

1. `backend/video/synthesize.mjs`：
   - 新合成句段保存并校验词边界，把相对句段边界按现有场景 lead/gap/tail 换算为 scene hints。
   - 既有 Edge MP3 缓存继续可离线复用；没有新 timing metadata 时明确进入 `ENERGY_ONLY`，不强制重新联网合成 84 句。
   - 静音回归模式必须输出全程闭口。

2. `backend/video/create-video.mjs`：
   - 删除 `0.12/0.10s` 开闭口交替和两张独立全身图逻辑。
   - 使用同一 ESM 驱动核心、周老师 manifest 和现有 12 FPS 生成 run-length concat。
   - 保持现有 CLI 参数、`output/` 中 MP4/SRT/讲稿名称与媒体规格不变；内部 `scene-timeline.json` 可增加版本化的可选唇形审计字段。

3. 单独的完整复现包是可交付副本而非第二事实来源：
   - 主仓库通过全部 CLI 门禁后，再把已验证的核心、周老师素材包和必要脚本白名单同步到 `导数数字人视频-完整复现包-EdgeTTS`。
   - 同步时写入来源版本和文件 SHA 清单；若拼音 POC 通过，复现包固定同一依赖版本。
   - 更新复现包 README，把“两帧机械交替”改为真实模式/降级模式说明。
   - 发布前比较主仓库与复现包核心文件 SHA；不允许手工维护两份不同算法。

### L8. A/B 人工验收、收口与发布门禁

1. 在删除生产旧逻辑前，用临时且最终不保留的评测步骤，为三位教师各生成同一段 15～20 秒的旧二态/新多嘴型并排样片。旧算法只用于本次 baseline，不作为运行时或长期测试实现保留。

2. 人工逐位确认：
   - 明确停顿时闭口，句末不持续讲话；
   - 没有机械式高频抖动或闭口直接跳大张口；
   - 圆唇只在合理发音附近出现；
   - 人物的头发、眼镜、脸型、衣服、手势和轮廓不闪烁；
   - 与旧二态相比整体明显更自然。

3. 样片本体放在 Git 忽略的评测目录；`docs/reviews/LIP_SYNC_V1_EVAL.json` 记录输入/输出哈希、三位教师模式、自动指标、人工结论、评测时间和未通过原因。三位全部通过才能声明功能完成。

4. 最后更新 `docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/STATUS.md`、`docs/CURRENT_TASK.md` 和相关 README；文档必须区分：
   - 五 pose 资产能力；
   - `BOUNDARY_ENERGY` 与 `ENERGY_ONLY` 实际模式；
   - 简化唇形不是音素级精确同步。

## Key decisions

- **固定底图 + 局部嘴贴片，而非五张全身图。** 这是防止人物整体闪烁的硬边界，ROI 外像素稳定可自动证明。
- **三位最终覆盖，周老师先做 tracer bullet。** UI 已开放三位教师；只支持一位会继续造成预览与成片不一致。
- **词边界和能量联合驱动。** 边界负责说话/停顿，能量负责幅度；圆唇只是简化的发音提示，不宣称音素精确。
- **降级必须显式且可审计。** 无边界使用 `ENERGY_ONLY`；无音频包络则失败。后来的“不得随机伪造圆唇”约束优先，因此能量降级不使用 `ROUND`。
- **正式产品是事实来源，两条入口共用核心。** 不扩展两份算法；复现包只接收经过主仓库验证的白名单副本。
- **复用 AUDIO/PAGE_RENDER Worker。** 不新增任务种类、队列、GPU Worker、云端服务或浏览器媒体工作。
- **不增加用户设置。** 首版参数以 driver/config 版本冻结，先建立可靠默认值；未来真有调节需求时只局部修改配置/契约，不触碰音频和任务架构。
- **依赖通过 POC 才引入。** 当前 ladder 中现有代码、Node/FFmpeg 和已安装依赖足以完成包络与边界；只有上下文拼音/韵母缺口可能需要一个固定版本的新库。
- **历史数据不伪造回填。** 历史音频/分页记录保持可读；新任务用版本化输入哈希生成新证据，旧音频继续渲染时明确走能量降级。

## Files to modify

### 契约与持久化

- `packages/contracts/src/lip-sync.ts`：新增嘴型、词边界、时间轴、素材 manifest/catalog Schema。
- `packages/contracts/src/index.ts`：重导出新契约。
- `packages/contracts/src/lip-sync.test.ts`：strict、连续性、模式、哈希和拒绝边界测试。
- `backend/prisma/schema.prisma`：最小内部审计字段。
- `backend/prisma/migrations/<timestamp>_lip_sync_v1/migration.sql`：只向前迁移和历史默认语义。

### 素材与驱动核心

- `backend/assets/avatar/catalog.json` 与三位教师各自的 manifest/base/mouth PNG。
- `backend/lip-sync/driver.mjs` 及类型声明：唯一确定性驱动核心。
- `backend/lip-sync/avatar-assets.mjs` 及类型声明：安全加载、hash/ROI/路径校验。
- `backend/app/lip-sync.ts`：产品侧 Zod wrapper 和稳定 Worker 错误映射。
- `backend/app/lip-sync.test.ts`、`backend/app/avatar-assets.test.ts`：算法与素材专项。

### 正式 AUDIO/PAGE_RENDER

- `backend/app/edge-tts-child.mjs`。
- `backend/app/audio-adapter.ts`、`audio-repository.ts`、`audio-worker.ts`。
- `backend/app/render-adapter.ts`、`render-repository.ts`、`render-worker.ts`。
- `backend/app/media-adapter.ts`：页面覆盖比较隔离合法嘴部动态。
- `backend/app/stage-td.integration.test.ts`、`stage-te.integration.test.ts`、`render-benchmark.test.ts`、`stage-tf.integration.test.ts`、`stage-tg.e2e.integration.test.ts`。
- `backend/package.json`、根 `package.json`、`package-lock.json`：只在 POC 通过时固定拼音依赖，并增加专项命令。

### 旧 CLI 与独立复现包

- `backend/video/synthesize.mjs`、`backend/video/create-video.mjs`、必要的 CLI 回归测试/fixture。
- 独立复现包的 `build/video/synthesize.mjs`、`build/video/create-video.mjs`、`build/avatar/`、`README.md`、来源 SHA 清单；若依赖 POC 通过，再更新其 `package.json/package-lock.json`。

### 文档和评测记录

- `docs/reviews/LIP_SYNC_V1_POC.json`、`docs/reviews/LIP_SYNC_V1_EVAL.json`。
- `docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/STATUS.md`、`docs/CURRENT_TASK.md`、`backend/README.md`。

## Out of scope

- 音素级强制对齐、viseme 模型、Live2D、3D、写实面部驱动或生成式视频；这些不是“稍微生动”的最小解。
- 眨眼、表情、点头、手势和身体动作；它们需要独立状态组合与冲突时间轴。
- 自定义数字人上传、素材审核 UI、口型强度/模式 UI。
- 新的公开 API 字段、下载格式、CLI 参数、视频画幅或媒体编码规格。
- 新 Worker、Redis/BullMQ、GPU、对象存储、云端唇形供应商或生产 TTS 绑定。
- 为 `ROUND` 维护手写汉字表，或在无可靠提示时随机播放圆唇。
- 保留旧机械二态作为运行时 fallback；它只允许在一次性 A/B baseline 中短暂存在。

## Verification

所有命令串行运行，避免数据库、attempt 目录和 `frontend/.next` 竞态。

### POC 与专项

```powershell
npm.cmd run test:contracts
npm.cmd run test:lip-sync
npm.cmd run test:stage-11d
npm.cmd run test:stage-11e
npm.cmd run test:stage-11f
```

预期：

- Contract 拒绝未知字段、时间轴空洞/重叠、跨级跳变、`ENERGY_ONLY + ROUND`、越界词时间和不连续帧。
- 算法测试覆盖全静音、连续讲话、短停顿、句末停顿、边界缺失、边界损坏、圆唇与相同输入同 hash。
- AUDIO 测试覆盖 timing metadata 原子写入、显式 unavailable 缓存、旧缓存版本隔离、取消和质量门。
- PAGE_RENDER 覆盖三教师、25/30 FPS、缓存失效/命中、fresh attempt、取消、ROI 稳定和时间轴审计。
- 最终媒体仍通过编码、时长、完整解码、Fast Start、响度、黑帧、页面覆盖、遮挡和哈希门。

外部 Edge POC 只使用固定公开语句，并显式 opt-in：

```powershell
$env:PPT_DH_STAGE_TD_REAL_EDGE = "1"
npm.cmd run test:stage-11d
Remove-Item Env:PPT_DH_STAGE_TD_REAL_EDGE
```

预期：三音色音频均可解码；边界结果按真实结果记录为 `AVAILABLE` 或 `UNAVAILABLE`，测试和报告不把 unavailable 伪装成 pass。

### CLI 回归

```powershell
npm.cmd run backend:run -- --input "<公开或合成fixture.pptx>" --job-dir "<全新临时job目录>" --planner rules --tts-mode silent
npm.cmd run backend:run -- --input "<公开或合成fixture.pptx>" --job-dir "<另一全新临时job目录>" --planner rules --tts-mode edge
```

预期：

- silent 模式全程闭口；edge 模式按实际 metadata 使用边界或如实能量降级。
- CLI 参数、输出 MP4/SRT/讲稿文件布局不变；成片 H.264/AAC、`yuv420p`、Fast Start、可完整解码。
- `backend/video/create-video.mjs` 不再含 `0.12/0.10` 机械交替或 `mouthIndex % 2`。

### 完整门禁

在更新 `docs/STATUS.md` 与 `docs/CURRENT_TASK.md` 后严格串行运行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:test
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

预期：全部退出码为 0，lint 为 0 warning，路由 6/6 且服务正常回收；新增专项和三位 A/B 评测报告也全部通过后，才能把唇形增强标记完成。

## STOP conditions

- 周老师真实纵切未通过自动门或人工 A/B：停止，不制作另外两套教师素材。
- 任一素材 ROI 外像素变化、manifest/hash 不一致、素材来源/使用权不明确：停止该教师发布，不扩大 ROI 掩盖问题。
- Edge sidecar 或拼音 POC 失败：按已确认方案降为四幅度 `ENERGY_ONLY`，删除未证明的圆唇运行路径；不得换成随机/机械规则。若产品仍要求首版必须出现圆唇，则停止并重新确认供应商或强制对齐方案。
- 新实现要求修改公开 API、增加用户设置、新 Worker、GPU、云服务或第二渲染框架：停止并重新规划，不顺带扩域。
- 新版分页缓存无法同时冻结 avatar、素材、timing 和 driver 版本，或缓存完整性复核失败：停止，不关闭旧代码。
- 任一 25/30 FPS、取消、重试、最终媒体或完整串行门禁失败：保留失败证据并停止，不同步独立复现包、不宣称完成。
- 主仓库和独立复现包驱动核心 SHA 不一致：复现包不得交付。

## References

- `pinyin-pro` 候选的能力、Node/TypeScript 用法、版本、许可和依赖信息以官方 [npm 包页面](https://www.npmjs.com/package/pinyin-pro) 与[项目文档](https://pinyin-pro.cn/en/guide/start.html)为 POC 起点；实施时仍需固定并复核实际选定版本。
