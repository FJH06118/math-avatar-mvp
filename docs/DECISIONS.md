# 项目决策

> 本文记录跨会话必须保留的确定结论。详细 ADR 见
> `docs/ARCHITECTURE_DECISIONS.md`。标为“已确定”只表示方向已经确认，不代表代码已经实现。

## 已确定

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
- **影响**：阶段 T-A 已实现 Next BFF/Hono 与产品事务边界，T-B 已实现 PARSE Worker，T-C 已实现严格 PLAN/批准，T-D 已实现句级 AUDIO Worker 与真实字幕时间轴。视频、验证和下载仍未实现，不能把局部纵向链路写成完整产品闭环。

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
- **影响**：2026-08-02 的真实多连接 PostgreSQL POC 已用 `npm.cmd run t0:test` 通过事务、幂等、outbox 重放、`FOR UPDATE SKIP LOCKED` 并发领取、heartbeat、租约到期接管、取消、Worker kill、重试上限和向前迁移；T-A/T-B 已进一步实现产品数据模型、HTTP 边界和 PARSE Worker。Agent、媒体等后续 Worker 尚未实现；若后续证据失败，先更新 ADR，不静默加入第二套队列。

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

## 待确认

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
| 图片公式 OCR | 详细 PRD 有数学内容目标，但当前后端明确未实现 OCR。 | 未获产品批准前不得宣称延期已被接受。 |

### 待确认的产品决策

1. 单视频最大时长。
2. 是否允许上传自定义数字人。
3. 是否支持 9:16 和 1:1；16:9 已确认。
4. 是否需要背景音乐和品牌片头。
5. L2 数学风险是否强制人工确认；确认前不得自动进入最终生成，L3 始终人工确认。
6. 是否必须部署在中国大陆，以及相应供应商方向。
7. 项目包仅含版本化元数据，还是包含完整离线复现工程。
8. 是否需要用量计费和团队权限。
9. 是否批准把图片公式 OCR 从完整 Web MVP 延期；当前未获批准。
