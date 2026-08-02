# 当前任务

> 更新时间：2026-08-02。
> 状态：阶段 T0「真实切片进入条件与基础设施 POC」进行中；无 Docker 的基础设施方向已获用户批准，但 PostgreSQL 尚未安装，POC 尚未执行，不能进入阶段 T。

## 当前阶段与唯一目标

当前只处理阶段 T0。下一明确子目标是在普通 Windows 开发环境中，用原生 PostgreSQL + Prisma + PostgreSQL lease worker 完成最小基础设施 POC，证明事务、幂等、outbox、租约、心跳、取消、接管和 Worker kill 恢复语义。

本次文档子任务只固化用户于 2026-08-02 批准的无 Docker 方向和真实阻塞，不安装系统软件、不新增依赖、不实现数据库、HTTP 或 Worker 代码，也不宣称 POC 已通过。

## 已确认事实

- 阶段 1A、阶段 1B 和阶段 2 已完成；阶段 2 的完整串行门禁和 `test:contracts` 已通过。
- `packages/contracts/` 已存在并被前端 Mock adapter 使用；当前前端仍是内存 Mock，后端仍是独立本地 CLI，两端尚未通过真实 HTTP 接通。
- Docker Desktop 4.84.0 已安装，但 WSL2 engine 创建 `docker-desktop` 发行版时返回 `HCS_E_HYPERV_NOT_INSTALLED`，当前 Docker engine 不可用。
- 用户已明确停止 Docker 修复，并批准以 Windows 原生 PostgreSQL + Prisma + PostgreSQL lease worker 作为等价本地方案；T0 不再依赖 Docker、Redis 或 BullMQ。
- 当前机器尚未发现 `psql`、`pg_isready`、`postgres` 或 PostgreSQL Windows 服务；因此数据库与 lease worker POC 均未开始。
- Windows 组件存储检查结果为可修复。用户于 2026-08-02 明确要求终止修复；`DISM` PID 20244 和 `DismHost` PID 8388 已通过一次 UAC 提权的定向 `taskkill` 结束，并复核为不存在。该次 `RestoreHealth` 未完成，不得记录为修复成功。

## 已批准但仍受门禁约束的基础设施方向

- 单一 PostgreSQL 同时保存领域状态、任务快照、outbox、step attempt、租约、心跳和取消状态。
- Prisma 管理类型化数据访问和向前迁移；Prisma 无法表达的部分唯一索引等约束使用受审查的原始 migration SQL。
- Worker 通过 PostgreSQL `FOR UPDATE SKIP LOCKED` 竞争任务，并使用稳定去重键、租约到期时间和 heartbeat 支持崩溃接管。
- 不引入 Redis/BullMQ，不并行维护第二套队列；若 POC 不能证明恢复语义，先停止并更新 ADR/路线图。
- 本地连接通过受配置管理的数据库 URL，不把 PostgreSQL 安装路径、密码或本机目录写入代码或 Git。

该方向是 `Accepted with gate`，不等于代码已经实现，也不等于阶段 T0 已完成。

## T0 仍未满足的进入条件

1. **P-01 未确认**：是否以高等数学作为首发评测重点。当前推荐“数学优先，Contract 保持通用”。
2. **P-02 未确认**：首发用户范围。当前推荐“内部单用户，使用仅限本地/测试的固定 principal”。
3. **基础设施 POC 未通过**：PostgreSQL 尚未安装，事务、幂等、outbox、lease、heartbeat、取消、接管、Worker kill 和向前迁移均无运行证据。
4. **LLM Provider 未确认**：尚无当前可用模型、合法凭据及结构化输出/超时/重试验证；`deepseek-chat` 不得作为生产默认值。
5. **固定三页 fixture 未确认**：仍缺普通文本、OMML 公式、拥挤图文各一页及人工确认的原页 PNG/覆盖区域。

以上任一项未关闭，都不得进入阶段 T，更不能直接开始阶段 3。

## 下一次实施前需要的授权

- DISM 已按用户要求终止；若后续系统安装或 Windows 功能异常，需要先重新检查组件存储状态，但不自动恢复 Docker/WSL 修复。
- 本轮“批准”只固化无 Docker 技术方向，不自动扩大为系统安装授权。安装 Windows 原生 PostgreSQL 属于系统软件安装，必须获得用户对该安装动作的明确授权后再执行。
- 安装后只实施 T0 的最小数据库/lease worker POC；不顺带建设完整 API、对象存储或真实产品流程。

## 预计修改范围（下一子任务）

- 根 workspace 依赖和脚本。
- 最小 Prisma schema、migration 与数据库测试配置。
- 最小 PostgreSQL lease worker/outbox POC 及专项测试。
- `docs/STATUS.md`、`docs/CURRENT_TASK.md`、ADR 和路线图中的 POC 结果。

确切文件必须在安装完成、重新检查 Git 和读取届时文档后再确定。

## 明确不处理

- 不再修复 Docker/WSL，不要求 Redis、BullMQ 或 Docker Compose。
- 不接真实上传、完整 BFF、对象存储、生产认证、生产 LLM/TTS 或正式部署。
- 不修改现有页面业务流程，不大规模重做 UI，不进入阶段 T、阶段 3 或后续阶段。
- 不删除、恢复或覆盖现有工作区改动；不执行 Git commit、push 或系统软件安装，除非用户另行明确授权。

## 本次文档检查

本次只修改计划和状态文档，属于 T0 决策记录而非阶段完成。检查应包含：

```powershell
git diff --check
rg -n "Docker|Redis|BullMQ|PostgreSQL|Prisma|lease|阶段 T0|阶段 T" AGENTS.md README.md docs
git status --short --untracked-files=all
```

完整 `typecheck`、`lint`、`test`、`build`、`routes:check` 将在 T0 实现子任务结束时按规定串行运行；本次不得把未运行的门禁写成通过。
