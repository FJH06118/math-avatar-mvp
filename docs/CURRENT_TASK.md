# 当前任务

> 更新时间：2026-08-01。本文件记录本轮“按确认的提交拆分方案整理并提交工作区改动”的续接点。
> 状态：已完成，等待下一阶段授权。

## 当前任务目标

检查工作区中未提交的目录重组、依赖、前端移动和后端原型改动，排除构建产物、缓存、日志、密钥和本地环境文件，按功能边界分别提交，并让状态文档与真实代码一致。

## 涉及文件与提交分组

1. `docs: add detailed product and architecture plans`
   - `docs/product/PPT-Digital-Human-Video-PRD-v1.0.md`
   - `docs/ARCHITECTURE_DECISIONS.md`
   - `docs/IMPLEMENTATION_PLAN.md`
2. `docs: archive prototype handoffs and status`
   - `docs/HANDOFF.md`
   - `docs/handoffs/PIPELINE_HANDOFF.md`
   - `docs/status/高等数学数字人系统-阶段介绍与后续路线.md`
3. `chore: reorganize repository into workspaces`
   - 根 workspace 配置、`.gitignore`、锁文件和 `backend/package.json`
   - 根前端配置/源码/静态资源移动到 `frontend/`
   - `DEVELOPMENT_PLAN.md` 移动到 `docs/planning/FRONTEND_DEVELOPMENT_PLAN.md`
4. `feat(backend): add reviewable PPT planning prototype`
   - `backend/prepare.py`、`backend/approve.py`、`backend/contracts.py`
   - Python 依赖、环境变量模板和后端单元测试
5. `feat(backend): add local video generation prototype`
   - `backend/run.mjs`、`backend/video/*.mjs`
   - 两个头像源资源
6. `build(backend): add pipeline runtime packaging and usage docs`
   - `backend/Dockerfile`
   - `backend/README.md`
7. 本轮收尾文档提交（待本文件更新后执行）
   - `docs/STATUS.md`
   - `docs/CURRENT_TASK.md`

## 已完成步骤

- 运行 `git status --short --untracked-files=all` 并核对全部未提交路径。
- 对目录移动、依赖变化、前端、后端、配置、文档和被忽略产物完成分类；确认前端移动内容与原文件字节一致。
- 依次完成前六组独立提交，未提交 `frontend/.next/`、`frontend/out/`、`backend/work/`、缓存、日志、密钥或本地环境文件。
- 完成 workspace 依赖检查、前端 TypeScript 检查、Lint、生产构建、后端单元测试和视频脚本语法检查。
- 记录 Docker 和默认 Python 命令在当前环境不可用，不把未验证内容写成已通过。

## 剩余步骤

1. 串行复跑最终 `typecheck`、`lint`、`backend:test`（记录默认命令缺少 Python；同时复跑 bundled Python 测试）和 `build`。
2. 检查本次两个状态文档的差异，只暂存它们并创建收尾提交。
3. 运行 `git status --short --untracked-files=all`，确认工作树干净；若有内容，只保留明确被忽略或等待用户授权的项目。

本轮不继续实现共享契约、真实 API、数据库、队列、对象存储或其他新功能。

## 测试结果

- `npm.cmd ls --depth=0 --workspaces`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，0 warning。
- `npm.cmd run build`：通过，Next.js 16.2.11，7 条 App Router 路由。
- bundled Python `unittest discover -s backend/tests -v`：4/4 通过。
- `node --check backend/run.mjs` 及 `backend/video/*.mjs`：通过。
- `npm.cmd run backend:test`：当前环境缺少 `python` 命令，未能由项目脚本启动；等价测试已通过。
- `docker --version`：当前环境不可用，未执行容器构建。

## 下一位 Codex 应从哪里继续

1. 先阅读根目录 `AGENTS.md`，再按其中顺序阅读 `docs/CURRENT_TASK.md`、`docs/STATUS.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md` 和 `docs/DECISIONS.md`。
2. 运行 `git status --short --untracked-files=all` 和 `git log --oneline -8`，确认本轮提交已经存在。
3. 以 `docs/STATUS.md` 的“未完成任务”和“当前阻塞项”为事实，等待用户明确下一阶段；不要把本轮提交解释为生产系统已完成。
