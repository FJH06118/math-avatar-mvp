# 高等数学数字人流水线交接

更新时间：2026-07-29

## 已完成

- `backend/prepare.py`
  - 真实解析 `.pptx` 页数、标题、正文、备注、页面位置；
  - 提取 PowerPoint 原生 OMML 和文本公式候选；
  - Windows 使用 PowerPoint COM 导出 1920×1080 页面；
  - Linux/Docker 使用 LibreOffice + Poppler；
  - 有 `DEEPSEEK_API_KEY` 时进行整套课件的全局场景规划；
  - 无密钥时生成保守的一页一场景计划；
  - 生成 `parsed-deck.json` 与 `scenes.generated.json`。
- `backend/approve.py`
  - 将人工修改后的场景再次校验；
  - 只有生成 `scenes.reviewed.json` 后，渲染器才继续。
- `backend/video`
  - Edge TTS 普通话逐句配音；
  - 已完成句子按文本、音色、语速、音高缓存；
  - 真实音频时长驱动场景时间轴和全局 SRT；
  - 原 PPT 页面、两帧数字人和硬字幕合成；
  - 输出 1080P H.264/AAC MP4；
  - 自动验证页码、字幕重叠、音视频流、时长和完整解码。
- 任务状态
  - `job-status.json` 记录当前阶段、进度、失败原因和完成时间；
  - Edge TTS 中途失败后重跑会复用已成功缓存。
- 安全
  - 没有把 API Key 写入代码或文档；
  - 旧粗糙项目中的硬编码密钥不能继续使用，必须在供应商控制台撤销；
  - 本地产物与任务缓存已经加入 `.gitignore`。

## 已验证

### 两页真实 Edge TTS 验收

- 11 句普通话；
- 53.36 秒；
- 1920×1080；
- H.264 + AAC；
- 12 fps；
- 字幕无重叠；
- 完整解码通过；
- 一次异常句是仅包含标点“。”，现已在契约层过滤；
- 失败前成功的语音缓存已在重跑时复用。

### 14 页真实高数 PPT Edge TTS 验收

- 原 PPT 共 14 页，PowerPoint 原样导出成功；
- 生成 14 个场景、65 条字幕；
- 页码 1 至 14 全部覆盖；
- Edge TTS `zh-CN-YunxiNeural`，语速 `-8%`、音高 `-2Hz`；
- 216.76 秒，约 3 分 37 秒；
- 1920×1080、H.264、AAC、12 fps；
- 字幕时间轴无重叠；
- 完整视频解码通过。
- 66 句初次配音全部成功；移除 PowerPoint 页码占位符后，修正版复用了
  其余 65 句缓存。

## 当前明确限制

1. 现有 Next.js 前端仍使用 Mock API，尚未接入本地任务目录；
2. 当前环境没有提供新的大模型 API Key，因此 LLM 全局规划代码已实现，
   但未进行真实供应商调用验收；
3. 无大模型时的一页一场景讲稿是保守兜底，数学解释质量不能直接交付；
4. 图片公式 OCR、动画顺序、精确音素级口型仍未实现；
5. Windows 本机备用 FFmpeg 包版本较旧；Docker/生产环境应优先使用
   操作系统维护的 FFmpeg。

## 下一步优先级

1. 接入新的大模型 API Key，使用至少两份 10 页以上课件测试：
   - 拆页/合页；
   - 证明与例题步骤；
   - 公式中文读法；
   - 模型 JSON 异常后的回退。
2. 把 `job-status.json`、`parsed-deck.json`、`scenes.generated.json` 和
   `result.json` 接到 Next.js Route Handlers。
3. 前端上传真实文件，并在工作台编辑 `narration.displayText` 与
   `narration.spokenText`；点击生成前调用 `approve`。
4. 把生成任务放入独立 Worker/队列，Next.js 仅负责上传、状态和下载。
5. 再做图片公式 OCR、动画顺序与精确唇形。

## 恢复工作命令

```powershell
Set-Location "D:\Workspace\projects\web\数字人前端"
npm.cmd run backend:test
npm.cmd run typecheck
npm.cmd run lint -- --max-warnings=0
```

完整使用方式见 `backend/README.md`。验证产物位于被 Git 忽略的：

```text
backend/work/sample
backend/work/derivative
```
