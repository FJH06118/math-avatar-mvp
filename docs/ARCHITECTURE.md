# 当前真实架构

> 更新于 2026-08-04。本文只描述代码中已经存在的实现；目标架构和候选技术见
> `docs/DECISIONS.md`、`docs/ARCHITECTURE_DECISIONS.md` 与
> `docs/IMPLEMENTATION_PLAN.md`。

## 总览

当前保留 Mock/CLI 两条原型链路，并新增阶段 T-A 的真实产品入口：

```text
浏览器
  └─ Next.js App Router 页面
       └─ 前端 API 模块
            └─ MockApiClient
                 └─ 浏览器内存 Map + setTimeout 模拟任务

PowerShell / 终端
  └─ backend/run.mjs
       ├─ Python prepare.py：PPTX 解析、原页图、LLM/规则规划
       ├─ Python approve.py：人工审核结果规范化与批准
       └─ Node 视频管线：Edge TTS → 字幕 → 帧 → FFmpeg → verify
            └─ 本地 job 目录中的 JSON、图片、音频、字幕和 MP4

浏览器真实 adapter（尚未设为页面默认）
  └─ Next.js /api/t Route Handlers
       └─ 固定本地 principal + 内部令牌 + 公共 Zod
            └─ Hono 私有 application service
                 ├─ PPTX MIME/大小/ZIP 结构/哈希复核
                 ├─ PLAN/AUDIO task、Revision 修订与显式批准
                 ├─ Prisma 产品事务 + outbox
                 └─ Git 忽略的本地 source asset
                      └─ PARSE dispatcher/lease Worker
                           ├─ attempt 隔离 + Python/LibreOffice
                           └─ strict deck → Slide + SLIDE_RENDER Asset
                      └─ PLAN/AUDIO/PAGE_RENDER dispatcher/lease Worker
                           ├─ strict Agent → Revision/Scene
                           └─ Edge TTS → AUDIO_SEGMENT + SubtitleCue/SRT
                           └─ Sharp/FFmpeg → PAGE_FRAME/PAGE_VIDEO + RenderedPage
```

T-A 已有真实 Route Handler、私有 HTTP 服务和产品 PostgreSQL 写入；T-B 已实现产品 PARSE dispatcher/Worker。现有页面仍默认使用 Mock，独立 Worker 进程必须启动后才会消费上传任务。

阶段 T0 的独立 POC 表继续保留。T-A 在同一可丢弃开发数据库中通过向前 migration 新增产品表；产品代码使用独立的 `PPT_DH_DATABASE_URL` 配置，不导入 T0 store。

## 前端

- 位置：`frontend/`
- 框架：Next.js 16 App Router、React 19、TypeScript。
- UI：Tailwind CSS 4、Base UI/shadcn 风格组件、Motion。
- 数据与表单：TanStack Query、React Hook Form、Zod。
- 路由：项目首页、上传、项目审核、解析进度、生成进度和结果页。
- 数据源：页面默认仍是 `frontend/src/lib/api/mock-client.ts`；`real-tracer.ts` 已提供真实上传/任务查询 adapter，留待后续 T 子阶段按 feature flag 接入页面。
- 上传：Mock 只检查扩展名和 100 MB 上限，不读取或上传文件字节。
- 任务模拟：`frontend/src/lib/api/shared.ts` 与 Mock client 使用
  `setTimeout`/当前时间推导进度；刷新后数据丢失。
- 下载：当前结果主要是演示用 `data:` 字幕资源，没有由后端交付的真实视频 URL。

`frontend/src/types/` 目前只重导出 `packages/contracts/` 的 TypeScript 类型；Mock adapter 与 T-A 真实 adapter/BFF 都在输入输出边界运行共享 Zod Schema。

## 后端

- 位置：`backend/`
- 入口：`backend/run.mjs` 提供 `prepare`、`approve`、`render` 和完整 `run` CLI；
  根 package scripts 的 `backend:prepare`/`backend:approve` 则直接调用 Python。
- Python 部分：`python-pptx` 解析 PPTX；默认使用 LibreOffice `soffice.com`
  在独立临时 profile 中生成 PDF，再由 `pypdfium2` 逐页生成原页 PNG；Windows
  PowerPoint COM 只在 LibreOffice 不可用时回退。可调用 OpenAI 兼容 Chat
  Completions 接口，也可用 `--planner rules` 强制本地规则回退。
- 审核门禁：`backend/approve.py` 把人工审核后的计划规范化为已批准输入；完整
  `backend:run` 会自动批准，只适合回归，不是人工审核闭环。
- Node.js 部分：Edge TTS 生成语音和 SRT；Sharp 生成页面框架、固定位置数字人开闭口帧；
  FFmpeg 烧录字幕并合成 H.264/AAC MP4；ffprobe/解码脚本检查结果。
- 进度：`run.mjs` 使用 `spawnSync` 串行执行，并把阶段状态写入 job 目录的
  `job-status.json`。直接运行根 `backend:prepare`/`backend:approve` 不会完整更新该状态。
- 测试：`backend/tests/` 中有 Python 契约与解析单元测试。
- 应用服务：`backend/app/` 使用 Hono，当前实现上传、任务查询/取消、规划/音频任务、修订列表、用户修订、显式批准和音频时间轴读取；HTTP 请求不运行重任务。
- PARSE/PLAN/AUDIO/PAGE_RENDER Worker：dispatcher 把 outbox 投影为稳定 step；音频按句、渲染按页恢复，只重试失败工作单元。适配器分别调用 Python prepare、受约束 Agent、可取消 Edge TTS 或 Sharp/FFmpeg。
- 音频持久化：AudioSegment 关联冻结 revision/narration 和内容寻址 Asset；真实 MP3 通过 ffprobe/FFmpeg 解码与非静音校验后，SubtitleCue 与 AudioTimelineRecord 在最终事务中落库。

Python 与 Node.js 之间通过本地 JSON 和文件路径传递数据，没有进程内共享类型或正式的跨语言 schema 包。

## 数据库、任务队列与文件存储

| 能力 | 当前实现 |
| --- | --- |
| 数据库 | T-A 已持久化最小产品 Project、Asset、Presentation、GenerationTask 和 outbox；页面默认 Mock 与 CLI job JSON 仍并存。 |
| 任务队列 | 产品 PARSE/PLAN/AUDIO/PAGE_RENDER/COMPOSITE/VALIDATE Worker 已接入，支持 heartbeat、接管、取消、句/页级重试和不可变 attempt；T-G 受控交付只读取验证终态，不新增第二套队列。 |
| 文件存储 | 本地适配器保存源 PPTX、原页 PNG、逐句 MP3、SRT、PAGE_FRAME 和 PAGE_VIDEO，数据库只保存内部 storage key。 |
| 对象存储/CDN | 没有。 |
| 公共资源授权 | T-A 上传/任务响应经过 scope 和公开投影，不含内部路径；CLI 调试 JSON 仍可能包含绝对路径。 |

PostgreSQL/Prisma 与 PARSE/PLAN/AUDIO lease Worker 已接入产品任务。对象存储和后续视频/媒体 Worker 仍未实现；Redis/BullMQ 不属于当前方案。

## 视频生成数据流

1. CLI 接收 PPTX 路径和 job 目录。
2. `prepare.py` 校验基本输入，使用 `python-pptx` 提取页面结构、文本、表格、备注和公式候选。
3. LibreOffice `soffice.com` 在任务临时 profile 中把源 PPTX 转为 PDF，`pypdfium2`
   逐页生成完整页面 PNG；仅 LibreOffice 不可用时才尝试 Windows PowerPoint COM。
4. 配置了模型凭据时调用 OpenAI 兼容接口生成结构化教学计划；否则使用确定性规则回退。
5. 系统写出草稿，等待人工修改和显式批准。
6. `approve.py` 生成审核后的计划文件。
7. `synthesize.mjs` 调用 Edge TTS，保存语音和字幕时序。
8. `render-frames.mjs` 使用 Sharp 把一个源页 `contain` 到课程画面框架。
9. `create-video.mjs` 使用 Sharp 在固定坐标叠加两张开/闭口头像，再用 FFmpeg
   烧录字幕并合成 1920×1080 H.264/AAC MP4；当前原型帧率为 12 fps。
10. `verify.mjs` 使用 ffprobe 和解码检查输出，并写出验证 JSON。

每个步骤依赖前一步在同一 job 目录产生的文件。当前没有事务、内容寻址、尝试隔离、持久 worker 或按步骤重试机制。

旧 CLI 验证器仍只有基础检查；产品 T-F 路径已新增独立 VALIDATE step，把 H.264/AAC、`yuv420p`、FPS、1080p、Fast Start、完整解码、时长、非静音、黑帧、逐页图像覆盖与安全布局作为硬门，并持久化不可变验证报告。只有 `VALIDATED` 的 MediaOutput 才能进入 T-G 交付。

T-G 的 `DeliveryRepository` 从任务、MediaOutput、ValidationRecord 与 Asset 关系重新授权。Hono 提供清单、元数据与受控二进制内容，支持 Range/ETag 并在读取时复核哈希；Next BFF 隐藏 internal token、principal、私有服务地址和 storage key。阶段 T 使用本地文件 adapter，未来对象存储实现不能改变公共 Delivery Contract。

## 模块边界

- 浏览器代码只在 `frontend/`，没有直接导入 `backend/`。
- PPT、LLM、TTS、Sharp 和 FFmpeg 仅在 `backend/` 使用。
- Python 负责 PPTX 解析、计划准备和批准；Node.js 负责 CLI 编排和音视频处理。
- `packages/contracts/` 已存在，统一 Mock、真实 adapter、BFF 和 Hono 服务的 T-A 结构；Python 内部模型和 Node CLI JSON 尚未迁移，因此跨语言边界仍可能漂移。
- 根 `package.json` 只负责编排 frontend/backend workspace 命令，不是业务实现层。

“浏览器 → 薄 BFF → 私有后端应用服务 → PARSE/PLAN Worker → Revision 修订/批准”已实现；页面仍默认 Mock，音频和媒体链路尚未实现。

## 尚未采用的候选技术

以下内容不得在新文档或代码评审中写成现状：

- 产品 audio/render/validate lease Worker；当前已有 PARSE 与单 Agent PLAN Worker。
- 完整 Next.js BFF/API；当前只有 T-A 上传与任务查询两个公开边界。
- S3/OSS 等对象存储、签名 URL 和 CDN。
- Remotion 或其他替代当前 Sharp/FFmpeg 管线的渲染框架。
- OpenAI Agents SDK、多 Agent 编排或固定生产模型。
- 阿里云或其他正式 SLA TTS、特定云部署平台。

仓库中的 `backend/Dockerfile` 只封装现有 CLI，不代表已经存在 HTTP 服务、数据库、
队列、对象存储或 `docker-compose` 运行环境。Docker Desktop 4.84.0 虽已安装，但其
WSL2 engine 在当前主机上无法创建 `docker-desktop` 发行版；用户已批准停止 Docker
修复并改走 ADR-011 的等价本地方案。

## 文档与代码冲突

| 文档中的目标或旧描述 | 代码事实 |
| --- | --- |
| 前端完成上传到生成的端到端流程 | 页面流程存在，但业务数据全部来自 Mock client；后端 CLI 未接入。 |
| 使用共享 Zod 契约和稳定 ID | `packages/contracts/` 已创建并被前端 Mock adapter 使用；Python/Node CLI 仍有独立内部模型和 JSON 形状。 |
| 真实异步任务、数据库、队列和对象存储 | 上传与 PARSE 已形成持久异步闭环；Agent/媒体、对象存储和最终交付仍缺失。 |
| 每个非跳过源页完整出现 | 多源场景的渲染路径当前取第一个 `sourceSlides`，存在漏页风险。 |
| 审核后的覆盖数据与场景一致 | `approve.py` 沿用生成时的 `sourceSlideCoverage`，人工改页后可能陈旧。 |
| 始终保留原页视觉 | 原页渲染失败时存在文本重建回退，不能保证原版式保真。 |
| 公共响应不暴露服务端路径 | 后端现有产物 JSON 可能包含绝对 `videoPath` 等本地路径。 |
| 完整生产媒体门禁 | 当前有 ffprobe/解码检查，但部分编码条件只是警告，页面覆盖、遮挡、黑帧、静音和哈希门禁不完整。 |
| 验证通过后才标记完成 | `create-video.mjs` 在 `verify.mjs` 之前把 `result.json.status` 写成 `completed`；job 状态会在验证失败时改为 failed，但产物状态可能矛盾。 |
| 生产模型由服务端配置且无代码默认值 | Python CLI 从被 Git 忽略的 `backend/.env` 或显式进程环境读取模型；配置密钥时 `LLM_MODEL` 为必填，代码不再内置生产模型名。 |
