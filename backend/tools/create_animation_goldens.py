"""生成 M0 所需的两个动画金样课件（需要可用的 PowerPoint COM）。

M0 要求（`docs/planning/CURRENT_RESULTS_CAPABILITY_ROADMAP.md` 的 M0 小节）：

- ``animated-auto-simple.pptx``：**仅主序列、自动计时**、普通进入/强调/退出效果。
  用于 M2 原生视频 POC 的 GO / NO-GO 判定。
- ``animated-unsupported.pptx``：至少含交互触发器或复杂路径，用于验证保守处置
  （必须由用户显式接受静态）。

现有 ``create_animation_fixture.py`` 只能产出"含交互触发器的 2 页"，因此这里单独
实现一个可指定变体的生成器，两个金样都由真实 PowerPoint 对象模型产生动画事实，
**不做任何合成伪造**。

用法::

    python -m backend.tools.create_animation_goldens --out <目录>

注意：本机实测 PowerPoint COM 的**冷启动会被拒**（``服务器运行失败``），但有已运行
实例时可以连上。若直接失败，请先手动打开一次 PowerPoint（或用
``tools/run_powerpoint_tasks.ps1``）再执行本脚本。
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

PPT_LAYOUT_BLANK = 12
PP_SAVE_AS_OPENXML = 24
MSO_AUTOMATION_SECURITY_FORCE_DISABLE = 3
PP_ALERTS_NONE = 1

# 效果类型（PowerPoint MsoAnimEffect 常量）
EFFECT_APPEAR = 1
EFFECT_FADE = 10
EFFECT_SPIN = 61

# MsoAnimTriggerType
TRIGGER_ON_PAGE_CLICK = 1
TRIGGER_WITH_PREVIOUS = 2
TRIGGER_AFTER_PREVIOUS = 3

# MsoTriState
TRUE = -1


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _add_text(slide, name: str, left: float, top: float, width: float, height: float, text: str):
    box = slide.Shapes.AddTextbox(1, left, top, width, height)
    box.Name = name
    box.TextFrame.TextRange.Text = text
    return box


def _build_simple(presentation) -> None:
    """仅主序列 + 自动计时 + 普通进入/强调/退出：M2 白名单形状。"""
    slide = presentation.Slides.Add(1, PPT_LAYOUT_BLANK)
    title = _add_text(slide, "自动计时标题", 80, 55, 800, 70, "自动计时动画页")
    body = _add_text(slide, "自动计时正文", 120, 190, 760, 150, "第一行结论\r第二行补充")
    emphasis = _add_text(slide, "自动计时强调", 120, 380, 640, 90, "重点：自动播放")

    main = slide.TimeLine.MainSequence
    # 进入效果：与上一动画同时（自动，无需点击）
    enter = main.AddEffect(title, EFFECT_APPEAR, 0, TRIGGER_WITH_PREVIOUS)
    enter.Timing.Duration = 0.5
    # 强调效果：上一动画之后
    spin = main.AddEffect(emphasis, EFFECT_SPIN, 0, TRIGGER_AFTER_PREVIOUS)
    spin.Timing.Duration = 1.0
    spin.Timing.RepeatCount = 1
    # 退出效果：上一动画之后
    exit_effect = main.AddEffect(body, EFFECT_FADE, 0, TRIGGER_AFTER_PREVIOUS)
    exit_effect.Exit = TRUE
    exit_effect.Timing.Duration = 0.75

    # 页面切换：仅自动换页，不依赖点击
    transition = slide.SlideShowTransition
    transition.EntryEffect = 1793  # ppEffectFade
    transition.Duration = 0.75
    transition.AdvanceOnClick = 0
    transition.AdvanceOnTime = TRUE
    transition.AdvanceTime = 3.0

    # 第二页保持合法零动画，用于对照
    second = presentation.Slides.Add(2, PPT_LAYOUT_BLANK)
    _add_text(second, "零动画页标题", 100, 100, 800, 100, "第二页：无对象动画")


def _build_unsupported(presentation) -> None:
    """含交互触发器：必须被保守处置（用户显式接受静态）。

    构造顺序与仓库中已验证可用的 ``create_animation_fixture.py`` 保持一致：
    先在主序列建立效果，再创建交互序列并指定触发形状；否则
    ``Sequence.AddEffect`` 会报 "Invalid request"。
    """
    slide = presentation.Slides.Add(1, PPT_LAYOUT_BLANK)
    title = _add_text(slide, "交互页标题", 80, 55, 800, 70, "交互触发器动画页")
    body = _add_text(slide, "交互推导", 120, 190, 760, 150, "第一步：写出差商\r第二步：令增量趋近于零")
    answer = _add_text(slide, "交互答案", 120, 420, 640, 90, "答案：需要点击才显示")
    trigger = slide.Shapes.AddShape(1, 820, 420, 170, 70)
    trigger.Name = "点击触发器"
    trigger.TextFrame.TextRange.Text = "点击揭晓"

    main = slide.TimeLine.MainSequence
    enter = main.AddEffect(title, EFFECT_APPEAR, 0, TRIGGER_ON_PAGE_CLICK)
    enter.Timing.Duration = 0.5
    emphasis = main.AddEffect(body, EFFECT_SPIN, 0, TRIGGER_WITH_PREVIOUS)
    emphasis.Timing.Duration = 1.25
    emphasis.Timing.TriggerDelayTime = 0.2
    emphasis.Timing.RepeatCount = 2
    emphasis.Timing.AutoReverse = -1
    exit_effect = main.AddEffect(body, EFFECT_FADE, 0, TRIGGER_AFTER_PREVIOUS)
    exit_effect.Exit = TRUE
    exit_effect.Timing.Duration = 0.75

    # 交互序列 + 指定触发形状：属于 M2 明确排除的类型。
    # 构造顺序与参数照抄仓库中已验证可用的 create_animation_fixture.py。
    interactive = slide.TimeLine.InteractiveSequences.Add()
    reveal = interactive.AddEffect(answer, EFFECT_FADE, 0, 4)
    reveal.Timing.TriggerShape = trigger
    reveal.Timing.Duration = 0.6
    reveal.Timing.TriggerDelayTime = 0.15

    transition = slide.SlideShowTransition
    transition.EntryEffect = 1793
    transition.Duration = 1.0
    transition.AdvanceOnClick = TRUE
    transition.AdvanceOnTime = TRUE
    transition.AdvanceTime = 4.0


def main() -> int:
    parser = argparse.ArgumentParser(description="生成 M0 动画金样（真实 PowerPoint COM）")
    parser.add_argument("--out", required=True, help="输出目录")
    args = parser.parse_args()

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    application = None
    results: list[tuple[str, Path, str]] = []
    try:
        try:
            application = win32com.client.DispatchEx("PowerPoint.Application")
        except Exception as error:  # noqa: BLE001
            print(f"PowerPoint COM 不可用：{type(error).__name__} {error}")
            print("提示：本机 COM 冷启动会被拒；请先手动打开一次 PowerPoint 再重试。")
            return 2

        application.AutomationSecurity = MSO_AUTOMATION_SECURITY_FORCE_DISABLE
        application.DisplayAlerts = PP_ALERTS_NONE

        for file_name, builder, note in (
            ("animated-auto-simple.pptx", _build_simple, "仅主序列 + 自动计时 + 进入/强调/退出"),
            ("animated-unsupported.pptx", _build_unsupported, "含交互触发器 + 指定触发形状"),
        ):
            presentation = application.Presentations.Add(WithWindow=False)
            try:
                builder(presentation)
                target = out_dir / file_name
                presentation.SaveAs(str(target), PP_SAVE_AS_OPENXML)
                results.append((file_name, target, note))
            finally:
                presentation.Close()
    finally:
        if application is not None:
            try:
                application.Quit()
            except Exception:  # noqa: BLE001
                pass
        pythoncom.CoUninitialize()

    for file_name, target, note in results:
        print(f"OK  {file_name}  {target.stat().st_size} B  sha256={_sha256(target)[:16]}…  ({note})")
    if not results:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
