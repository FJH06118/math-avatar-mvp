# 高等数学数字人授课智能体

这是“PPT 解析与讲稿审核 + 数字人讲解视频生成”的总项目仓库。仓库按前端、后端和文档分区管理：

```text
数字人前端/
├── frontend/          Next.js 前端、静态资源和 Windows 启动器
├── backend/           PPT 解析、LLM 规划、Edge TTS、视频合成与验证
├── docs/
│   ├── product/       产品需求文档和产品决策
│   ├── planning/      开发计划
│   ├── status/        阶段报告和后续路线
│   └── handoffs/      开发交接文档
├── package.json       全仓统一命令
└── README.md
```

根目录名称目前沿用原来的“数字人前端”，但它现在代表完整项目；前端和后端实现分别只放在 `frontend/` 与 `backend/`。

## 快速开始

环境要求：

- Node.js 20.9 或更高版本；
- Python 3.10 或更高版本（运行后端时需要）；
- Microsoft PowerPoint，或 LibreOffice + Poppler（用于生成原页图）；
- FFmpeg/ffprobe 默认随 Node.js 依赖提供；Docker 或自定义路径可使用系统版本；
- 可访问 Microsoft Edge TTS 的网络（使用真实配音时需要）。

安装 Node.js 依赖并启动前端：

```powershell
npm.cmd install
npm.cmd run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

Windows 也可以双击 [`frontend/打开智数讲堂.cmd`](frontend/打开智数讲堂.cmd)。启动器会在缺少生产构建时先执行构建，再启动并打开网页。

## 常用命令

```powershell
# 前端
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build

# 后端测试
npm.cmd run backend:test

# 阶段 1A 测试保护
npm.cmd run test:unit
npm.cmd run test:components
npm.cmd run test:contracts
npm.cmd run test

# 先完成生产构建，再检查 6 条业务路由并回收服务
npm.cmd run routes:check

# 后端分阶段运行
npm.cmd run backend:prepare -- --input "课件.pptx" --job-dir "backend/work/job-001"
npm.cmd run backend:approve -- --job-dir "backend/work/job-001"
npm.cmd run backend:render -- --job-dir "backend/work/job-001" --tts-mode edge
```

后端安装、环境变量、审核流程、Docker 和输出文件说明见 [`backend/README.md`](backend/README.md)。

运行后端测试前，普通开发终端必须能解析 Python 3.10 或更高版本的 `python`
命令；不要将任何本机或 Codex 私有解释器绝对路径写入项目脚本。

## 当前能力边界

- 前端已经覆盖上传、解析进度、三栏审核工作台、生成进度、结果页及下载控件等 MVP 交互；目前全部业务数据来自浏览器内存 Mock API，演示资源不可下载。
- 后端可以读取文本型 PPTX，提取页面结构，使用大模型或确定性回退方案规划讲稿，经人工批准后生成 Edge TTS 配音、字幕、数字人叠加视频和验收结果。
- 浏览器上传尚未接入后端。当前已完成测试门禁和阶段 2 最小共享 Zod Contract；阶段 T0 的 Windows 原生 PostgreSQL + Prisma + PostgreSQL lease worker 恢复语义 POC 已通过，但产品决定、模型凭据和三页 fixture 均未关闭，不能直接跳到阶段 T 或完整 Web 集成。

## 文档入口

- [文档索引与归档规则](docs/README.md)
- [当前任务与续接点](docs/CURRENT_TASK.md)
- [当前项目状态](docs/STATUS.md)
- [产品需求摘要](docs/PRD.md)
- [当前真实架构](docs/ARCHITECTURE.md)
- [项目决策](docs/DECISIONS.md)

详细 PRD、实施计划、ADR 和历史交接由 [文档索引](docs/README.md) 统一链接。以后新增文件应遵循根目录 [`AGENTS.md`](AGENTS.md) 中的规则：前端实现放 `frontend/`，后端实现放 `backend/`，跨端资料按类型放入 `docs/`。
