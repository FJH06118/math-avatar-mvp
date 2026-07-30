# 当前任务

> 更新于 2026-07-30。此文件是下一位 Codex 的第一续接点。
>
> 状态：已完成；上下文文档已经代码复核，并以
> `docs: establish persistent project context` 单独提交。

## 任务目标

复核跨会话上下文文档是否与当前代码一致，修正发现的差异，并创建只包含上下文文档和入口 README 的 Git commit。

## 涉及文件

- `AGENTS.md`
- `README.md`
- `docs/README.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/STATUS.md`
- `docs/CURRENT_TASK.md`

本任务不修改或提交 `frontend/`、`backend/`、依赖、目录重组或业务代码。

## 已完成步骤

- 按入口顺序重新阅读上下文、详细 PRD、Accepted ADR、实施计划和既有交接。
- 对照前端路由、Mock API、上传、结果资源、类型和 package scripts。
- 对照后端 CLI、PPTX 解析、PPT 原页渲染、LLM/规则回退、审核、TTS、视频和验证实现。
- 核对数据库、队列、对象存储、BFF、Remotion、Agents SDK 和供应商等候选技术没有被误写成现状。
- 修正 Next.js 指南路径、系统依赖、`.ppt` 转换、图片公式 OCR 和提交授权状态。
- 串行运行质量门禁，并检查 Markdown 链接、空白和 staged diff。
- 只暂存并提交上述八个文档文件，保留其他工作树内容不变。

## 剩余步骤

- 没有剩余的实现、文档或 Git 步骤。
- 在用户明确授权前，不得继续功能开发或建立目录重组基线。

## 测试结果

2026-07-30 在文档提交前串行复核：

- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run backend:test`：通过，4/4 tests。
- `npm.cmd run build`：通过；Next.js 16.2.11 成功生成 7 个列出的 App Router 路由（含 `/_not-found`）。
- Markdown 本地链接、尾随空白和 staged diff 检查：通过。

本轮没有重新运行生产服务器路由 smoke test；最近一次六个业务路由均返回 HTTP 200 的结果记录在 `docs/STATUS.md`。

## 下一位 Codex 从这里继续

1. 运行 `git status --short --untracked-files=all`；文档提交后工作树仍包含未提交的目录重组和功能代码。
2. 按 `AGENTS.md` 的顺序阅读上下文。
3. 不要把本次文档提交解释为目录重组基线授权。
4. 等待用户明确下一阶段；获授权后从 `docs/STATUS.md` 的“下一步建议”开始。
