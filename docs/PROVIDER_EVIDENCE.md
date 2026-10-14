# Provider 逐供应商证据声明

> 建立于 2026-10（M0 第 5 项要求：把 Provider 支持声明改为逐供应商证据）。
> 本文只记录**可核对的证据状态**，不把「adapter 已实现」写成「供应商已验收」。
> 相关契约：`packages/contracts/src/provider.ts`；适配器：`backend/app/providers/`。

## 1. 结论

**七类 Provider 的 adapter 全部已实现；真实账号层面，目前只有 DeepSeek 在本机被实际验证过（文本 + 图片输入）。**
其余六类保持「adapter 已实现、真实账号未验收」。Release A 只选 **一个** 真实多模态 Provider 作为发布门，其余不阻塞 Beta，也不获得「已验收」声明。

## 2. 逐供应商证据表

| Provider | 协议 | adapter | 真实账号验收 | 证据 |
| --- | --- | --- | --- | --- |
| `DEEPSEEK` | `OPENAI_CHAT` | ✅ `providers/deepseek.ts` | **✅ 本机已实测（文本 + 图片）** | 见第 3 节；`LLM_BASE_URL=https://api.deepseek.com`，模型名 `deepseek-chat` |
| `OPENAI` | `OPENAI_CHAT` | ✅ `providers/openai.ts` | ❌ 未验收 | 只有离线请求体测试（`providers/provider.test.ts`）与 opt-in smoke 入口 |
| `GLM` | `OPENAI_CHAT` | ✅ `providers/glm.ts` | ❌ 未验收 | 同上 |
| `KIMI` | `OPENAI_CHAT` | ✅ `providers/kimi.ts` | ❌ 未验收 | 同上 |
| `DOUBAO`（豆包/方舟） | `OPENAI_CHAT` | ✅ `providers/doubao.ts` | ❌ 未验收 | 同上 |
| `QWEN`（通义千问/百炼） | `OPENAI_CHAT` | ✅ `providers/qwen.ts` | ❌ 未验收 | 同上 |
| `ANTHROPIC` | `ANTHROPIC_MESSAGES` | ✅ `providers/anthropic.ts` | ❌ 未验收 | 同上；协议与其余六类不同（Messages Base64 image block） |

> 契约强制：`kind === "ANTHROPIC"` 必须使用 `ANTHROPIC_MESSAGES`，其余六类必须使用 `OPENAI_CHAT`；不匹配会被 schema 拒绝。

## 3. DeepSeek 的实测记录（本机，2026-10）

### 3.1 文本调用

- 方式：OpenAI 兼容 SDK 直连 `https://api.deepseek.com`，模型名 `deepseek-chat`。
- 结果：✅ 调用成功；响应中的模型标识为 `deepseek-flash`（供应商侧映射，不影响可用性）。

### 3.2 视觉探针（决定是否授予 `VISION`）

项目规则（`backend/app/provider-connection-tester.ts`）：发送受控纯色 PNG，校验模型报出的主色，只有**正确识别**才授予 `VISION`。本机实测发送三张 64×64 纯色图：

```text
期望 红 → 模型回答「红色」 ✅
期望 绿 → 模型回答「绿色」 ✅
期望 蓝 → 模型回答「蓝色」 ✅
视觉探针合计：3/3 通过
```

**结论**：该端点在实测中确实能读取图片内容，按项目规则可获得 `VISION` 能力。
**边界**：这**只证明**「接口能看图且主色识别正确」，**不证明**多模态教学理解（公式、图表、版式的解释质量）已达到任何准确率目标——后者仍属 `EXTERNAL_VALIDATION_PENDING`。

### 3.3 端到端业务链路

用该 Provider 与 CLI 链跑通了「课件解析 → LibreOffice 渲染原页 → LLM 生成讲稿」：

```text
slideCount=3  sceneCount=3  planner=llm  renderer=libreoffice  plannerError=null
```

`planner=llm` 且无回退错误，说明讲稿是由真实模型生成的，而不是规则回退。
**边界**：这是**旧 CLI 链**（12 fps、基础校验），不等于产品链（25/30 fps + Stage 11F 硬门）的验收。

## 4. 真实账号 smoke 的启用方式

`backend/app/providers/real-smoke.test.ts` 默认 **skip**，需要显式开启并为该供应商提供三件套：

```powershell
$env:PPT_DH_PROVIDER_SMOKE = '1'
$env:PPT_DH_SMOKE_<KIND>_API_KEY  = '...'
$env:PPT_DH_SMOKE_<KIND>_BASE_URL = 'https://...'
$env:PPT_DH_SMOKE_<KIND>_MODEL    = '...'
```

三个变量任一缺失时，该供应商的用例仍然 skip（skip 原因会写明缺哪个变量）。
**skip ≠ 通过**：未运行的供应商一律记「未验收」，不得写成「已支持」。

## 5. 可以主张 / 不可主张

**可以主张**

- 七类 Provider 的协议适配、严格输出校验与稳定错误分类已实现，并有离线测试覆盖。
- DeepSeek 在本机的文本调用与图片主色识别已实测通过。
- 连接测试会真实发图，不看图的模型不会拿到 `VISION`；配置或测试失败会撤销既有 `VISION`。

**不可主张**

- ❌ 任何其他六类供应商「已验收」或「已在真实账号上可用」。
- ❌ 「七类 Provider 全部支持」——adapter 支持不等于账号验收。
- ❌ 多模态教学理解的准确率、费用、限流、地域可用性已经达标。
- ❌ 因为 DeepSeek 视觉探针通过，就认为真实 PLAN 的视觉理解质量已通过（那是另一项验收）。

## 6. 后续动作

1. 为 Release A 选定**一个** Beta Provider（当前本机可用的是 DeepSeek），并在同一候选上完成：视觉探针 + 真实 PLAN + 一次显式失败重试。
2. 其余六类若要进入发布声明，需各自补齐：真实账号 smoke、费用/限流/网络失败的稳定错误、以及一次真实 PLAN 的可审核产物。
3. 本表的每次状态变更都应同步回 `docs/STATUS.md`。
