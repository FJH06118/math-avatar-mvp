# 当前任务

> 更新时间：2026-08-04。状态：阶段 T 已完成，专项与最终阶段门禁全部通过。T-A 已提交；T-B～T-G 变更保留在工作树，尚未提交或推送。

## 当前阶段与本轮唯一目标

阶段 T-G 的唯一目标已经实现：只有通过 T-F 媒体硬门的资产才能经受控 HTTP 下载，并用三页样本完成从 HTTP 上传到 MP4/SRT/项目元数据下载的真实纵向验收。

```text
HTTP upload 三页 PPTX
→ PostgreSQL task/outbox/lease
→ Python parse → strict Agent → explicit approval
→ AUDIO → PAGE_RENDER → COMPOSITE → VALIDATE
→ VALIDATED MediaOutput
→ scoped delivery manifest
→ full/range MP4 + SRT + metadata
```

## T-G 已实现

- strict `DeliveryManifest`/`DeliveryMetadata` Contract；清单只含稳定 ID、哈希、大小与同源 BFF URL，不含磁盘路径或 storage key。
- 私有 Hono 新增交付清单、元数据和资产内容端点；每次读取均重新检查 internal token、principal、项目范围、任务成功状态、`MediaOutput=VALIDATED`、Asset 生命周期、文件大小和 SHA-256。
- 下载支持 `Content-Length`、`Content-Type`、`Content-Disposition`、`ETag`、`If-None-Match`、单 Range 206 与无效范围 416；跨 principal 统一返回 404。
- Next BFF 仅转发 Range/ETag 请求头与公开响应头，不向浏览器暴露内部 token、principal、后端地址或存储键。
- `NEXT_PUBLIC_PPT_DH_API_MODE=stage-t` 可显式启用真实 tracer adapter；默认值与 `mock` 都保持现有 Mock 前端，CLI 不受影响。

## 阶段 T 证据

- `stage-tg.e2e.integration.test.ts`：1/1；真实三页 fixture 从 HTTP 上传到 MP4/SRT/元数据全量与 Range 下载，3/3 页面、一个 highlight Overlay、媒体硬门、哈希、ETag 和跨 principal 404 全部通过。
- 全量 backend integration：18 通过、1 个外部 Edge 用例按设计跳过，共 19 个；T0：7/7；Contract：19/19。
- 真实 DeepSeek V4 Flash、私有课件前三页与公开占位句 Edge TTS 的既有授权验证证据继续有效。本次完整纵切使用本地严格 Agent 与本地有效音频 fixture，未再次外发课件或讲稿。
- 现有多页面产品 UI 默认仍为 Mock；阶段 T 提供了显式真实 adapter 与完整 BFF/API 纵切，项目管理、审核页、任务页和结果页逐屏接线属于阶段 3～10，不在阶段 T 内重做。

## 明确不处理

- 不建设匿名公共 URL、正式认证/团队权限、对象存储签名、链接过期、Redis/BullMQ、生产部署或正式 TTS SLA。
- 不进入阶段 3～10，不大规模修改现有页面业务流程。
- 不提交或 push T-B～T-G 工作树，除非用户再次明确要求。

## 阶段 T 最终门禁

更新本文件与 `docs/STATUS.md` 后严格串行运行：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run routes:check
```

专项命令：

```powershell
npm.cmd run test:t0 --workspace @ppt-digital-human/backend
npm.cmd run test:integration --workspace @ppt-digital-human/backend
npm.cmd exec --workspace @ppt-digital-human/backend -- tsx --test app/stage-tg.e2e.integration.test.ts
```

门禁全部通过后运行 `git status --short --untracked-files=all`，汇报并停止等待用户确认。下一阶段不自动开始，未经再次明确要求不 commit/push。

最终结果：typecheck 通过；lint 0 warning；根 test 中 Python 13/13、Contract 19/19、frontend unit 3/3、component 3/3；Next production build 通过并收集交付 BFF 路由；`routes:check` 6/6 且服务已回收。
