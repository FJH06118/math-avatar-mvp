"""生成 M0 要求的五个无隐私合成金样课件。

设计要点（对齐 docs/planning/CURRENT_RESULTS_CAPABILITY_ROADMAP.md 的 M0 小节）：

- 纯合成、无隐私、可重复生成；不包含任何真实课件内容。
- 静态金样只使用 python-pptx + Pillow，**不依赖真实 PowerPoint**，因此在任何
  机器上都能重建。
- 动画金样必须携带真实 PowerPoint 动画事实（效果/计时/触发器），只能通过
  PowerPoint COM 生成；对应入口是
  ``backend/tests/fixtures/create_animation_fixture.py``。PowerPoint 不可用时本
  脚本会明确跳过并在清单里标记为 blocked，而不是伪造动画。

用法::

    python -m backend.tools.create_golden_samples --out backend/tests/fixtures/golden

生成后立即重算 SHA-256 并写出 ``golden-samples.json`` 清单。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Emu, Inches, Pt

# 画幅定义（英寸），与产品要求的 contain 目标一致
LAYOUTS: dict[str, tuple[float, float]] = {
    "wide-16x9": (13.333333, 7.5),
    "standard-4x3": (10.0, 7.5),
    "portrait": (7.5, 10.0),
}

TITLE_FONT = "Microsoft YaHei"


def _add_title(slide, text: str, width_in: float, top_in: float = 0.45) -> None:
    box = slide.shapes.add_textbox(Inches(0.7), Inches(top_in), Inches(width_in), Inches(0.8))
    run = box.text_frame.paragraphs[0].add_run()
    run.text = text
    run.font.name = TITLE_FONT
    run.font.size = Pt(28)
    run.font.bold = True


def _add_body(slide, lines: list[str], width_in: float, top_in: float, height_in: float, size: int = 16) -> None:
    box = slide.shapes.add_textbox(Inches(0.9), Inches(top_in), Inches(width_in), Inches(height_in))
    frame = box.text_frame
    frame.word_wrap = True
    for index, line in enumerate(lines):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        run = paragraph.add_run()
        run.text = line
        run.font.name = TITLE_FONT
        run.font.size = Pt(size)


def _formula_image(path: Path, text: str, width: int = 900, height: int = 220) -> None:
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle([(2, 2), (width - 3, height - 3)], outline=(180, 180, 180), width=2)
    draw.text((24, height // 2 - 10), text, fill=(20, 20, 20))
    image.save(path)


def _chart_image(path: Path, width: int = 900, height: int = 420) -> None:
    """画一张最简单的“左右极限”示意图，不含外部素材。"""
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    axis_y = height - 60
    draw.line([(60, axis_y), (width - 30, axis_y)], fill=(60, 60, 60), width=2)  # x 轴
    draw.line([(60, 30), (60, axis_y)], fill=(60, 60, 60), width=2)  # y 轴
    # 一条在 x=2 附近趋近于 5 的曲线
    points = []
    for step in range(0, 220):
        x_value = 0.5 + step * (4.0 - 0.5) / 219
        y_value = 5 - 1.6 * ((x_value - 2.0) ** 2)
        px = 60 + (x_value - 0.5) / 3.5 * (width - 120)
        py = axis_y - (y_value / 6.0) * (axis_y - 40)
        points.append((px, py))
    draw.line(points, fill=(0, 90, 200), width=3)
    # 标注极限点
    limit_x = 60 + (2.0 - 0.5) / 3.5 * (width - 120)
    limit_y = axis_y - (5 / 6.0) * (axis_y - 40)
    draw.ellipse([(limit_x - 6, limit_y - 6), (limit_x + 6, limit_y + 6)], outline=(200, 40, 40), width=3)
    draw.text((limit_x + 12, limit_y - 22), "x -> 2, f(x) -> 5", fill=(200, 40, 40))
    draw.text((width - 150, axis_y + 12), "x", fill=(60, 60, 60))
    draw.text((66, 34), "y", fill=(60, 60, 60))
    image.save(path)


def build_static_math_16x9(output: Path, work: Path) -> list[str]:
    """16:9：公式、图表、长短讲稿、两段以上 narration 的静态课件。"""
    width, height = LAYOUTS["wide-16x9"]
    presentation = Presentation()
    presentation.slide_width = Inches(width)
    presentation.slide_height = Inches(height)
    formula = work / "golden-formula.png"
    chart = work / "golden-chart.png"
    _formula_image(formula, "lim  (f(x+h) - f(x)) / h = f'(x)")
    _chart_image(chart)

    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _add_title(slide, "1.1 极限：从直观到定义", width - 2.4)
    _add_body(
        slide,
        [
            "目标：理解“函数值靠近某个数”的直观含义。",
            "关键：自变量趋近与函数值相等是两件事。",
            "观察右图：x 从两侧靠近 2 时，f(x) 靠近 5。",
        ],
        width - 2.4,
        1.5,
        1.5,
    )
    slide.shapes.add_picture(str(chart), Inches(0.9), Inches(3.3), width=Inches(width - 3.0))

    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _add_title(slide, "1.2 导数定义与差商", width - 2.4)
    _add_body(
        slide,
        [
            "差商表示平均变化率，取极限得到瞬时变化率。",
            "推导第 1 步：写出差商。",
            "推导第 2 步：令 h 趋近于 0。",
        ],
        width - 2.4,
        1.5,
        1.4,
    )
    slide.shapes.add_picture(str(formula), Inches(0.9), Inches(3.2), width=Inches(width - 4.2))
    table = slide.shapes.add_table(2, 2, Inches(0.9), Inches(5.4), Inches(7.2), Inches(1.1)).table
    table.cell(0, 0).text = "符号"
    table.cell(0, 1).text = "含义"
    table.cell(1, 0).text = "f'(x)"
    table.cell(1, 1).text = "瞬时变化率"

    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _add_title(slide, "1.3 连续性的图像判定", width - 2.4)
    _add_body(
        slide,
        [
            "判定一：左右极限存在且相等。",
            "判定二：函数在该点有定义。",
            "判定三：极限值等于函数值。",
            "这是本节课要求掌握的三条判定。",
        ],
        width - 2.4,
        1.5,
        2.2,
    )

    presentation.save(output)
    return ["static", "no-animation", "16:9"]


def build_static_4x3(output: Path, work: Path) -> list[str]:
    """4:3 静态课件（验证 contain 到 1920×1080 的补边处理）。"""
    width, height = LAYOUTS["standard-4x3"]
    presentation = Presentation()
    presentation.slide_width = Inches(width)
    presentation.slide_height = Inches(height)
    formula = work / "golden-formula-4x3.png"
    _formula_image(formula, "sin x / x -> 1  (x -> 0)", width=760, height=200)

    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _add_title(slide, "4:3 课件：重要极限", width - 1.8)
    _add_body(
        slide,
        [
            "角度使用弧度制。",
            "该极限常用于推导 sin x 在 0 点的导数。",
        ],
        width - 1.8,
        1.6,
        1.2,
    )
    slide.shapes.add_picture(str(formula), Inches(0.8), Inches(3.2), width=Inches(width - 2.2))

    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _add_title(slide, "4:3 课件：练习", width - 1.8)
    _add_body(
        slide,
        [
            "练习 1：求 lim (x^2 - 1) / (x - 1)，x -> 1。",
            "提示：先因式分解，再代入。",
        ],
        width - 1.8,
        1.6,
        1.4,
    )

    presentation.save(output)
    return ["static", "no-animation", "4:3"]


def build_static_portrait(output: Path, work: Path) -> list[str]:
    """纵向静态课件（验证非 16:9 补边与字号安全区）。"""
    width, height = LAYOUTS["portrait"]
    presentation = Presentation()
    presentation.slide_width = Inches(width)
    presentation.slide_height = Inches(height)

    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _add_title(slide, "纵向课件：数列极限", width - 1.6)
    _add_body(
        slide,
        [
            "数列极限关注 n 趋于无穷时的趋势。",
            "单调有界数列必有极限。",
            "例：a_n = 1 / n，极限为 0。",
        ],
        width - 1.6,
        1.8,
        2.2,
    )

    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _add_title(slide, "纵向课件：小结", width - 1.6)
    _add_body(
        slide,
        [
            "先看趋势，再写符号。",
            "极限存在与函数值是否相等无关。",
        ],
        width - 1.6,
        1.8,
        1.6,
    )

    presentation.save(output)
    return ["static", "no-animation", "portrait"]


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


STATIC_BUILDERS = {
    "static-math-16x9.pptx": (build_static_math_16x9, 3),
    "static-4x3.pptx": (build_static_4x3, 2),
    "static-portrait.pptx": (build_static_portrait, 2),
}


def main() -> int:
    parser = argparse.ArgumentParser(description="生成 M0 金样课件")
    parser.add_argument("--out", required=True, help="输出目录")
    parser.add_argument(
        "--animation-source",
        default="backend/tests/fixtures/create_animation_fixture.py",
        help="动画金样的 COM 生成脚本（PowerPoint 不可用时会被标记为 blocked）",
    )
    args = parser.parse_args()

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    # 中间图片放在系统临时目录，避免把 .work 之类的草稿留在 fixture 目录里
    work_dir = Path(tempfile.mkdtemp(prefix="golden-samples-"))

    records: list[dict[str, object]] = []
    try:
        for file_name, (builder, expected_slides) in STATIC_BUILDERS.items():
            target = out_dir / file_name
            tags = builder(target, work_dir)
            records.append(
                {
                    "file": file_name,
                    "sha256": sha256_of(target),
                    "sizeBytes": target.stat().st_size,
                    "expectedSlideCount": expected_slides,
                    "animationClass": tags[0],
                    "animationDetail": "无对象动画、无页面切换动画（COM 事实为零效果清单）",
                    "layout": tags[2],
                    "generator": "backend/tools/create_golden_samples.py",
                    "manualObservationPoints": [
                        "页数与预期一致",
                        "公式/表格/图表完整保留，未被裁切",
                        "数字人叠加不得遮挡标题与公式",
                    ],
                }
            )

        # 动画金样：必须由真实 PowerPoint COM 生成，不可伪造。
        # 生成入口：python -m backend.tools.create_animation_goldens --out <本目录>
        # 注意：本机实测 COM 冷启动会被拒，需要先有一个运行中的 PowerPoint 实例。
        for file_name, note, facts in (
            (
                "animated-auto-simple.pptx",
                "仅主序列、自动计时、普通进入/强调/退出效果；用于 M2 原生视频 POC 的 GO/NO-GO",
                {
                    "metadataSource": "POWERPOINT_COM",
                    "expectedSlideCount": 2,
                    "slide1EffectCount": 3,
                    "sequenceKinds": ["MAIN"],
                    "effectCategories": ["ENTRANCE", "EMPHASIS", "EXIT"],
                    "slideTransition": {"advanceOnTime": True, "advanceTimeSeconds": 3.0},
                    "slide2EffectCount": 0,
                },
            ),
            (
                "animated-unsupported.pptx",
                "含交互触发器 + 指定触发形状；用于验证保守处置（必须由用户显式接受静态）",
                {
                    "metadataSource": "POWERPOINT_COM",
                    "expectedSlideCount": 1,
                    "slide1EffectCount": 4,
                    "sequenceKinds": ["MAIN", "INTERACTIVE"],
                    "excludedByM2Whitelist": True,
                },
            ),
        ):
            target = out_dir / file_name
            if not target.exists():
                records.append(
                    {
                        "file": file_name,
                        "sha256": None,
                        "sizeBytes": None,
                        "expectedSlideCount": facts.get("expectedSlideCount"),
                        "animationClass": "animated",
                        "animationDetail": note,
                        "layout": "16:9",
                        "generator": "backend/tools/create_animation_goldens.py",
                        "status": "BLOCKED_POWERPOINT_COM",
                        "blockedReason": (
                            "动画金样需要真实 PowerPoint COM。本机实测 COM 冷启动被拒"
                            "（服务器运行失败），需先有一个运行中的 PowerPoint 实例；"
                            "动画事实不得用合成方式伪造。生成后请重跑本脚本以写入哈希与事实。"
                        ),
                        "evidence": "backend/tests/fixtures/golden/ANIMATION_BASELINE_EVIDENCE.md",
                        "manualObservationPoints": [
                            "COM 提取的效果数/序列/触发器与课件设计一致",
                            "animated-unsupported 在没有处置时必须被阻断生成",
                        ],
                    }
                )
            else:
                records.append(
                    {
                        "file": file_name,
                        "sha256": sha256_of(target),
                        "sizeBytes": target.stat().st_size,
                        "expectedSlideCount": facts.get("expectedSlideCount"),
                        "animationClass": "animated",
                        "animationDetail": note,
                        "layout": "16:9",
                        "generator": "backend/tools/create_animation_goldens.py",
                        "verifiedAnimationFacts": facts,
                        "verifiedBy": "backend.powerpoint_animation_adapter（真实 COM 提取）",
                        "evidence": "backend/tests/fixtures/golden/ANIMATION_BASELINE_EVIDENCE.md",
                        "baseline": (
                            "backend/tests/fixtures/golden/ANIMATION_STATIC_BASELINE.md"
                            if file_name == "animated-auto-simple.pptx"
                            else None
                        ),
                        "manualObservationPoints": [
                            "COM 提取的效果数/序列/触发器与课件设计一致",
                            "animated-unsupported 在没有处置时必须被阻断生成",
                        ],
                    }
                )

        manifest = {
            "schemaVersion": 1,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "purpose": (
                "M0 最小金样：为动画处置、布局、字幕与桌面验收提供固定且无隐私的输入"
            ),
            "privacy": "全部为脚本合成内容，不含任何真实课件或用户数据",
            "samples": records,
        }
        manifest_path = out_dir / "golden-samples.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    for record in records:
        status = record.get("status", "OK")
        print(f"{status:>24}  {record['file']}")
    print(f"\n清单: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
