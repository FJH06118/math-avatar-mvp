# 高等数学数字人授课智能体

这是“PPT 解析与讲稿审核 + 数字人讲解视频生成”的总项目仓库。仓库按前端、后端和文档分区管理：

> [!WARNING]
> **当前分支仍需人工试验测试，不是已完成线上验收的发布版本。** 自动化测试已覆盖 PowerPoint 结构校验、解析、原页视觉输入、Provider 协议和失败边界，但仍必须使用真实豆包/千问等多模态账号、多个不同来源的 `.pptx`/`.ppt`、中文文件名、公式/图表页、加密/损坏文件，以及重建后的 Windows 桌面安装包进行人工端到端验证。未完成这些验证前，不得宣称真实供应商、视觉理解准确率、100 页容量或安装版兼容性已经通过。

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

## GitHub 仓库分工

从 2026-08-15 起，项目按两个仓库协作：

- **网页与共享服务**：当前仓库 [`FJH06118/math-avatar-mvp`](https://github.com/FJH06118/math-avatar-mvp)。继续维护 Next.js 网页、Hono/Worker 后端、共享 Contract 和产品文档。
- **Windows 软件**：独立仓库 [`FJH06118/math-avatar-desktop`](https://github.com/FJH06118/math-avatar-desktop)。只放 Electron/Tauri 桌面宿主、API 设置、安全存储、运行时编排和安装包；不复制后端业务代码，通过版本化接口接入本仓库的共享服务。

桌面仓库当前是可继续开发的 P0 骨架，尚未宣称已有安装包或 Provider 原生适配。两仓库的同步边界、版本策略和后续实现顺序见 [Windows 软件封装计划](docs/planning/WINDOWS_DESKTOP_SOFTWARE_PLAN.md)。

## 当前已知限制（2026-08-23）

- **Edge TTS 当前按不可用处理**：真实 Windows 安装环境中的试听尚未通过，真实音频、完整播放与外部网络验收仍是 `EXTERNAL_VALIDATION_PENDING`。代码中的 adapter、错误分类和测试不等于真实服务已可用，也不会把失败伪装成成功。
- **PPT 文件判断仍由确定性解析器负责**：系统先校验/转换 `.pptx`、`.ppt` 并登记完整原页，再把“原页图 + 结构化文本/备注/公式候选”交给通过视觉探针的 Provider。模型不会决定真实页数、替换原页或绕过人工批准。
- **动画事实由 PowerPoint COM 读取，不由模型猜测**：Windows 上安装 Microsoft PowerPoint 时，PARSE 会在隔离子进程中以禁用宏、只读、无窗口方式读取主序列、点击对象交互序列、效果/对象/文本范围、触发器、延迟、时长、重复和页面切换，并生成 `animation-manifest-v1`。PLAN 收到完整原页、结构化内容和对应页动画清单，只能解释教学作用并建议旁白同步，不能改写 COM 顺序或计时；结果仍须人工批准。
- **动画视觉复现仍有明确边界**：当前完成的是动画元数据识别和多模态教学理解，不是完整 PowerPoint 动画重放。简单白名单只标记为可重建候选；Morph、自定义/未知效果、复杂路径、媒体与交互触发器建议保留 PowerPoint 原生播放并人工审核。当前未接入 `CreateVideo`，也不会用屏幕录制或固定等待冒充原生动画导出。
- **LibreOffice/PDF 只能静态降级**：仅有 LibreOffice 时仍能生成完整原页，但 PDF 转换不保留动画时间轴，公开解析结果会返回 `STATIC_FALLBACK` 与 `ANIMATION_METADATA_UNAVAILABLE`，不会显示“动画已识别”。旧 `.ppt` 会先尝试直接 COM 读取动画，再进入现有转换流程。
- **本地公式能力只是候选提取，不是完整公式识别**：解析器可读取部分原生 OOXML/OMML 公式中的文本节点，也会用数学符号启发式发现普通文本公式；当前不执行可靠的 OMML → LaTeX 转换，所有候选都需要人工核对。图片公式、扫描公式和嵌入对象没有 OCR，只保留原页并提示人工检查。
- **多模态链路已实现但尚未完成真实供应商人工验收**：OpenAI-compatible 图像请求覆盖 OpenAI、DeepSeek、GLM、Kimi、豆包和千问类型，Anthropic 使用 Messages 图像块；所选模型只有正确识别随机红/绿/蓝探针后才会获得 `VISION`。离线 fixture 通过不等于对应账号、模型、地域和限流已正式支持。

本轮没有引入 MATLAB。真实 WPS、复杂 Morph/路径/媒体课件、安装版 PowerPoint 生命周期、重建后的桌面安装包及各真实多模态 Provider 仍需人工端到端试验。

因此，大模型当前负责结合原页图和已提取结构规划“怎么讲”，不负责 PPTX 解包、原页渲染、结构化图片公式 OCR、Edge TTS 或视频编码。任何初始讲稿和公式读法在生成音视频前都必须由用户审核。

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

# 阶段 T-A～T-G：真实 PostgreSQL、私有 HTTP、可恢复 Worker 与受控交付
npm.cmd run test:integration
npm.cmd run start:app --workspace @ppt-digital-human/backend
npm.cmd run backend:worker

# 后端分阶段运行
npm.cmd run backend:prepare -- --input "课件.pptx" --job-dir "backend/work/job-001"
npm.cmd run backend:approve -- --job-dir "backend/work/job-001"
npm.cmd run backend:render -- --job-dir "backend/work/job-001" --tts-mode edge
```

后端安装、环境变量、审核流程、Docker 和输出文件说明见 [`backend/README.md`](backend/README.md)。

运行后端测试前，普通开发终端必须能解析 Python 3.10 或更高版本的 `python`
命令；不要将任何本机或 Codex 私有解释器绝对路径写入项目脚本。

## 当前开发状态（2026-08-23）

网页/共享服务已经具备阶段 T 的真实后端纵切，并新增了 PowerPoint 动画事实读取和多模态 PLAN 输入；当前仍是待人工试验的候选版本，不是正式发布版。

- 阶段 T 的真实链路已具备：PPTX/PPT 上传、原页解析、讲稿规划与人工批准、Edge TTS、逐页渲染、合成、媒体硬验证，以及 MP4/SRT/元数据受控下载。
- PowerPoint 安装且可用时，PARSE 会在隔离 COM 子进程读取动画清单；LibreOffice/PDF 路径只做静态降级，不伪造动画时间轴。
- PLAN 可以把登记原页图与结构化文本/备注/公式候选发送给通过视觉探针的 Provider；真实供应商账号、模型、地域、限流和教学质量仍需人工验收。
- 前端默认仍使用浏览器内存 Mock；设置 `NEXT_PUBLIC_PPT_DH_API_MODE=stage-t` 才会进入 Next BFF → Hono → PostgreSQL → Worker 的真实链路。
- 生产数字人当前固定为周老师开口/闭口两态整身图切换。五档局部嘴型 Demo 已被人工判定不自然并回退，L5 为 FAIL，L6 为 STOP。
- 当前渲染器实际支持右侧面板或隐藏；前端预览暂时可显示左侧人物，这个差异已列入后续路线图，不能把左侧预览当成最终渲染能力。
- Windows 软件仍是独立仓库和后续交付目标；安装包重建、安装覆盖/升级、普通用户电脑和签名验收仍需单独证据。

最近已知的自动化门禁曾串行通过 typecheck、lint、backend:test 和 build；本次上传前重新执行的 `npm.cmd run typecheck` 已通过。真实 Provider、真实 PowerPoint/WPS 样本、完整动画视觉复现、100 页视频容量和桌面安装版仍不得宣称已通过。

## 当前能力边界

- 前端已经覆盖上传、解析进度、三栏审核工作台、生成进度、结果页及下载控件等 MVP 交互；默认使用浏览器内存 Mock API，真实模式通过 BFF 访问受控媒体。
- 后端可以读取文本型 PPTX，提取页面结构，使用大模型或确定性回退方案规划讲稿，经人工批准后生成 Edge TTS 配音、字幕、数字人叠加视频和验收结果。
- 阶段 T 已完成。T-A～T-F 建立上传、解析、规划/批准、音频、逐页渲染、最终合成与独立媒体硬验证；T-G 加入项目范围内的 MP4/SRT/元数据全量与 Range 下载。浏览器页面默认仍使用 Mock，真实 tracer adapter 仅在显式 `NEXT_PUBLIC_PPT_DH_API_MODE=stage-t` 时启用；逐屏产品接线属于阶段 3～10。

## 文档入口

- [文档索引与归档规则](docs/README.md)
- [当前任务与续接点](docs/CURRENT_TASK.md)
- [当前项目状态](docs/STATUS.md)
- [继续开发指南](docs/CONTINUE_DEVELOPMENT.md)
- [当前成果后续能力路线图](docs/planning/CURRENT_RESULTS_CAPABILITY_ROADMAP.md)
- [产品需求摘要](docs/PRD.md)
- [当前真实架构](docs/ARCHITECTURE.md)
- [项目决策](docs/DECISIONS.md)

详细 PRD、实施计划、ADR 和历史交接由 [文档索引](docs/README.md) 统一链接。以后新增文件应遵循根目录 [`AGENTS.md`](AGENTS.md) 中的规则：前端实现放 `frontend/`，后端实现放 `backend/`，跨端资料按类型放入 `docs/`。
