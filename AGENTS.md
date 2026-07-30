# 项目入口

本项目把课程 PPT 转换为可审核、可复现的中文数字人讲解视频。当前仓库包含一个使用 Mock 数据的 Next.js 前端，以及一条独立运行的本地后端 CLI 视频管线；两者尚未接通。

## 开始任务前

按顺序阅读：

1. `docs/CURRENT_TASK.md`：当前任务、测试和续接点。
2. `docs/STATUS.md`：真实完成度、问题和阻塞项。
3. `docs/PRD.md`：产品范围与验收标准。
4. `docs/ARCHITECTURE.md`：当前实际架构和数据流。
5. `docs/DECISIONS.md`：已确定决策与待确认项。
6. 与任务相关的 `README.md`、详细计划或历史文档。

开始编辑前必须运行 `git status --short --untracked-files=all`。修改前端代码时，还必须先阅读 `node_modules/next/dist/docs/` 中与改动相关的 Next.js 指南。

## 目录

- `frontend/`：Next.js 应用和所有浏览器代码。
- `backend/`：PPT 解析、讲稿规划、TTS、渲染、验证和后端测试。
- `packages/contracts/`：未来共享 Zod 契约的唯一位置；当前尚未创建。
- `docs/`：跨前后端的产品、架构、状态、计划与交接资料。

## 当前技术栈

- 前端：Next.js 16、React 19、TypeScript、Tailwind CSS 4、TanStack Query、Zod。
- 后端：Python 3、Node.js ESM、python-pptx、PowerPoint COM/LibreOffice、OpenAI 兼容接口、Edge TTS、Sharp、FFmpeg/ffprobe。
- 当前持久化：浏览器内存和本地 JSON/媒体文件；没有数据库、持久任务队列或对象存储。

## 安装与运行

```powershell
npm.cmd install
python -m pip install -r backend/requirements.txt

npm.cmd run dev
npm.cmd run build
npm.cmd run start

npm.cmd run backend:prepare -- --input "课件.pptx" --job-dir "backend/work/job-001"
npm.cmd run backend:approve -- --job-dir "backend/work/job-001"
npm.cmd run backend:render -- --job-dir "backend/work/job-001" --tts-mode edge
```

后端系统依赖、环境变量和完整 CLI 参数见 `backend/README.md`。

## 开发规则

- 代码是当前实现的事实来源；文档冲突必须指出并更新，不得静默猜测。
- 一次只处理 `docs/CURRENT_TASK.md` 指定的阶段；不得越过失败门禁或未解决的 STOP 条件。
- 保留所有既有修改。禁止 `git reset --hard`、`git clean` 或批量恢复；未经明确要求不得提交。
- 浏览器只通过 API 适配器访问业务能力，不得直接调用 PPT、LLM、TTS、FFmpeg、存储或 worker。
- 前后端共享业务契约只能进入 `packages/contracts/`，以严格 Zod schema 为源生成类型；外部 payload 一律先按 `unknown` 验证。
- 使用稳定业务 ID 和版本/修订号。浏览器响应不得暴露磁盘路径、存储键、密钥或堆栈。
- 重任务必须可持久化、幂等、可取消、可重试；在最终验证通过前不得标记完成。
- 默认完整保留原 PPT 页面；数字人和叠加内容不得遮挡标题、公式、图表、关键文本或字幕安全区。
- 不新增当前阶段未使用的目录、依赖或通用抽象；架构变化同步记录到 `docs/DECISIONS.md` 和相关详细文档。

## 完成任务后

先更新 `docs/STATUS.md` 与 `docs/CURRENT_TASK.md`，再按顺序运行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:test
npm.cmd run build
```

这些命令必须串行执行，避免共享 `frontend/.next` 造成竞态。新增的专项测试也必须运行；缺失的计划命令应记录为阻塞，不能宣称已通过。
