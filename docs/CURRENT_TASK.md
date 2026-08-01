# 当前任务

> 更新时间：2026-08-01。
> 状态：阶段 1A 与阶段 1B“直接依赖安全收口”已完成；剩余 Next 内嵌依赖 3 项 high 已由用户于 2026-08-01 明确风险接受，等待是否进入阶段 2。

## 当前任务目标

在阶段 1A 门禁基础上，使用官方 npm registry 逐项审查直接依赖安全风险；应用兼容的单依赖/锁文件修复并记录剩余风险接受。完成本阶段后停止，等待用户确认是否进入阶段 2。

## 涉及文件

- 根 `package.json`、`package-lock.json` 与 `frontend/package.json`：固化后端、unit 和 component 测试编排，以及 `routes:check` 命令。
- `frontend/vitest.config.mts`、`frontend/src/test/setup.ts`：按仓库内 Next.js 16 Vitest 指南配置 jsdom、React 与 TypeScript 路径。
- `frontend/src/lib/api/projects.test.ts`：Mock API adapter 行为测试。
- `frontend/src/components/feedback/error-state.test.tsx`：错误/重试组件测试。
- `frontend/src/components/workspace/workspace-actions.test.tsx`：保存和“生成前确认”关键交互测试。
- `scripts/routes-check.mjs`：只使用 Node 标准库启动生产服务、探测 6 条路由并回收服务。
- `.gitignore`、`README.md`、`docs/STATUS.md`、`docs/CURRENT_TASK.md`：记录 workspace 依赖忽略、运行方法和阶段状态。
- `frontend/package.json`、`package-lock.json`：阶段 1B 的直接依赖与锁文件安全收口。

## 已完成步骤

- 复核工作树干净，确认文档基线提交 `546c6bb` 已存在。
- 阅读仓库内 Next.js 16 Vitest 指南；使用 Vitest、React Testing Library、jsdom、React 插件和 TypeScript 路径插件建立最小测试配置。
- 确认 `D:\Python310\python.exe` 为 Python 3.10.11，且已安装后端测试依赖；将它加入实际 Windows 用户 PATH，不在项目代码中写入该绝对路径。
- 在刷新后的实际用户 PATH 终端中运行 `npm.cmd run backend:test`，4/4 通过。
- 新增 API adapter、错误重试组件和关键生成确认交互测试；Vitest 全量直接运行时 3 个测试文件、4 个断言通过。
- 新增根 `test` 与 `routes:check` 命令；`routes:check` 在 `finally` 中回收直接启动的 Next 生产服务。
- 在刷新后的实际用户 PATH 终端中，`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run test`、`npm.cmd run build` 和 `npm.cmd run routes:check` 均已串行通过；根 `test` 覆盖后端 4/4、unit 1/1 与 component 3/3，路由检查验证 6 条业务路由均返回 HTTP 200。
- 阶段 1B 官方 audit 初始为 6 项（2 moderate、4 high）；锁定 `brace-expansion@1.1.18`、`postcss@8.5.23`，并将稳定 `shadcn` 升至 `4.16.1`，MCP SDK/Hono 锁到 `1.30.0/2.0.12`，现剩 3 项 Next 内嵌依赖 high。
- 核对确认稳定 `next@16.2.12` 仍使用 `postcss@8.4.31` 并允许 `sharp@0.34.5`；仅 canary 使用较新依赖，未安装预览版本。
- 依赖变更后在新 PowerShell 进程中串行复跑 `npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd run test`、`npm.cmd run build` 和 `npm.cmd run routes:check`，全部通过。

## 剩余步骤

1. 在依赖更新后串行完成阶段 1A 全部门禁并记录 audit 结果。
2. Next 剩余 high 已由用户明确风险接受，阶段 1B 关闭；停止并等待用户确认是否进入阶段 2。

## 阶段门禁

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

新增专项测试也必须通过；本次已在新 PowerShell 进程中用标准 `python` 串行复跑全部门禁并通过。项目命令本身只调用标准 `python`。

## 明确不处理

- 不接真实 API、数据库、队列、对象存储、LLM 或正式 TTS。
- 不创建 `packages/contracts/`，不进入阶段 2。
- 不修改页面业务流程或大规模重做 UI。
- 不运行 `npm audit fix --force`，不安装 Next canary，不创建 `packages/contracts/`，不进入真实 API 或阶段 2。
- 不提交构建产物、缓存、日志、密钥、真实课件或本地环境文件。
