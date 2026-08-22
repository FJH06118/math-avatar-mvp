from __future__ import annotations

import argparse
from pathlib import Path


def create_fixture(output_path: Path) -> None:
    """Create a synthetic presentation using the real PowerPoint object model."""

    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    application = None
    presentation = None
    try:
        application = win32com.client.DispatchEx("PowerPoint.Application")
        application.AutomationSecurity = 3  # msoAutomationSecurityForceDisable
        application.DisplayAlerts = 1  # ppAlertsNone
        presentation = application.Presentations.Add(WithWindow=False)

        slide = presentation.Slides.Add(1, 12)  # ppLayoutBlank
        title = slide.Shapes.AddTextbox(1, 80, 55, 800, 70)
        title.Name = "中文标题"
        title.TextFrame.TextRange.Text = "导数动画识别验证"

        derivation = slide.Shapes.AddTextbox(1, 120, 190, 760, 170)
        derivation.Name = "逐步推导"
        derivation.TextFrame.TextRange.Text = "第一步：写出差商\r第二步：令增量趋近于零"

        answer = slide.Shapes.AddTextbox(1, 120, 420, 640, 90)
        answer.Name = "答案展示"
        answer.TextFrame.TextRange.Text = "答案：f'(x)=2x"

        trigger = slide.Shapes.AddShape(1, 820, 420, 150, 70)
        trigger.Name = "点击显示答案"
        trigger.TextFrame.TextRange.Text = "点击揭晓"

        main = slide.TimeLine.MainSequence

        enter = main.AddEffect(title, 1, 0, 1)  # Appear, on page click
        enter.Timing.Duration = 0.5
        enter.Timing.TriggerDelayTime = 0.1

        emphasis = main.AddEffect(derivation, 61, 0, 2)  # Spin, with previous
        emphasis.Timing.Duration = 1.25
        emphasis.Timing.TriggerDelayTime = 0.2
        emphasis.Timing.RepeatCount = 2
        emphasis.Timing.AutoReverse = -1

        exit_effect = main.AddEffect(derivation, 10, 0, 3)  # Fade, after previous
        exit_effect.Exit = -1
        exit_effect.Timing.Duration = 0.75
        exit_effect.Timing.TriggerDelayTime = 0.3

        interactive = slide.TimeLine.InteractiveSequences.Add()
        reveal = interactive.AddEffect(answer, 10, 0, 4)  # Fade, on shape click
        reveal.Timing.TriggerShape = trigger
        reveal.Timing.Duration = 0.6
        reveal.Timing.TriggerDelayTime = 0.15

        transition = slide.SlideShowTransition
        transition.EntryEffect = 1793  # ppEffectFade
        transition.Duration = 1.0
        transition.AdvanceOnClick = -1
        transition.AdvanceOnTime = -1
        transition.AdvanceTime = 4.0

        second = presentation.Slides.Add(2, 12)
        second_title = second.Shapes.AddTextbox(1, 100, 100, 800, 100)
        second_title.Name = "无动画页标题"
        second_title.TextFrame.TextRange.Text = "第二页：无对象动画"

        output_path.parent.mkdir(parents=True, exist_ok=True)
        presentation.SaveAs(str(output_path.resolve()), 24)  # ppSaveAsOpenXMLPresentation
    finally:
        if presentation is not None:
            presentation.Close()
        if application is not None:
            application.Quit()
        pythoncom.CoUninitialize()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default=str(Path(__file__).with_name("动画识别-中文课件.pptx")),
    )
    args = parser.parse_args()
    create_fixture(Path(args.output).expanduser().resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
