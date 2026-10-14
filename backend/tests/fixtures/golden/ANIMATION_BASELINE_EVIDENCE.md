# 动画金样与成片基线：本机环境证据

> 本文记录 M0 期间关于"动画金样"与"成片静态基线"的**环境事实与结论**。
> 最终基线报告见同目录的 [`ANIMATION_STATIC_BASELINE.md`](ANIMATION_STATIC_BASELINE.md)。
> 本文前一版本曾判定"基线在本机不可能完成"，该结论**已被推翻并更正**（见第 3 节）。

## 1. 结论

| 事项 | 状态 |
| --- | --- |
| 两个动画金样（真实 COM 动画事实） | ✅ 已生成并验证 |
| "清单存在但成片静态"缺陷基线 | ✅ 已复现并固化（见 `ANIMATION_STATIC_BASELINE.md`） |
| 本机 PowerPoint COM | ⚠️ 可用，但有**前置条件**：需要先有一个运行中的 PowerPoint 实例 |

## 2. 本机 PowerPoint COM 的真实行为（关键）

实测规律非常明确：

| 条件 | `DispatchEx("PowerPoint.Application")` 结果 |
| --- | --- |
| 没有任何 PowerPoint 实例在运行 | ❌ `com_error -2146959355 服务器运行失败`，约 16 秒超时 |
| 已有一个运行中的 PowerPoint 实例 | ✅ 成功，约 **4.8 秒** |

也就是说：**COM 冷启动被拒，但对已运行实例可以正常连接。**

**正确做法**：先手动启动一次 PowerPoint（`POWERPNT.EXE`），等窗口出现后，再执行需要 COM 的脚本。项目自身的适配器在成功路径上会自行回收它启动的 `POWERPNT` 进程（实测正常退出后残留为 0）。

```powershell
# 先预热一个实例（窗口出现即视为就绪）
Start-Process 'C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE'
Start-Sleep -Seconds 5   # 或轮询 MainWindowTitle 非空

# 再运行需要 COM 的脚本
python -m backend.tools.create_animation_goldens --out backend/tests/fixtures/golden
python -m backend.powerpoint_animation_adapter --input <deck.pptx> --output <manifest.json> --state <state.json>
```

**注意**：若上一次调用留下残留 `POWERPNT` 进程，后续调用可能报
`POWERPOINT_COM_UNAVAILABLE`（无法启动隔离的 PowerPoint）。遇到时先清理：
`Get-Process POWERPNT | Stop-Process -Force`。

### Office 授权状态（记录，非阻塞）

- `OSPP.VBS /dstatus`：唯一有效许可证为 `Office16OneNoteFreeR_Bypass`；`HomeStudent2021Retail` 无有效授权；
- `ClickToRun\Configuration`：`DeployedInAuditMode = True`；`DeviceEntitlementsExist = 0`。

**观察**：在这台机器上，PowerPoint 甚至能以"安全模式"窗口启动，并且 COM 仍然可用。因此
**未激活状态不阻塞动画事实提取**——真正的阻塞点是上面的"必须先有运行实例"。这一条是前一轮误判的根源。

## 3. 更正记录（前一版本的错误结论）

前一版本曾写下："M0 第 4 条在本机不是'难做'，而是'缺少前提、不可能完成'，因为本机拿不到动画事实。"

该结论**错误**。当时用来支撑它的证据是：

```text
metadataSource = STATIC_FALLBACK
第1页 effectCount=0  第2页 effectCount=0
首个警告 = POWERPOINT_COM_UNAVAILABLE
```

这些数据本身是对的，但归因错了：它反映的是"**调用时没有可用的 PowerPoint 实例**"，而不是"这台机器上不存在动画事实"。一旦按第 2 节先预热实例，同一台机器上立刻得到：

```text
metadataSource = POWERPOINT_COM
第1页 effectCount=3  序列=['MAIN']   （ENTRANCE 0.5s / EMPHASIS 1.0s / EXIT 0.75s）
自动换页 = True, 3.0 秒
```

因此：**"基线不可得"的结论撤回**，基线已按 M0 要求复现并固化。

教训（写给后续会话）：当 COM 报 `服务器运行失败` 时，应先尝试"预热实例后再连接"，再判断为环境缺失。`POWERPOINT_COM_UNAVAILABLE` 这个错误码容易被误读为"机器上没有 PowerPoint"。

## 4. 两个动画金样（已验证）

生成入口：`backend/tools/create_animation_goldens.py`（真实 PowerPoint COM，无合成伪造）。

| 金样 | 效果数 | 序列 | 用途 |
| --- | --- | --- | --- |
| `animated-auto-simple.pptx` | 3（ENTRANCE/EMPHASIS/EXIT） | 仅 `MAIN` | M2 原生视频 POC 的 GO/NO-GO；自动换页 3.0s |
| `animated-unsupported.pptx` | 4（含交互序列与指定触发形状） | `MAIN` + `INTERACTIVE` | 验证保守处置：必须由用户显式接受静态 |

两者的 `metadataSource` 均为 `POWERPOINT_COM`，验证方式是直接运行
`backend.powerpoint_animation_adapter` 提取事实并逐项核对。

## 5. 为什么不能用合成动画绕过

手写 OOXML `p:timing` 冒充金样**既不是 COM 事实、也无法在真实 PowerPoint 中验证**，直接违反项目
"不得用屏幕录制、固定等待、整份视频粗切或模型猜测冒充逐页原生动画保真"的规则。本机既然已有可用
的 COM 路径，就应当用真实 PowerPoint 生成，因此明确不采用合成方式。
