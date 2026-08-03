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

当前 MVP 直接支持 `.pptx`。旧 `.ppt` 请先在 PowerPoint 中另存为
`.pptx`。第一版刻意不做图片公式 OCR：公式截图仍保留在原 PPT 画面中，
讲稿和公式读法需要在审核阶段确认。

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
