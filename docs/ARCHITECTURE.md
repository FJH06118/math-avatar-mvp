# 当前真实架构

> 更新于 2026-08-02。本文只描述代码中已经存在的实现；目标架构和候选技术见
> `docs/DECISIONS.md`、`docs/ARCHITECTURE_DECISIONS.md` 与
> `docs/IMPLEMENTATION_PLAN.md`。

## 总览

当前存在两条相互独立的链路：

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
```

前端没有 Route Handler 或真实网络 API，后端没有 HTTP 应用服务。浏览器上传不会触发后端 CLI。

## 前端

- 位置：`frontend/`
- 框架：Next.js 16 App Router、React 19、TypeScript。
- UI：Tailwind CSS 4、Base UI/shadcn 风格组件、Motion。
- 数据与表单：TanStack Query、React Hook Form、Zod。
- 路由：项目首页、上传、项目审核、解析进度、生成进度和结果页。
- 数据源：`frontend/src/lib/api/mock-client.ts` 中的浏览器内存 Map。
- 上传：Mock 只检查扩展名和 100 MB 上限，不读取或上传文件字节。
- 任务模拟：`frontend/src/lib/api/shared.ts` 与 Mock client 使用
  `setTimeout`/当前时间推导进度；刷新后数据丢失。
- 下载：当前结果主要是演示用 `data:` 字幕资源，没有由后端交付的真实视频 URL。

`frontend/src/types/` 目前只重导出 `packages/contracts/` 的 TypeScript 类型；Mock adapter 在返回和主要输入边界运行时调用共享 Zod Schema。真实网络边界尚未接入。

## 后端

- 位置：`backend/`
- 入口：`backend/run.mjs` 提供 `prepare`、`approve`、`render` 和完整 `run` CLI；
  根 package scripts 的 `backend:prepare`/`backend:approve` 则直接调用 Python。
- Python 部分：`python-pptx` 解析 PPTX；Windows PowerPoint COM 或 LibreOffice
  生成原页图片；可调用 OpenAI 兼容 Chat Completions 接口，也可走本地规则回退。
- 审核门禁：`backend/approve.py` 把人工审核后的计划规范化为已批准输入；完整
  `backend:run` 会自动批准，只适合回归，不是人工审核闭环。
- Node.js 部分：Edge TTS 生成语音和 SRT；Sharp 生成页面框架、固定位置数字人开闭口帧；
  FFmpeg 烧录字幕并合成 H.264/AAC MP4；ffprobe/解码脚本检查结果。
- 进度：`run.mjs` 使用 `spawnSync` 串行执行，并把阶段状态写入 job 目录的
  `job-status.json`。直接运行根 `backend:prepare`/`backend:approve` 不会完整更新该状态。
- 测试：`backend/tests/` 中有 Python 契约与解析单元测试。

Python 与 Node.js 之间通过本地 JSON 和文件路径传递数据，没有进程内共享类型或正式的跨语言 schema 包。

## 数据库、任务队列与文件存储

| 能力 | 当前实现 |
| --- | --- |
| 数据库 | 没有。前端项目保存在浏览器内存；后端元数据保存在 job 目录 JSON。 |
| 任务队列 | 没有。CLI 以同步子进程串行运行，不能提供持久排队、租约、心跳、取消或分布式重试。 |
| 文件存储 | 本地文件系统。输入、临时文件、原页图、音频、帧、字幕、视频和验证结果都在 job 目录。 |
| 对象存储/CDN | 没有。 |
| 公共资源授权 | 没有。后端 JSON 仍可能包含绝对路径。 |

PostgreSQL/Prisma、PostgreSQL lease worker 和对象存储尚未实现。用户已批准前两者作为 T0 的无 Docker 目标方向，但 PostgreSQL 尚未安装、POC 尚未运行，因此当前事实仍是“没有数据库和任务队列”。Redis/BullMQ 已从 T0 方案移除。

## 视频生成数据流

1. CLI 接收 PPTX 路径和 job 目录。
2. `prepare.py` 校验基本输入，使用 `python-pptx` 提取页面结构、文本、表格、备注和公式候选。
3. PowerPoint COM 或 LibreOffice 尝试把源 PPTX 渲染成完整页面图片。
4. 配置了模型凭据时调用 OpenAI 兼容接口生成结构化教学计划；否则使用确定性规则回退。
5. 系统写出草稿，等待人工修改和显式批准。
6. `approve.py` 生成审核后的计划文件。
7. `synthesize.mjs` 调用 Edge TTS，保存语音和字幕时序。
8. `render-frames.mjs` 使用 Sharp 把一个源页 `contain` 到课程画面框架。
9. `create-video.mjs` 使用 Sharp 在固定坐标叠加两张开/闭口头像，再用 FFmpeg
   烧录字幕并合成 1920×1080 H.264/AAC MP4；当前原型帧率为 12 fps。
10. `verify.mjs` 使用 ffprobe 和解码检查输出，并写出验证 JSON。

每个步骤依赖前一步在同一 job 目录产生的文件。当前没有事务、内容寻址、尝试隔离、持久 worker 或按步骤重试机制。

当前验证会检查音视频流、1080p、场景数、来源页码合法性、字幕数量/重叠、音视频时长差和完整解码；它不会证明所有源页完整覆盖，也没有遮挡、黑帧、静音/响度、哈希或 Fast Start 硬门禁。H.264/AAC 不符目前只产生警告。

## 模块边界

- 浏览器代码只在 `frontend/`，没有直接导入 `backend/`。
- PPT、LLM、TTS、Sharp 和 FFmpeg 仅在 `backend/` 使用。
- Python 负责 PPTX 解析、计划准备和批准；Node.js 负责 CLI 编排和音视频处理。
- `packages/contracts/` 已存在，统一当前浏览器/BFF/TypeScript worker 计划消费的业务结构；Python 内部模型和 Node CLI JSON 尚未迁移，因此跨语言边界仍可能漂移。
- 根 `package.json` 只负责编排 frontend/backend workspace 命令，不是业务实现层。

已确定的未来边界是“浏览器 → 薄 BFF → 私有后端应用服务 → 持久 worker”，但这属于目标架构，不是当前实现。

## 尚未采用的候选技术

以下内容不得在新文档或代码评审中写成现状：

- PostgreSQL、Prisma 或 PostgreSQL lease worker；它们只是已批准但尚未通过 POC 的 T0 目标。Redis/BullMQ 不属于当前 T0 方案。
- Next.js Route Handler BFF、私有后端 HTTP 服务、outbox 和 worker 集群。
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
| 真实异步任务、数据库、队列和对象存储 | 当前只有浏览器内存、单进程 CLI 和本地 job 文件。 |
| 每个非跳过源页完整出现 | 多源场景的渲染路径当前取第一个 `sourceSlides`，存在漏页风险。 |
| 审核后的覆盖数据与场景一致 | `approve.py` 沿用生成时的 `sourceSlideCoverage`，人工改页后可能陈旧。 |
| 始终保留原页视觉 | 原页渲染失败时存在文本重建回退，不能保证原版式保真。 |
| 公共响应不暴露服务端路径 | 后端现有产物 JSON 可能包含绝对 `videoPath` 等本地路径。 |
| 完整生产媒体门禁 | 当前有 ffprobe/解码检查，但部分编码条件只是警告，页面覆盖、遮挡、黑帧、静音和哈希门禁不完整。 |
| 验证通过后才标记完成 | `create-video.mjs` 在 `verify.mjs` 之前把 `result.json.status` 写成 `completed`；job 状态会在验证失败时改为 failed，但产物状态可能矛盾。 |
| 生产模型由服务端配置且无代码默认值 | 现有原型仍带有 `deepseek-chat` 默认值；该默认值不是已确认的生产决策。 |
