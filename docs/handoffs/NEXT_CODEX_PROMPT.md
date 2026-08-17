# Codex 项目续接提示词

你正在接管项目：

`C:\path\to\math-avatar-web`

你的任务是依据项目内的持久上下文继续开发，不要根据聊天记忆猜测现状，也不要重新搭建项目。

## 开始前必须执行

1. 运行：

```powershell
git status --short --untracked-files=all
git branch -vv
git log --oneline -10
```

2. 按顺序完整阅读：

- `AGENTS.md`
- `docs/CURRENT_TASK.md`
- `docs/STATUS.md`
- `docs/planning/DEVELOPMENT_ROADMAP.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md` 中与当前阶段相关的章节
- 当前阶段涉及的前端或后端 README

3. 以代码和 Git 状态为事实来源。若文档冲突，指出冲突并更新文档，不要静默选择。

4. 在编辑前向我说明：

- 当前阶段和本轮唯一目标。
- 预计修改的文件。
- 明确不处理的范围。
- 现有工作区改动会如何保留。
- 计划运行的检查命令。

## 当前默认续接点

若 `docs/CURRENT_TASK.md` 没有更新为其他未完成任务，则从
`docs/planning/DEVELOPMENT_ROADMAP.md` 的“阶段 1A：可复现环境与测试保护”开始。

阶段 1A 只处理：

- 让普通开发终端可运行 Python 3.10+ 和 `npm.cmd run backend:test`；项目代码不得依赖 Codex bundled Python 的绝对路径。
- 依据 `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` 引入最小 Vitest + React Testing Library 测试保护。
- 为一个 API adapter、一个错误/重试组件和一个关键交互组件添加行为测试。
- 使用最小 Node 标准库脚本实现 `routes:check`，验证 6 条业务路由并回收生产服务。
- 固化根 `npm.cmd run test`，保证后端测试和前端 unit/component 测试都被执行。

阶段 1A 不处理：

- 不接真实 API、数据库、队列、对象存储、LLM 或正式 TTS。
- 不创建 `packages/contracts/`；它属于阶段 2。
- 不修改页面业务流程或大规模重做 UI。
- 不批量升级依赖，不运行 `npm audit fix --force`。
- 不进入阶段 1B 或后续阶段。

如果 Python 需要安装系统软件、需要联网安装依赖、需要 Docker，或存在会改变架构的选择，先说明原因并请求必要授权；不要用临时私有路径掩盖环境问题。

## 开发规则

- 一次只执行一个阶段或明确子阶段；阶段门禁失败立即停止。
- 保留所有既有修改，禁止 `git reset --hard`、`git clean` 或批量恢复。
- 修改前端前先读取本地 Next.js 16 对应指南。
- 跨端 Contract 只能进入 `packages/contracts/`，外部 payload 先按 `unknown` 严格验证。
- 浏览器不得直接调用 PPT、LLM、TTS、FFmpeg、磁盘或 Worker。
- 不提交构建产物、缓存、日志、密钥、真实课件或本地环境文件。
- 未经我明确要求，不执行 Git commit、push、系统软件安装或外部部署。

## 阶段完成要求

先更新 `docs/STATUS.md` 和 `docs/CURRENT_TASK.md`，再串行运行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

新增的专项测试也必须运行。缺失或失败的门禁要记录为阻塞，不能宣称已通过，也不能继续下一阶段。

最后运行：

```powershell
git status --short --untracked-files=all
```

向我汇报完成内容、测试结果、未解决问题、工作树状态和建议提交拆分，然后停止等待确认。

如果我在本提示词后追加“本轮目标：……”，以该目标为当前任务，但它仍不能绕过上述事实检查、安全规则和阶段 STOP 条件。
