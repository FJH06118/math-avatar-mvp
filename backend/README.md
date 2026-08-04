# 高等数学 PPT 数字人视频流水线

这一目录已经实现第一版可运行闭环：

```text
PPTX
→ 解析文字、备注、页码和公式候选
→ 全局 LLM 场景规划（无 API Key 时使用本地规则）
→ 人工审核 JSON
→ Edge TTS 逐句配音和真实时长
→ 全局 SRT 字幕
→ 原 PPT 页面、卡通数字人和字幕合成
→ 1080P H.264/AAC MP4
→ 页码、字幕、音视频流和完整解码验收
```

当前 MVP 直接支持 `.pptx`；旧 `.ppt` 在持久 PARSE Worker 的独立 attempt 中使用
LibreOffice 转换为 `source.pptx`，随后进入完全相同的 PPTX 解析与原页门禁。HTTP 上传
请求本身不运行 LibreOffice。图片公式 OCR 已获准延期：公式截图仍完整保留在原 PPT
画面中，包含图片的页面会提示人工核对，讲稿和公式读法必须在审核阶段确认。

## 1. 环境

- Windows 10/11
- Node.js 20 或更高版本
- Python 3.10 或更高版本
- Microsoft PowerPoint（Windows 本机导出原页面）或 LibreOffice（无头自动导出回退）
- 能访问 Edge TTS 的网络

安装依赖：

```powershell
npm.cmd install --registry=https://registry.npmjs.org
python -m pip install -r backend\requirements.txt
```

如果 PowerPoint COM 不可用于当前终端，请安装 LibreOffice。后端会使用
`soffice.com` 生成本地 PDF，并用随 Python 依赖安装的 `pypdfium2` 渲染每页
PNG；不依赖 Codex 私有运行时或桌面 Office 会话。

## 2. 推荐流程：先审核，再生成

生成任务目录、解析 PPT 并规划场景：

```powershell
npm.cmd run backend:prepare -- `
  --input "D:\课件\新的高等数学课件.pptx" `
  --job-dir "D:\jobs\calculus-001" `
  --audience "大学一年级" `
  --style "概念清楚、公式逐步推导"
```

程序会生成：

```text
D:\jobs\calculus-001
├── source.pptx
├── parsed-deck.json
├── scenes.generated.json
└── slides
    ├── slide-001.png
    └── ...
```

人工打开 `scenes.generated.json`，重点检查：

1. `sourceSlides` 是否对应正确页码；
2. `narration[].displayText` 是否适合字幕；
3. `narration[].spokenText` 是否已经把公式展开成正常中文读法；
4. 证明条件、例题计算和结论是否正确；
5. 是否需要把一页拆成多个场景或合并相邻页面。

审核完成后：

```powershell
npm.cmd run backend:approve -- --job-dir "D:\jobs\calculus-001"
```

这会生成只读渲染入口 `scenes.reviewed.json`。渲染器默认拒绝未经批准的
场景，避免错误讲稿直接进入视频。

使用 Edge TTS 生成最终视频：

```powershell
npm.cmd run backend:render -- `
  --job-dir "D:\jobs\calculus-001" `
  --tts-mode edge
```

最终文件位于：

```text
D:\jobs\calculus-001\output
├── 课程名-数字人讲解.mp4
├── 课程名-字幕.srt
├── 课程名-讲解稿.txt
├── result.json
└── verification.json
```

`verification.json` 的 `status` 必须为 `passed`。

## 2.1 阶段 T-A 私有应用服务

阶段 T-A 在保留上述 CLI 的同时新增了独立 Hono 应用服务。它只同步处理上传边界：
PPTX 大小、MIME、ZIP 结构、加密标志和哈希校验，以及 Project、Asset、
Presentation、GenerationTask 和 transactional outbox 持久化。它不会在 HTTP
请求中运行 LibreOffice、Provider、TTS 或 FFmpeg。

先在被 Git 忽略的 `backend/.env` 配置 `PPT_DH_DATABASE_URL`、
`PPT_DH_INTERNAL_TOKEN` 和可选的 `PPT_DH_ASSET_ROOT`，应用 migration 后启动：

```powershell
npm.cmd run t0:generate
npm.cmd run t0:migrate
npm.cmd run start:app --workspace @ppt-digital-human/backend
```

Next BFF 使用 `frontend/.env.local` 中的 `PPT_DH_APP_BASE_URL`、同一内部令牌和
仅限本机/测试的固定 `PPT_DH_INTERNAL_PRINCIPAL`。令牌没有 `NEXT_PUBLIC_` 前缀，
不会进入浏览器 bundle。T-A 的专项验证命令为：

```powershell
npm.cmd run test:integration
```

产品数据库代码使用 `PPT_DH_DATABASE_URL`；`PPT_DH_T0_DATABASE_URL` 只保留给
POC/migration 开发环境。公共响应只包含稳定 ID，不返回资产根目录或 `storageKey`。

阶段 T-B 在同一产品数据库上增加 PARSE dispatcher/lease Worker。Worker 从
transactional outbox 创建稳定步骤，使用 `FOR UPDATE SKIP LOCKED`、heartbeat、
租约过期接管和不可变 attempt 调用现有 Python/LibreOffice 适配器：

阶段 T-C 在相同 dispatcher/lease 语义上增加 PLAN Worker。它从已持久化 Slide 构造
最小不可信输入，调用服务端 OpenAI-compatible Provider，把响应先按 `unknown` 通过
`stage-tc-agent-v1` strict Contract，再在单一事务内写入 LessonPlanRevision、
PlannedScene 和任务终态。用户编辑创建新 revision，显式批准只作用于 current revision；
Provider、Prompt、模型、Schema 与哈希均保留审计。Worker 从 `backend/.env` 或显式进程
环境读取 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`，公共响应不返回凭据或课件正文。

阶段 T-D 增加 AUDIO Worker。创建任务时必须让每页 current LessonPlanRevision 均已显式
批准；服务把 revision、narration、`spokenText`、voice/rate/pitch 和输入哈希冻结进 outbox。
dispatcher 为每句创建稳定 step，Worker 只重试失败句。Edge TTS 在独立子进程运行，取消或
失租会终止进程树；MP3 通过 ffprobe 解码/时长与 FFmpeg 非静音检查后才登记为
`AUDIO_SEGMENT`。最后一句成功时按实际时长生成 SubtitleCue、SRT 和 AudioTimelineRecord。
当前 HTTP/BFF 端点为 `POST /v1/projects/:projectId/audio`、`GET /v1/tasks/:taskId/audio`
及对应 `/api/t/...` 路由；公共响应只暴露稳定 asset ID，不返回 storage key。
试听任务固定朗读“生活就像海洋，只有意志坚强的人才能到达彼岸。”，并冻结用户当前选择的 voice、rate 与 pitch；默认 Mock 页面使用同文案的三份版本化真实 MP3，不以蜂鸣音冒充音色。

阶段 T-E 增加 GENERATE/PAGE_RENDER Worker。任务冻结成功 AUDIO task、current approved
revision、原页/音频哈希、Overlay、时长、25/30 FPS 和渲染器版本；dispatcher 为每页创建
稳定 step。Sharp 将原页完整 contain 到 1500×844 区域，数字人使用独立右侧面板，避免与
原页和字幕安全区相交；阶段 T 只接受 highlightBox/arrow。FFmpeg 生成 1920×1080、
H.264/AAC、`yuv420p` 分页 MP4，并登记 PAGE_FRAME/PAGE_VIDEO 与 RenderedPage。

```powershell
npm.cmd run backend:worker
```

Worker attempt 默认隔离在 `backend/work/t-attempts`，源资产和登记后的原页位于
`backend/work/t-assets`。两者均被 Git 忽略。`parsed-deck.json`、页数和每张
1920×1080 PNG 必须全部通过严格 Contract 后才登记 Slide/Asset；渲染错误、漏页或
非 PNG 不会回退为重排文本页。`POST /api/t/tasks/:taskId/cancel` 可请求取消，运行中
适配器会在 heartbeat 边界终止进程树。

## 3. 大模型场景规划

`backend/.env.example` 是变量模板。Python CLI 会读取被 Git 忽略的
`backend/.env`，但同名的终端环境变量优先。密钥不要写入源码、README 或提交到 Git：

```powershell
$env:LLM_API_KEY = "你新创建的密钥"
$env:LLM_BASE_URL = "https://api.deepseek.com"
$env:LLM_MODEL = "deepseek-v4-flash"
```

可在不发送课件内容的前提下执行 Provider 预检：

```powershell
npm.cmd run backend:provider:preflight
```

该命令验证密钥、模型、JSON 结构化输出、超时/限流/服务端错误的重试分类；它不会输出密钥。

存在密钥时，解析器会把整套课件的结构化文本一次性提交给模型，让模型从
全局规划场景，并允许拆页或合并相邻页。模型返回内容仍会经过页码、场景、
讲稿非空和 ID 唯一性校验。

没有密钥时流水线仍然可运行，但采用“一页一个场景”的保守规则，适合离线
回归测试，不应直接作为最终数学讲稿。

## 4. 离线回归模式

下列命令自动批准规则讲稿，并用静音代替在线 TTS。它用于测试原页面、
数字人、字幕、时序和 MP4 编码，不代表最终成片：

```powershell
npm.cmd run backend:run -- `
  --input "D:\课件\新的高等数学课件.pptx" `
  --job-dir "D:\jobs\calculus-smoke-test" `
  --tts-mode silent
```

## 5. Edge TTS 参数

```powershell
$env:EDGE_TTS_VOICE = "zh-CN-YunxiNeural"
$env:EDGE_TTS_RATE = "-8%"
$env:EDGE_TTS_PITCH = "-2Hz"
$env:EDGE_TTS_CONCURRENCY = "3"
```

如果网络超时，把并发降为 `2`。如果需要代理：

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:HTTP_PROXY = "http://127.0.0.1:7890"
```

配音按“文本、音色、语速、音高”缓存。任务中途失败后，重新执行
`backend:render` 会复用已经成功的句子。

## 6. Docker

构建：

```powershell
docker build -f backend\Dockerfile -t math-avatar-pipeline .
```

运行时把课件目录和任务目录挂载到容器：

```powershell
docker run --rm `
  -e DEEPSEEK_API_KEY=$env:DEEPSEEK_API_KEY `
  -v "D:\课件:/inputs:ro" `
  -v "D:\jobs:/jobs" `
  math-avatar-pipeline run `
  --input "/inputs/高等数学课件.pptx" `
  --job-dir "/jobs/calculus-001" `
  --tts-mode edge
```

Docker 使用 LibreOffice 渲染 PPT 页面，并使用系统 FFmpeg 和 Noto CJK
字体。正式制作仍建议走“prepare → 人工审核 → approve → render”，不要
跳过数学内容审核。

阶段 T-F 增加 COMPOSITE/VALIDATE Worker。COMPOSITE 将已验证的分页视频与全局 SRT 合成为
H.264/AAC、`yuv420p`、Fast Start MP4，但任务仍保持非终态；VALIDATE 完成完整解码、编码、
时长、非静音、平均响度（-35～-8 dB）、峰值（< -0.05 dB）、黑帧、逐页图像覆盖与安全布局硬门后，才登记可交付的 `VALIDATED`
MediaOutput。失败候选会被拒绝且不能通过媒体读取端点取得。
VALIDATE 调用分析器前还会重新读取候选 MP4 和逐页基准帧，复核登记大小与 SHA-256；缺失或篡改统一以 `MEDIA_ASSET_INTEGRITY_FAILED` 拒绝，不使用数据库中的旧哈希代替落盘验证。

阶段 T-G 增加 DeliveryRepository 与受控 HTTP 内容端点。只有验证成功且生命周期可用的最终
MP4/SRT 才能读取；每次请求重新检查 principal、项目范围、大小和 SHA-256，并支持 Range、
ETag/304。项目元数据由验证终态确定性生成。公开清单只返回同源 BFF URL，不返回后端地址、
storage key 或磁盘路径。
