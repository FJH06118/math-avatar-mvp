# 课程讲解质量增强实施规划

> 状态：待实施  
> 编写日期：2026-08-13  
> 实施基线：当前 `main` 工作区代码与既有未提交修改  
> 核心原则：先把“可听、可改、可定位、可批准”的讲解质量闭环做完整，再扩展画面布局；所有自动化只给建议，不静默改写用户内容。

## 1. 结论先行

本轮不继续追求复杂唇形。数字人保持当前可用的开口/闭口方案，把优先级转向真正影响课程成片质量的四件事：

1. 数学公式朗读可见、可改，显示文本和朗读文本互不污染。
2. 讲稿按句编辑，每句可试听、重生成、设置句后停顿和一个重点短语。
3. 单页音频能够逐句定位：点击句子播放对应位置，播放时反向高亮当前句。
4. 所有修改都形成新的不可变 revision；pending revision 可以预览，但只有 approved revision 可以进入正式 AUDIO 和后续视频生成。

首个纵切只做单页质量闭环：

`公式朗读修正 → 逐句拆分 → 单句试听/重生成 → 设置停顿 → 生成单页预览 → 字幕逐句定位 → 批准新 revision`

画面布局放在第二阶段。左右数字人均使用独立侧栏，不覆盖 PPT；因此第二阶段的目标是实现真实的左栏、右栏、隐藏三种渲染和几何安全校验，而不是引入不可靠的图像识别。

## 2. 当前事实基线

### 2.1 已有能力

- `LessonPlanRevision` 已支持不可变版本、pending/approved 状态和批准门禁。
- 正式 AUDIO 创建已要求当前 revision 全部 approved。
- AUDIO Worker 已按 narration 生成稳定音频片段，并落库 `AudioSegment`、`SubtitleCue` 和 `AudioTimelineRecord`。
- 字幕已经使用 `displayText`，TTS 已使用 `spokenText`。
- 音频缓存已经基于输入快照哈希，可以扩展到停顿、重点和预览用途。
- 前端已有 `left | right | hidden` 设置，但后端正式渲染目前只真正支持 `right-panel | hidden`。
- FFmpeg、ffprobe 和 Edge TTS 已在现有后端管线中，不需要新供应商、新任务类型或新 Worker。

### 2.2 当前缺口

- `NarrationSegmentSchema` 只有 `id/displayText/spokenText`，没有停顿和重点信息。
- 前端保存讲稿时会把整页折叠成一个 narration，无法逐句维护稳定结构。
- 公式面板只读；用户无法清楚区分“屏幕显示公式”和“实际朗读文本”。
- 现有 preview 只支持固定试听文案，不支持 pending revision 的单句或单页预览。
- 当前字幕 cue 连续拼接且 cue 末尾等于总时长，不能表达句间静音。
- 前端没有单页连续音频资产，无法可靠做全局 seek 和当前句高亮。
- 后端渲染契约和适配器把所有非隐藏位置都折叠为右栏。

## 3. 范围与明确不做

### 3.1 本规划包含

- 当前 narration 的公式朗读修正。
- 结构化逐句编辑和安全拆句建议。
- 固定档位句后停顿。
- pending revision 的单句与单页音频预览。
- 单页音频与逐句字幕双向定位。
- 每句最多一个重点短语的确定性音频强调。
- approved revision 的正式音频兼容。
- 左栏、右栏、隐藏三种真实视频布局及安全校验。

### 3.2 本规划不包含

- 跨项目或全局公式读法词典。
- 任意毫秒输入、任意 SSML 或复杂韵律编辑器。
- AI 静默改写、自动批准或无确认自动拆句。
- 全课程多轨时间线编辑器。
- 基于截图的 OCR、目标检测或视觉遮挡模型。
- 新 TTS 供应商、新任务类型、新 Worker 或新队列。
- 继续增加复杂唇形类别；保持开口/闭口基线。
- 在没有稳定证据时自动改变重点片段的音高或语速。

## 4. 已确定的产品规则

### 4.1 Revision 与批准

- 用户修改讲稿、接受拆句建议、调整停顿或重点后，保存会创建新的 pending revision。
- revision 一经创建不可原地修改。
- pending revision 允许试听；试听不等于批准。
- 正式 AUDIO、PAGE_RENDER、COMPOSITE 仍只消费 approved revision。
- 旧 revision、旧预览任务和旧媒体资产不删除，保留审计链。
- 新 revision 内的 narration ID 由服务端按新 revision 和顺序重新生成，不信任浏览器提交业务 ID。

### 4.2 显示文本与朗读文本

- `displayText`：字幕和页面展示使用，保留正常数学公式写法。
- `spokenText`：TTS 使用，允许把公式改成自然中文读法。
- 公式解析结果提供默认朗读参考，但修正只进入当前 narration 的 `spokenText`。
- 不修改源 PPT 公式，不写全局词典。

### 4.3 停顿档位

| 档位 | 时长 |
| --- | ---: |
| 无 | 0 ms |
| 短 | 250 ms |
| 常规 | 500 ms |
| 长 | 900 ms |

- 新拆出的普通句默认 500 ms。
- 从段落换行识别到的段末句默认 900 ms。
- 既有历史 revision 缺少该字段时按 0 ms 解释，避免历史正式音频行为被悄悄改变。

### 4.4 长句建议

- 保存时，去除空白和 Unicode 标点后，字符数超过 45 给出警告。
- 实际试听的纯语音时长超过 12 秒再次给出警告；不把句后停顿算入该时长。
- 只在现有 `，,；;：:` 位置给拆分候选。
- 用户可以接受、编辑或忽略。
- 没有安全标点时只警告，不自动截断。
- 接受后创建新 revision，并重新生成 narration ID、预览输入哈希和字幕时间线。

### 4.5 重点短语

- 每句最多一个重点短语。
- 用户先从 `displayText` 选择连续片段。
- 保存时同时记录与之对应的 `spokenText` 连续范围；能够唯一匹配时自动映射，不能唯一匹配时要求用户在朗读文本中再选一次。
- 第一阶段不依赖 Edge TTS 的句内 SSML。AUDIO Worker 在同一任务步骤内把朗读文本拆为前段、重点、后段，使用相同 voice/rate/pitch 合成，并在重点前后各插入 250 ms 静音后拼接为一个最终句子资产。
- 不改变朗读内容；不在无证据时调整重点片段音高或语速。

### 4.6 预览与字幕定位

- 单句预览冻结：revision ID、narration ID、spokenText、voice、rate、pitch、停顿档位和重点范围。
- 单页预览冻结当前页全部 narration，并生成一个连续的页面音频资产和对应 timeline。
- 点击句子：播放器 seek 到该 cue 的 `startMs` 并播放。
- 播放过程中：根据 `currentTime` 高亮对应 cue。
- 本地未保存编辑立即标记“时间待更新”；保存、停顿变化、重点变化或声音参数变化后，旧预览与新输入哈希不匹配，也显示“时间待更新”。
- cue 的结束时间只覆盖实际语音；句后静音形成 cue 之间的合法空隙。

## 5. 目标用户流程

1. 用户打开工作区某一页，看到按句排列的讲稿。
2. 每句同时展示 `字幕文本` 和 `朗读文本`；检测到公式时，旁边展示解析出的默认读法。
3. 用户修正公式读法，或接受长句拆分建议。
4. 用户为每句选择句后停顿，并可设置一个重点短语。
5. 用户点击单句试听；pending revision 也可生成预览。
6. 用户点击“生成本页预览”，得到连续页面音频和逐句时间。
7. 用户点击任一句，播放器跳到该句；播放时当前句自动高亮。
8. 用户再次编辑时，界面明确提示时间线已过期，不继续展示旧时间为有效值。
9. 用户满意后批准 revision。
10. 正式 AUDIO 读取 approved revision，使用同一套停顿、重点和字幕时间算法。

## 6. 契约与数据设计

### 6.1 共享契约

新增 `packages/contracts/src/narration-quality.ts`，并从 `packages/contracts/src/index.ts` 导出：

```ts
type PauseAfter = "none" | "short" | "normal" | "long";

type NarrationEmphasis = {
  displayStart: number;
  displayEnd: number;
  spokenStart: number;
  spokenEnd: number;
};
```

扩展 `NarrationSegmentSchema`：

```ts
{
  id: string;
  displayText: string;
  spokenText: string;
  pauseAfter: PauseAfter;       // 旧 payload 缺失时解析为 none
  emphasis?: NarrationEmphasis;
}
```

索引统一按 JavaScript UTF-16 code unit 定义；Zod 校验所有索引边界、非空范围和 `slice` 结果，防止前后端出现不同切片语义。

新增纯函数和专项单元测试：

- `pauseAfterMs(level)`
- `countChineseEquivalentCharacters(text)`
- `findSafeSplitCandidates(text)`
- `validateEmphasisRanges(segment)`
- `buildNarrationFingerprint(snapshot)`

“中文等价字符”在第一版定义为：去除 Unicode 空白和标点后，每个剩余 Unicode code point 计 1。规则必须前后端共用，不能分别实现。

### 6.2 Revision 编辑请求

新增专用的 `NarrationEditSegmentSchema`，浏览器只提交内容和质量控制字段，不提交最终 narration ID。`LessonPlanRepository.revise` 在事务中获得 next revision 后，按 `revisionId + slideOrder + segmentOrder` 生成所有 narration ID。

这会同时解决：

- 接受拆句后必须生成新 ID。
- 浏览器不能伪造稳定业务 ID。
- revision 快照、预览缓存和字幕时间线具有确定性。

### 6.3 音频任务用途

不新增任务类型。现有 `AUDIO` payload 增加：

```ts
purpose: "formal" | "voice-preview" | "narration-preview" | "page-preview";
```

新增请求契约：

- `NarrationAudioPreviewCreateRequestSchema`
- `PageAudioPreviewCreateRequestSchema`

请求不接收客户端文本。服务端根据 revision ID 和 narration ID 读取数据库快照，校验 principal、presentation 归属和 revision 状态后再创建任务。

输入哈希必须包含：

- purpose
- revision ID / narration ID
- displayText / spokenText
- pauseAfter / emphasis
- voice / rate / pitch
- timing capture version
- 音频组合算法版本

任何字段变化都会产生新缓存键；旧预览仍可通过原 task ID 审计。

### 6.4 数据库前向迁移

对 `AudioSegment` 新增：

- `speechDurationMs Int?`：纯语音时长；旧数据为空时按 `durationMs` 读取。
- `pauseAfterMs Int @default(0)`：句后静音时长。

保留 `durationMs` 表示最终片段总时长，即语音、重点前后静音和句后静音之和。

对 `AudioTimelineRecord` 新增可空 `audioAssetId`，指向单页连续预览音频。对 `Asset` 增加命名 relation。迁移只添加可空列或带安全默认值的列，不删除、不重写历史数据。

`AudioTimelineSchema` 调整为：

- cue 不得重叠，但允许存在空隙。
- cue `endMs` 可以小于下一 cue `startMs`。
- 最后一个 cue `endMs <= totalDurationMs`。
- 新数据通过 segment 的 `speechDurationMs/pauseAfterMs/durationMs` 做更严格的累计一致性校验。

## 7. API 与后端实施

### 7.1 Revision 服务

涉及文件：

- `packages/contracts/src/lesson-plan.ts`
- `packages/contracts/src/narration-quality.ts`
- `backend/app/lesson-plan-repository.ts`
- `backend/app/server.ts`
- 对应 lesson-plan contract/unit/integration tests

实施内容：

1. 让旧 revision 在读取时安全补出 `pauseAfter: "none"`。
2. 新规划结果在 builder 中按标点和段落换行初始化逐句 narration；普通句 500 ms，段末 900 ms。
3. revise 接口接受结构化句子数组，服务端重建 ID，写入新的 pending revision。
4. 拒绝空句、重复顺序、非法重点范围和超出页面归属的内容。
5. 保存时返回 warnings，长句警告不阻止 revision 创建。

### 7.2 预览 API

新增后端路由：

- `POST /v1/revisions/:revisionId/narrations/:narrationId/audio-previews`
- `POST /v1/revisions/:revisionId/page-audio-previews`

新增前端 BFF 镜像路由：

- `frontend/src/app/api/revisions/[revisionId]/narrations/[narrationId]/audio-previews/route.ts`
- `frontend/src/app/api/revisions/[revisionId]/page-audio-previews/route.ts`

涉及后端文件：

- `backend/app/audio-repository.ts`
- `backend/app/audio-worker.ts`
- `backend/app/audio-adapter.ts`
- `backend/app/storage.ts`
- `backend/prisma/schema.prisma`
- 新增 migration 和专项测试

安全和一致性要求：

- 必须从数据库加载快照，不使用浏览器传来的朗读文本。
- pending 和 approved revision 均允许 preview；superseded revision 只允许用原 task ID 读取旧结果，不允许新建预览。
- idempotency 仍按 principal + purpose + snapshot hash 生效。
- 取消、重试、租约、缓存和 outbox 继续走现有 AUDIO 基础设施。

### 7.3 音频组合

新增一个聚焦职责的 `backend/app/audio-composer.ts`，封装现有 FFmpeg 调用；不增加依赖和 Worker。

单句处理顺序：

1. 按 emphasis 的 spoken range 拆成最多三个文本片段。
2. 非空片段调用现有 Edge TTS adapter，保持同一 voice/rate/pitch。
3. 在重点前后插入 250 ms 静音。
4. 在句尾插入 pauseAfter 对应静音。
5. 拼接为一个 MP3 片段，并用 ffprobe 获取最终真实时长。
6. 记录 `speechDurationMs`、`pauseAfterMs`、最终 `durationMs` 和组合算法版本。
7. 把各片段 word boundaries 加上累计偏移，合并回该 narration 的 timing metadata。

单页预览在全部句子完成后：

1. 按 segmentOrder 拼接已验证的句子资产。
2. 生成一个 `AUDIO_PREVIEW` 连续资产并写入 `AudioTimelineRecord.audioAssetId`。
3. cue start 使用前面所有最终片段的累计时长。
4. cue end 使用 `start + speechDurationMs + 重点内部静音`，不包含句后 pauseAfter。
5. SRT 使用 `displayText`，总时长使用全部片段最终时长。

缓存命中必须同时校验资产长度、SHA-256、timing metadata 和新时长字段；任何不一致按现有可重试错误路径失败。

## 8. 前端实施

修改前先按项目规则阅读 `node_modules/next/dist/docs/` 中关于 Route Handlers、Client Components、数据请求和缓存的相关指南。

### 8.1 结构化逐句编辑器

涉及文件：

- `frontend/src/components/workspace/slide-content-tabs.tsx`
- `frontend/src/components/workspace/formula-list.tsx`
- 新增 `frontend/src/components/workspace/narration-editor.tsx`
- 新增 `frontend/src/components/workspace/narration-row.tsx`
- `frontend/src/lib/api/slides.ts`
- `frontend/src/lib/queries/use-project-workspace.ts`

替换当前整页 textarea 保存逻辑。每个 narration row 包含：

- 序号和状态。
- 字幕文本输入框。
- 朗读文本输入框。
- 公式默认读法参考和“应用到朗读文本”动作。
- 停顿选择：无/短/常规/长。
- 重点选择与清除。
- 字符数、试听语音时长和长句警告。
- 单句试听/重新生成按钮。
- cue 起止时间或“待更新”。

保存是整页原子操作：全部行一次性创建新 pending revision。失败时保留本地编辑，不部分更新界面。

### 8.2 拆句建议

- 超过 45 字时，在行内列出安全标点候选。
- 点击候选先展示拆分预览，不立即保存。
- 用户确认后只修改本地草稿；点击保存才创建新 revision。
- 拆分后空片段、只含标点片段和超过 200 narration 的结果必须阻止。
- 忽略警告仅在当前草稿会话生效，不写全局偏好。

### 8.3 单页播放器

新增 `frontend/src/components/workspace/page-audio-review.tsx`：

- 使用后端返回的同源资产 URL，不暴露磁盘路径。
- 生成中、失败、取消、成功均有明确状态。
- 成功后展示总时长和当前播放时间。
- 点击 narration row 调用 `audio.currentTime = cue.startMs / 1000`。
- `timeupdate` 使用二分查找定位当前 cue，避免随句子数线性扫描。
- 播放结束于句后空隙时，保留上一句高亮到下一句开始，或在最终尾部清除；该行为写入组件测试。
- 草稿 dirty、revision 改变或 voice 参数改变时，旧 timeline 标记为 stale，禁用旧时间点击但允许用户显式播放旧预览作对比。

### 8.4 可访问性与错误恢复

- narration row 使用可聚焦按钮控制播放，不能只依赖鼠标点击整行。
- 当前播放句使用 `aria-current="true"` 和非颜色状态标识。
- 输入、拆分、试听、保存、批准错误各自就地显示，不用一个全局模糊错误。
- 重复点击试听按相同 idempotency key 复用任务，提交期间禁用重复动作。
- 页面切换前本地有未保存修改时给出明确确认。

## 9. 第二阶段：真实侧栏布局与安全校验

### 9.1 设计约束

- 右栏：PPT 位于左侧内容区，数字人位于右侧独立栏。
- 左栏：数字人位于左侧独立栏，PPT 位于右侧内容区。
- 隐藏：不渲染数字人；PPT 使用既定安全内容区，第一版不自动改变页面裁切规则。
- 字幕位于独立底部安全带，不盖标题、公式和图表。
- 三种布局都保持 1920×1080、25 fps 和完整 PPT 页面比例。

### 9.2 契约和渲染修改

涉及文件：

- `packages/contracts/src/render.ts`
- `backend/app/render-repository.ts`
- `backend/app/render-worker.ts`
- `backend/app/render-adapter.ts`
- `backend/app/media-adapter.ts`
- `backend/app/stage-te.integration.test.ts`
- `backend/app/stage-tf.integration.test.ts`
- `frontend/src/components/workspace/slide-preview.tsx`

把 `avatarPlacement` 扩为：

```ts
"left-panel" | "right-panel" | "hidden"
```

渲染适配器使用一份版本化布局常量，分别计算 panel rect、slide rect、subtitle safe rect 和页码区域，禁止散落 magic numbers。

### 9.3 安全校验而非伪遮挡识别

由于左右栏不覆盖 PPT，左右切换本身不是遮挡修复。第一版 validator 只做可证明的几何检查：

- panel rect、slide rect、subtitle safe rect 不相交。
- PPT 按比例完整落在 slide rect 内，不裁切。
- 已解析出的标题、公式、图表边界在缩放映射后仍位于 slide rect 内。
- 字幕不进入 PPT rect 和 panel rect。
- 数字人嘴部、头部和底部裁切满足 avatar manifest safe area。

若任何检查失败：

- 阻止正式验证通过。
- 给出 `隐藏数字人` 建议并展示具体失败区域。
- 不自动写 slide override；用户确认后创建新的设置版本并重新渲染。

左右栏默认遵循项目设置；缺少可靠结构化区域时默认右栏，不基于截图猜测。未来只有在解析器能提供可靠阅读顺序或明确侧边占用证据时，才单独评估自动换边建议。

## 10. 分阶段执行顺序与门禁

### Q0：契约与历史兼容

实施：

- 新增 narration quality 契约和纯函数。
- 扩展 narration、audio timeline、preview request 契约。
- 新增 Prisma 前向迁移。
- 更新 builder/repository 的旧数据默认值和新 ID 生成。

门禁：

- 历史 revision fixture 能被新 schema 解析，pauseAfter 为 none。
- 新 revision 的 narration ID 全由服务端生成且稳定。
- 非法重点范围、非法停顿和重叠 cue 被 schema 拒绝。

STOP：任何历史 approved revision 无法读取，或迁移要求破坏性回填。

### Q1：首个单页纵切

实施：

- 结构化两句编辑器。
- 朗读文本修正。
- 固定停顿。
- pending revision 单句预览。
- 单页连续音频、cue seek、播放高亮。
- 保存并批准新 revision。

门禁：

- 用一页包含公式、至少两句讲稿的真实课件完成全流程。
- 修改公式读法后字幕不变、音频改变。
- 500 ms/900 ms 句后停顿经 ffprobe 实测在容差内。
- 编辑后旧 cue 立即显示待更新。
- pending 可预览但正式 AUDIO 被拒；批准后正式 AUDIO 成功。

STOP：单页时间线不能由真实解码时长稳定复现，或正式 AUDIO 与预览使用不同语义。

### Q2：长句建议与重点

实施：

- 45 字和 12 秒两级警告。
- 安全标点拆分预览、接受、编辑、忽略。
- 单重点范围映射。
- 重点前后静音和 word boundary 偏移合并。

门禁：

- 无安全标点时不自动改变文本。
- 接受拆分必然创建新 revision 和新 narration ID。
- 重点不改变 spokenText 内容。
- 合成后的 timing metadata 单调、不越界，字幕文本仍来自 displayText。

STOP：重点分段导致明显断字、吞字或无法保持时间边界一致性。遇到该条件时，保留重点元数据和 UI，但正式音频暂时退化为只使用句前 250 ms 停顿，并在验收记录中标明。

### Q3：真实左栏/右栏/隐藏

实施：

- 扩展共享契约和渲染 payload。
- 实现三套几何布局。
- 扩展媒体验证和结构化失败证据。
- 在前端预览中使用同一组布局比例。

门禁：

- 三种模式都通过 1920×1080、25 fps、完整解码和音视频时长验证。
- 左右栏均不覆盖 PPT 和字幕安全区。
- hidden 不残留数字人图层。
- 校验失败必须阻止最终媒体被标记成功。

STOP：为了实现自动换边必须引入 OCR/视觉模型，或前端预览与正式渲染几何无法对齐。

### Q4：真实课件回归与人工验收包

实施：

- 选择包含普通文本、长句、公式、图表的真实页集合。
- 记录每个测试页的 revision、预览 task、正式 task、媒体 SHA 和验证报告。
- 输出人工验收清单与可直接播放的单页/最终视频。
- 更新 `docs/STATUS.md`、`docs/CURRENT_TASK.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md` 和后端 README。

门禁：

- 自动测试全绿。
- 所有真实页均可从新建项目重跑复现。
- 人工验收者能在不查看日志的情况下完成改稿、试听、定位、批准和重新生成。

## 11. 测试计划

### 11.1 契约与单元测试

- 旧 narration payload 向前兼容。
- 停顿档位到毫秒的完整映射。
- 中文等价字符统计包含中文、英文、数字、公式和标点样例。
- 拆句候选只出现在允许标点。
- emphasis 范围边界、唯一映射和非法范围。
- cue 允许 gap、拒绝 overlap、总时长约束。
- preview fingerprint 对任一冻结字段变化都改变。

### 11.2 后端集成测试

- pending revision 可创建单句和单页 preview。
- superseded revision 不能新建 preview，但旧 task 仍可读取。
- 正式 AUDIO 仍拒绝 pending revision。
- idempotent 重试不产生重复 task/step/asset。
- 缓存命中和损坏缓存失败路径。
- 取消、租约丢失、重试耗尽。
- FFmpeg 静音时长容差：目标值 ±80 ms。
- 页面连续音频时长与各片段累计误差不超过 100 ms。
- SRT 使用 displayText，TTS 输入使用 spokenText。
- left/right/hidden 的渲染与媒体安全校验。

### 11.3 前端组件测试

- 本地编辑不会直接改变已批准 revision。
- 保存失败保留草稿。
- 试听 pending revision 的状态机。
- 点击句子 seek，高亮随播放推进。
- dirty、revision 和 voice 变化使 timeline stale。
- 拆句接受/忽略和无安全标点场景。
- 键盘操作、焦点、aria-current 和错误恢复。

### 11.4 真实验收场景

最低验收集包含：

1. 一页有导数公式，修改公式中文读法。
2. 一页有超过 45 字且超过 12 秒的长句。
3. 一页存在可在逗号、分号或冒号拆分的讲稿。
4. 一页设置普通停顿、段末长停顿和重点短语。
5. 一页分别渲染左栏、右栏和隐藏。
6. 一次从 pending 预览到批准再正式成片的完整链路。

## 12. 最终串行验证命令

按项目规则串行执行，禁止并行共享 `.next`：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:contracts
npm.cmd run test:unit
npm.cmd run test:components
npm.cmd run backend:test
npm.cmd run test:stage-11d
npm.cmd run test:stage-11e
npm.cmd run test:stage-11f
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

若实施中新增 `test:teaching-quality` 聚合脚本，应在 `backend:test` 后、阶段集成测试前运行并记录结果。依赖数据库、PowerPoint COM、Edge 网络或真实媒体的测试若跳过，必须在验收报告中逐项列为未验证，不能宣称全绿。

## 13. 风险与回退

| 风险 | 预防 | 回退 |
| --- | --- | --- |
| 历史 revision 缺新字段 | schema 默认 none，新增数据显式写值 | 停止迁移，不改历史 payload |
| Edge TTS 分段出现断字 | 只在合法范围切片，真实音频专项测试 | 重点退化为句前停顿，不调音高语速 |
| FFmpeg MP3 拼接产生时长漂移 | 统一转码参数并以 ffprobe 实测 | 降为单次合成加句尾静音 |
| 预览与正式音频不一致 | 共用 AUDIO Worker、composer 和哈希算法 | 阻止批准后的正式生成，先消除分叉 |
| cue 展示过期 | dirty + revision + fingerprint 三重 stale 判断 | 禁用旧 cue 点击，只允许旧音频对比播放 |
| 左右栏验证名存实亡 | 使用明确 rect 和结构化证据 | 只保留非覆盖布局与 hidden 建议 |
| 范围膨胀 | 严守 Q0→Q4 门禁 | 推迟词典、任意 SSML、OCR 和全局时间线 |

## 14. 文档与交接要求

每完成一个阶段：

1. 更新 `docs/STATUS.md` 的真实完成度、测试结果和已知缺口。
2. 更新 `docs/CURRENT_TASK.md`，只把下一门禁设为当前任务。
3. 契约、任务 payload、数据库或数据流变化同步到 `docs/ARCHITECTURE.md`。
4. 产品取舍、默认值和回退规则同步到 `docs/DECISIONS.md`。
5. 新增命令、环境依赖或故障排查同步到 `backend/README.md`。
6. 保留当前工作区中与唇形回退相关的既有未提交修改，不批量恢复、不清理、不擅自提交。

## 15. 完成定义

只有同时满足以下条件，才可把本规划标记完成：

- 用户能在真实课件单页上逐句修正显示/朗读文本、停顿和重点。
- pending revision 能试听但不能进入正式生成。
- 单页连续音频支持句子到播放器、播放器到句子的双向定位。
- 长句建议可解释、可拒绝且从不静默改稿。
- approved revision 的正式音频与预览使用同一语义和组合实现。
- 左栏、右栏、隐藏均真实进入正式视频，不只是前端预览。
- 自动校验、真实课件回归和人工验收包均完成。
- 状态、架构、决策和续接文档全部更新。

## 16. 规划自检

| 维度 | 评分 | 自检结论 |
| --- | ---: | --- |
| 完整性 | 5/5 | 覆盖产品规则、用户流、契约、数据、API、Worker、前端、渲染、测试和交接。 |
| 可行性 | 5/5 | 复用现有 revision、AUDIO task、Worker、Edge TTS 与 FFmpeg；没有引入未验证平台。 |
| 范围控制 | 5/5 | 首个纵切限定为单页闭环，明确排除词典、OCR、全局时间线和复杂 SSML。 |
| 可测试性 | 5/5 | 每阶段都有自动门禁、STOP 条件、真实样例和可量化时长容差。 |
| 风险处理 | 5/5 | 对历史兼容、时长漂移、预览分叉、重点断字和伪遮挡判断均给出回退。 |
| 可交接性 | 5/5 | 给出具体文件、接口、数据语义、执行顺序、命令和完成定义。 |

自检结论：规划可直接从 Q0 开始实施；没有需要用户继续确认的产品决策。实施过程中若触发任一 STOP 条件，应更新状态文档并停在当前阶段，不得越过门禁宣称完成。
