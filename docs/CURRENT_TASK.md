# 当前任务

> 更新时间：2026-08-03。
> 状态：阶段 T 已开始；首个明确子阶段 T-A「真实上传、BFF、私有 HTTP 与产品持久化边界」已实现并通过专项验证。整个阶段 T 尚未完成，本轮按子阶段 STOP 等待确认后再进入 T-B。

## 当前阶段与本轮唯一目标

当前阶段为阶段 T「三页真实产品纵向切片」。本轮唯一目标 T-A 是建立最薄的真实入口：

```text
浏览器真实 adapter
→ Next.js Route Handler BFF
→ Hono 私有 application service
→ PPTX 双重校验
→ PostgreSQL/Prisma 产品 Project、Asset、Presentation、GenerationTask + outbox
→ 真实任务查询
```

T-A 不运行 LibreOffice、Agent、TTS、Sharp 或 FFmpeg；这些耗时能力必须由后续
持久 Worker 消费 outbox，不得进入 HTTP 请求。

## 本轮完成内容

- 用户已批准 Hono 4.12.31 + `@hono/node-server` 2.0.12 作为私有 Node/TypeScript HTTP 服务；版本已成为 backend 直接依赖，没有联网安装或批量升级。
- 新增产品 migration，T0 POC 表保持不变；产品 Project、Asset、Presentation、GenerationTask、TaskOutbox 和 GenerationTaskStep 使用稳定 ID、scope、幂等键、输入哈希和向前 migration。
- `POST /v1/projects` 接收 multipart PPTX，重新检查 100 MiB 上限、文件名、MIME、ZIP 中央目录、加密标志、解压规模和 PPTX 必需结构，并计算 SHA-256。
- 项目、源资产、课件、解析任务和 outbox 在同一数据库事务中创建；同 principal/同 key/同 payload 返回原任务，不同 payload 返回 409。
- `GET /v1/tasks/:taskId` 按固定内部 principal 查询；另一 principal 得到 404。公共 Contract 和集成测试扫描确认响应不含 `storageKey`、磁盘路径、密钥或堆栈。
- Next BFF 使用 server-only 环境配置转发固定 principal 和内部令牌；浏览器真实 adapter 输入输出均经过共享 Zod。现有 Mock adapter 和 CLI 原入口未删除，真实 adapter 尚未切为页面默认。
- `PresentationSchema` 现在允许 pending 阶段未知页数/尺寸；只有 completed 状态强制至少一页并具备完整几何数据。
- backend 新增独立 TypeScript 类型门禁；T0 旧 POC 继续由 7/7 运行测试保护。
- 用户批准从私有 14 页课件提取前三页。通用切片工具已生成 Git 忽略副本，源文件未修改；强制 rules planner 的 prepare 得到 3 页、3 场景、3 张原页，`renderer=libreoffice`、`renderError=null`、`plannerError=null`，没有向 Provider 发送内容。

## 已确认的文档冲突及处理

- 旧路线图要求 T0 先选择 HTTP 框架，但 T0 实际完成时该选择仍为空。用户在进入 T 后显式批准 Hono；决策现记录为阶段 T-A，而不是追写成 T0 已完成事项。
- 阶段 T 要求三页真实业务切片，而已确认私有输入为 14 页。用户批准保留原件并提取前三页到 Git 忽略目录；合成 `tracer-3.pptx` 继续只作公开回归 fixture。
- `docs/STATUS.md`/路线图仍有 ahead 6 和“等待进入 T”的旧描述；本轮同步按 Git 事实更新为 ahead 10、T 已开始。

## 预计后续 T-B 范围

T-B 只应从 T-A 的 outbox 开始，实现产品 parse dispatcher/lease worker：

- outbox 重放创建稳定 PARSE step；Worker 领取、heartbeat、取消和租约接管复用已通过的 T0 语义。
- Worker 在 attempt 隔离目录调用现有 Python/LibreOffice 适配器，登记 3/3 原页 Asset 和真实进度。
- 原页失败必须让任务失败，不得用重排文本页冒充。
- 前端轮询真实任务和页面重载幂等行为加入专项测试。

T-B 不自动进入 Agent、审核、TTS、渲染或下载闭环；这些属于后续 T 子阶段。

## 明确不处理

- 不接正式认证、团队/租户、对象存储、生产供应商或部署。
- 不引入 Redis/BullMQ、Remotion、JS PPT 主解析器、多 Agent、OCR 或完整 Overlay 白名单。
- 不把真实 adapter 设为页面默认，不重做现有 UI。
- 不执行 Git commit、push、系统软件安装或外部部署。
- 不把 T-A 标记为整个阶段 T 完成，也不进入阶段 3。

## 本轮专项与阶段门禁

已取得的专项证据：

```powershell
npm.cmd run test:contracts                 # 8/8
npm.cmd run test:unit                      # 2/2
npm.cmd run test:integration               # 3/3，含私有三页切片 HTTP 上传
npm.cmd run t0:test                        # 7/7
npm.cmd run backend:prepare -- --input <private-slice> --job-dir <ignored-job> --planner rules
```

文档更新后已严格串行运行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

最终结果：全部退出码为 0。`typecheck` 同时覆盖 backend T-A 与 frontend；Lint
为 0 warning；`test` 包含后端 13/13、Contract 8/8、unit 2/2 和 component
3/3；Next 16.2.11 production build 成功并生成两个动态 BFF 路由；
`routes:check` 的 6 条业务页面均为 HTTP 200 且服务已回收。

最后仍需运行 `git status --short --untracked-files=all`，然后停止等待用户确认。
