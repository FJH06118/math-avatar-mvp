# 缺陷基线：动画清单存在，但成片完全没有动画

> M0 第 4 条要求的可复查证据（`docs/planning/CURRENT_RESULTS_CAPABILITY_ROADMAP.md`）。
> **这是缺陷基线，不是通过证据。**
> 复现时间：2026-10。全部数据来自本机真实管线产物，不使用任何伪造或合成动画。

## 1. 结论

对金样 `backend/tests/fixtures/golden/animated-auto-simple.pptx`（第一页含 3 个动画效果 + 自动换页 3 秒）执行完整真实管线后：

- **清单侧**：真实 PowerPoint COM 提取到 3 个效果（ENTRANCE 0.5s / EMPHASIS 1.0s / EXIT 0.75s）与 `advanceOnTime=true, advanceTime=3.0s`；
- **成片侧**：输出的 MP4 第一页**只在 2 张静态合成帧之间交替**（闭口 120ms / 开口 100ms），**没有任何动画中间态**。

即：**动画事实已提取并持久化，但最终 renderer 完全不消费它，成片仍是静态原页。**

## 2. 输入

| 项目 | 值 |
| --- | --- |
| 金样 | `backend/tests/fixtures/golden/animated-auto-simple.pptx` |
| SHA-256 | 见 `golden-samples.json` 中该条目 |
| 页数 | 2（第一页含动画，第二页零动画） |
| 生成方式 | `backend/tools/create_animation_goldens.py`（真实 PowerPoint COM） |

## 3. 复现步骤

```powershell
$m   = '<仓库根>'
$job = '<任务目录>'
$env:PATH = "$m\node_modules\@ffmpeg-installer\win32-x64;$m\node_modules\ffprobe-static\bin\win32\x64;$env:PATH"
$env:PIPELINE_FFMPEG  = "$m\node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe"
$env:PIPELINE_FFPROBE = "$m\node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe"
Set-Location $m

# 1) 解析（需要可用的 PowerPoint COM 才能得到动画事实）
python -m backend.prepare --input backend\tests\fixtures\golden\animated-auto-simple.pptx --job-dir $job
# 2) 人工审核通过
npm.cmd run backend:approve -- --job-dir $job
# 3) 当前 renderer 出片
node backend/run.mjs render --job-dir $job --tts-mode silent
```

> 用 `--tts-mode silent` 是为了聚焦**渲染路径**，排除语音侧影响；动画是否被消费与 TTS 无关。

## 4. 实测数据

### 4.1 清单侧（`parsed-deck.json` → `animationManifest`）

```text
metadataSource     = POWERPOINT_COM
第1页 effectCount  = 3   序列 = ['MAIN']
  - category=ENTRANCE  时长=0.5s
  - category=EMPHASIS  时长=1.0s
  - category=EXIT      时长=0.75s
自动换页            = True, 3.0 秒
第2页 effectCount  = 0
原页 PNG            = 2 张（1920×1080，LibreOffice 渲染）
```

### 4.2 成片侧（`video/animated-scenes.txt`，FFmpeg concat 清单）

```text
concat 条目总数     = 138
去重后的不同帧      = ['001-closed.jpg', '001-open.jpg', '002-closed.jpg', '002-open.jpg']
composited 目录内容 = 同上 4 张（无其他新文件）
第001页 使用帧      = ['001-closed.jpg', '001-open.jpg']（2 张）
第002页 使用帧      = ['002-closed.jpg', '002-open.jpg']（2 张）
总时长              = 15.085 秒
```

`animated-scenes.txt` 的实际内容是同一对帧的无限交替：

```text
file '.../001-closed.jpg'
duration 0.120000
file '.../001-open.jpg'
duration 0.100000
file '.../001-closed.jpg'
duration 0.120000
...（重复）
```

注意 `composited/` 目录里**每页恰好只有 2 张图**——只有数字人开/闭两态，**不存在**动画本应产生的中间视觉状态（标题出现、强调旋转、正文淡出）。

### 4.3 最终视频

```text
codec=h264  1920x1080  12fps  aac 48kHz 单声道
duration=15.107s  nb_frames=181
verify.mjs status = "passed"   errors=[]  warnings=[]
```

**验证脚本通过并不代表动画被渲染**：`verify.mjs` 检查的是编码/分辨率/时长/覆盖等条件，其中不包含"动画保真"这一项。这也是本基线的意义所在。

## 5. 复现脚本

本机使用过的两个一次性脚本（放在工作区工具目录，不在仓库内）：

- `04-tools/record-baseline.py` —— 解析 `animated-scenes.txt`，列出每页实际使用的去重帧集合并判定；
- `04-tools/verify-baseline.py` —— 从成片抽帧并与参照图比对（**注意**：必须与合成后的帧比较，不能与裸原页比较，否则会因数字人/边框差异而误报）。

判定核心：若每页去重后只出现 `-closed` / `-open` 两种帧，则成片不含动画。

## 6. 代码层面的对应事实

`Presentation.animationManifestJson` 的全部消费方（全仓库搜索，排除 `node_modules`/`generated`/`.next`）：

```text
backend/app/animation-manifest.ts          ← 读取并与页面关联
backend/app/parse-persister.ts             ← 落库
backend/app/parse-repository.ts            ← 读回
backend/app/plan-worker.ts                 ← 送入 PLAN（供模型解释）
backend/app/stage-tb.integration.test.ts   ← 集成测试
```

`render-adapter.ts`、`render-worker.ts`、`render-repository.ts`、`media-adapter.ts`、`media-worker.ts` **零引用**。这与路线图第 3 节"最终渲染器不消费动画清单；当前成片把所有页面作为静态 PNG"的判定完全一致。

## 7. 这条基线的用途

1. 它是 **M1**（动画处置门）的存在理由：用户必须知道"成片不会播放本页动画"，并显式接受静态；
2. 它是 **M2**（PowerPoint `CreateVideo` 原生视频 POC）的对照基线：若 M2 判定 GO，则可对比"接入原生底片后"成片是否真的出现动画变化；
3. 它是回归基准：任何声称"已支持动画"的改动，都必须让本文第 4.2 节的去重帧集合出现**新的动画中间态**，否则不成立。

## 8. 可以主张 / 不可主张

**可以主张**
- 本基线由真实管线产生，输入（含动画的金样）、中间（清单与 concat 清单）、输出（MP4）全部可复核。
- 动画事实确实被 COM 提取并持久化；成片确实完全没有动画。

**不可主张**
- ❌ 不能说"动画渲染失败"——当前**根本没有动画渲染路径**，这不是 bug 而是尚未实现的能力。
- ❌ 不能用本基线证明 M2 会成功或失败——M2 是独立的 GO/NO-GO 门。
