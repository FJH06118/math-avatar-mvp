# 继续开发指南

本文是新开发者、未来的 Codex 会话和本地维护者的统一接手入口。它描述的是当前网页/共享服务仓库的真实边界，不代表 Windows 安装包已经通过验收。

## 先看什么

进入仓库后按下面顺序阅读，不要先从某个孤立的 React 组件或 Python 脚本开始改：

1. [`AGENTS.md`](../AGENTS.md)：项目规则、目录边界、测试顺序和不可跳过的门禁。
2. [`CURRENT_TASK.md`](CURRENT_TASK.md)：当前任务、已完成事项、人工测试门和最近续接点。
3. [`STATUS.md`](STATUS.md)：真实完成度、已知差异、阻塞项和当前结论。
4. [`DEVELOPMENT_ROADMAP.md`](planning/DEVELOPMENT_ROADMAP.md)：从当前阶段到后续阶段的完整顺序与 STOP 条件。
5. [`CURRENT_RESULTS_CAPABILITY_ROADMAP.md`](planning/CURRENT_RESULTS_CAPABILITY_ROADMAP.md)：结合当前成果和用户总结形成的下一阶段优先级。
6. [`PRD.md`](PRD.md)：产品范围、用户流程、验收标准和非目标。
7. [`ARCHITECTURE.md`](ARCHITECTURE.md)：代码中已经存在的架构、数据流和边界。
8. [`DECISIONS.md`](DECISIONS.md)：已经确认的技术决策、影响和待确认事项。
9. [`backend/README.md`](../backend/README.md)：后端环境、Provider、PPT 解析、动画识别和 CLI 用法。
10. 任务涉及的详细计划：教学质量、Windows 软件、唇形研究或历史交接文档。

如果文档和代码冲突，以代码为事实；同时把差异记录回 `STATUS.md` 或 `ARCHITECTURE.md`，不要静默猜测。

## 从哪里开始

当前唯一有效顺序以 [重规划后的产品闭环路线图](planning/CURRENT_RESULTS_CAPABILITY_ROADMAP.md) 为准：

1. **M0 文档真相与金样**：先修正 PRD/架构/旧路线图中的过时当前态，并固化静态、简单自动动画和不支持动画金样。不要先跑七家 Provider 的大矩阵。
2. **M1 动画处置门**：含动画页面没有匹配的显式处置时必须阻止生成；这是下一项业务代码工作，也是 Release A 的最低诚信门。
3. **M2 原生视频 POC**：用 PowerPoint `CreateVideo` 对单页、自动计时白名单做 GO/NO-GO。失败只关闭原生动画，不阻塞后续布局和内测闭环。
4. **M3 成片可用性**：实现左栏/右栏/隐藏统一布局，并让字幕按可靠的 Edge word timing 或保守 narration segment 时序生成。
5. **M4 桌面 Release A**：M1～M3 收口后只重建一个可追溯候选，验收一个真实 Provider、真实 Edge TTS、五个金样和 10 页完整生成。
6. **M5 自然语言改课**：Release A 后再做单页、文本字段限定的 proposal → diff → apply → approve → 精确重生成闭环。

人物动作和新口型不在主线。五档口型 L5 为 FAIL、L6 为 STOP；没有用户明确要求、许可素材和连续播放验收前，不要恢复或替换这条路线。

如果现在开始开发，应从 M0 开始；M0 完成后第一个代码切片是 `AnimationDispositionV1 + ANIMATION_REVIEW_REQUIRED`，不是桌面打包、手势或七供应商普查。

## 按任务查代码

| 任务 | 首要代码入口 | 先读的契约/测试 |
| --- | --- | --- |
| PPT/PPTX 解析与动画事实 | `backend/prepare.py`、`backend/parse-adapter.ts`、`backend/powerpoint_animation_runner.py`、`backend/powerpoint_animation_adapter.py` | `packages/contracts/src/parse.ts`、`packages/contracts/src/animation.ts`、`backend/tests/test_prepare_animation_integration.py` |
| 多模态 Provider 与 PLAN | `backend/app/plan-worker.ts`、`backend/app/agent-adapter.ts`、`backend/app/vision-input.ts`、`backend/app/providers/` | `packages/contracts/src/agent.ts`、`packages/contracts/src/provider.ts`、Provider/Agent 测试 |
| 讲稿审核、修订和批准 | `backend/app/lesson-plan-repository.ts`、`backend/app/lesson-plan-review.ts`、`frontend/src/app/api/t/revisions/` | `packages/contracts/src/lesson-plan.ts`、`frontend/src/lib/api/teaching-settings.ts` |
| 数字人站位和最终渲染 | `backend/app/render-adapter.ts`、`backend/app/render-repository.ts`、`backend/app/teaching-settings.ts` | `packages/contracts/src/render.ts`、`packages/contracts/src/render.test.ts`、`frontend/src/components/workspace/teaching-settings-form.tsx` |
| Provider 设置和连接测试 | `backend/app/provider-service.ts`、`backend/app/provider-connection-tester.ts`、`frontend/src/components/settings/provider-settings-panel.tsx` | `packages/contracts/src/provider.ts`、`frontend/src/lib/api/provider-client.test.ts` |
| 前端审核工作台 | `frontend/src/components/workspace/`、`frontend/src/components/generation/` | 对应 `*.test.tsx` 与 `frontend/src/lib/api/` 测试 |
| Windows 软件封装 | 独立仓库 `FJH06118/math-avatar-desktop` | 本仓库的 [`WINDOWS_DESKTOP_SOFTWARE_PLAN.md`](planning/WINDOWS_DESKTOP_SOFTWARE_PLAN.md) 及桌面仓库自己的入口文档 |

当前必须特别注意一个已知差异：前端预览可以显示左侧人物，但最终渲染器目前只真正支持右侧面板或隐藏。任何扩展站位的改动都必须同时修改共享 Contract、持久化规范化、Worker payload、渲染器和预览，不能只改 UI。

## 接手后的最小命令

在仓库根目录执行：

```powershell
git status --short --untracked-files=all
git branch --show-current
git log -5 --oneline --decorate
npm.cmd install
npm.cmd run typecheck
```

准备交付或提交前，按 `AGENTS.md` 要求串行执行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run backend:test
npm.cmd run build
```

需要 PostgreSQL、真实 Provider、PowerPoint COM 或桌面安装包的专项命令，只有在环境和授权都满足时运行；专项跳过必须记录为 skip/blocked，不能写成通过。

## 提交和回滚边界

- 不要使用 `git reset --hard`、`git clean` 或批量恢复来“整理”工作树。
- 提交前先查看 `git diff --stat`、`git diff --check` 和 `git status --short --untracked-files=all`。
- 不要提交 `.env`、API Key、密码、绝对路径、生成媒体或 `backend/work/` 内容。
- 解析失败、Provider 失败、动画降级和媒体失败都必须保留稳定错误码与可审计状态；不要用“默认成功”掩盖外部环境缺失。
- 代码、Contract、数据库 migration 和文档要作为同一变更审查；只改前端显示而不改后端冻结快照会破坏可复现性。
