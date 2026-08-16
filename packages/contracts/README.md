# @ppt-digital-human/contracts

网页、BFF、Hono/Worker 与桌面宿主共用的严格 Zod 业务契约。源码只在 `math-avatar-mvp` 仓库维护；独立桌面仓库只消费由 `npm run pack:package` 生成的版本化制品。

制品包含编译后的 ESM、类型声明和 `SOURCE.json`，后者记录来源仓库、Git commit、包版本及 API schema 版本。不得在消费仓库复制或修改业务 schema。
