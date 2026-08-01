# 项目文档索引

`docs/` 保存跨前端、后端的产品、架构、状态和交接资料。实现代码不放在这里。

## 跨会话上下文

新任务按以下顺序阅读：

1. [当前任务](CURRENT_TASK.md)：当前目标、改动范围、测试和准确续接点。
2. [项目状态](STATUS.md)：真实完成度、问题、阻塞与下一步。
3. [产品需求摘要](PRD.md)：产品目标、流程、MVP、非目标与验收。
4. [当前真实架构](ARCHITECTURE.md)：代码中已经存在的架构、边界和数据流。
5. [项目决策](DECISIONS.md)：已确定方向、影响和待确认技术。
6. [开发执行路线图](planning/DEVELOPMENT_ROADMAP.md)：从当前阶段到生产化的执行顺序、门禁和 STOP 条件。

根目录 [AGENTS.md](../AGENTS.md) 是项目入口和工作规则。

## 详细来源

- [完整 PRD v1.0](product/PPT-Digital-Human-Video-PRD-v1.0.md)：详细用户故事、需求和验收指标。
- [实施计划](IMPLEMENTATION_PLAN.md)：跨系统阶段顺序和阶段门禁。
- [开发执行路线图](planning/DEVELOPMENT_ROADMAP.md)：面向实际续接的精简全流程计划；当前阶段以它为入口。
- [详细架构决策](ARCHITECTURE_DECISIONS.md)：完整 ADR、状态和论证。
- [旧项目交接](HANDOFF.md)：本上下文系统建立前的全面接手调查。
- [前端开发计划](planning/FRONTEND_DEVELOPMENT_PLAN.md)：Mock 前端的历史实现计划。
- [流水线交接](handoffs/PIPELINE_HANDOFF.md)：后端原型的运行方法和历史媒体结果。
- [可复用 Codex 续接提示词](handoffs/NEXT_CODEX_PROMPT.md)：复制到新任务后，按当前文档和 Git 状态继续。
- [阶段介绍与后续路线](status/高等数学数字人系统-阶段介绍与后续路线.md)：历史阶段报告。

Windows PowerShell 一键复制续接提示词：

```powershell
Get-Content -Raw -Encoding utf8 .\docs\handoffs\NEXT_CODEX_PROMPT.md | Set-Clipboard
```

在项目根目录运行后，把剪贴板内容粘贴到新的 Codex 窗口。提示词默认读取
`docs/CURRENT_TASK.md`；后续只需维护当前任务和状态，不需要每次重写交接提示词。

新上下文文件是阅读入口，不替代详细资料。若文档互相冲突，以当前代码为事实，并在
`STATUS.md` 或 `ARCHITECTURE.md` 中记录差异。

## 归档规则

- 当前跨会话状态：更新 `CURRENT_TASK.md` 和 `STATUS.md`。
- 产品目标、范围或验收变化：更新 `PRD.md`，并同步详细 PRD。
- 当前架构事实变化：更新 `ARCHITECTURE.md`。
- 已确认技术方向变化：更新 `DECISIONS.md`，必要时补详细 ADR。
- 跨系统实施顺序：`IMPLEMENTATION_PLAN.md`。
- 单一模块的计划、状态或历史交接：分别进入 `planning/`、`status/`、`handoffs/`。
- 前端或后端专用使用说明：就近放在对应目录。

不要在多个文件复制完整历史；入口文档保持精简并链接详细来源。
