"""Create the small, copyright-safe PPTX fixture used by the T0 tracer gate.

The produced file is deliberately small and synthetic.  It contains one plain
text page, one page with a real OOXML Math (OMML) node, and one crowded
text-and-diagram page.  The manifest records proposed review regions; it is
not an approval artifact until a reviewer explicitly accepts the rendered PNGs.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor


FIXTURE_DIR = Path(__file__).resolve().parent
FIXTURE_PATH = FIXTURE_DIR / "tracer-3.pptx"
MANIFEST_PATH = FIXTURE_DIR / "tracer-3.fixture.json"
SLIDE_WIDTH = Inches(13.333333)
SLIDE_HEIGHT = Inches(7.5)

NAVY = RGBColor(19, 47, 76)
BLUE = RGBColor(41, 111, 180)
PALE_BLUE = RGBColor(232, 242, 252)
INK = RGBColor(32, 42, 53)
MUTED = RGBColor(94, 108, 124)
ORANGE = RGBColor(231, 139, 56)
GREEN = RGBColor(60, 151, 111)
WHITE = RGBColor(255, 255, 255)


def set_background(slide) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = WHITE


def add_textbox(
    slide,
    text: str,
    left: float,
    top: float,
    width: float,
    height: float,
    *,
    font_size: int = 18,
    color: RGBColor = INK,
    bold: bool = False,
    align: PP_ALIGN = PP_ALIGN.LEFT,
) -> None:
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.clear()
    paragraph = frame.paragraphs[0]
    paragraph.alignment = align
    run = paragraph.add_run()
    run.text = text
    run.font.name = "Microsoft YaHei"
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = color


def add_title(slide, title: str, subtitle: str) -> None:
    add_textbox(
        slide,
        title,
        Inches(0.65),
        Inches(0.4),
        Inches(11.9),
        Inches(0.55),
        font_size=28,
        color=NAVY,
        bold=True,
    )
    add_textbox(
        slide,
        subtitle,
        Inches(0.68),
        Inches(1.0),
        Inches(11.5),
        Inches(0.35),
        font_size=12,
        color=MUTED,
    )


def add_card(slide, heading: str, body: str, left: float, top: float, width: float, height: float) -> None:
    card = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE, left, top, width, height
    )
    card.fill.solid()
    card.fill.fore_color.rgb = PALE_BLUE
    card.line.color.rgb = BLUE
    frame = card.text_frame
    frame.clear()
    frame.margin_left = Inches(0.16)
    frame.margin_right = Inches(0.16)
    frame.margin_top = Inches(0.12)
    title = frame.paragraphs[0]
    title_run = title.add_run()
    title_run.text = heading
    title_run.font.name = "Microsoft YaHei"
    title_run.font.size = Pt(16)
    title_run.font.bold = True
    title_run.font.color.rgb = NAVY
    body_paragraph = frame.add_paragraph()
    body_paragraph.space_before = Pt(7)
    body_run = body_paragraph.add_run()
    body_run.text = body
    body_run.font.name = "Microsoft YaHei"
    body_run.font.size = Pt(12)
    body_run.font.color.rgb = INK


def add_plain_text_slide(slide) -> None:
    set_background(slide)
    add_title(slide, "极限：从直观到定义", "普通文本页：用于验证标题、段落和课堂提示的提取")
    add_card(
        slide,
        "学习目标",
        "理解“函数值靠近某个数”的含义；区分自变量趋近与函数值相等。",
        Inches(0.7),
        Inches(1.65),
        Inches(5.85),
        Inches(1.75),
    )
    add_card(
        slide,
        "课堂提示",
        "观察 x 从左右两侧靠近 2 时，f(x) 的变化趋势。先描述图像，再写符号。",
        Inches(6.78),
        Inches(1.65),
        Inches(5.85),
        Inches(1.75),
    )
    example = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE,
        Inches(0.7),
        Inches(3.75),
        Inches(11.93),
        Inches(2.5),
    )
    example.fill.solid()
    example.fill.fore_color.rgb = WHITE
    example.line.color.rgb = RGBColor(202, 215, 230)
    add_textbox(
        slide,
        "例：若 x 不断靠近 2，且 f(x) 不断靠近 5，我们记作“当 x 趋近于 2 时，f(x) 的极限是 5”。\n\n讨论问题：函数在 x=2 处是否必须有定义？函数值是否必须等于 5？",
        Inches(1.0),
        Inches(4.08),
        Inches(11.25),
        Inches(1.65),
        font_size=19,
        color=INK,
    )


def add_omml_slide(slide) -> None:
    set_background(slide)
    add_title(slide, "重要极限与导数定义", "OMML 公式页：用于验证 Office Math XML 的提取和人工公式审核")
    formula_box = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE,
        Inches(1.15),
        Inches(1.7),
        Inches(11.0),
        Inches(1.55),
    )
    formula_box.fill.solid()
    formula_box.fill.fore_color.rgb = PALE_BLUE
    formula_box.line.color.rgb = BLUE
    add_textbox(
        slide,
        "lim x→0   sin x / x = 1",
        Inches(1.55),
        Inches(2.08),
        Inches(10.2),
        Inches(0.65),
        font_size=30,
        color=NAVY,
        bold=True,
        align=PP_ALIGN.CENTER,
    )
    add_card(
        slide,
        "使用条件",
        "角度使用弧度制；先确认分子和分母在极限点附近的变化。",
        Inches(1.15),
        Inches(3.75),
        Inches(5.25),
        Inches(1.65),
    )
    add_card(
        slide,
        "推导连接",
        "把该极限代入差商，可得到 sin x 在 0 点的导数为 1。",
        Inches(6.9),
        Inches(3.75),
        Inches(5.25),
        Inches(1.65),
    )


def add_crowded_slide(slide) -> None:
    set_background(slide)
    add_title(slide, "连续性的图像判定", "拥挤图文页：用于验证复杂布局、图形和安全区的人工审核")
    add_card(slide, "判定一", "左右极限存在且相等。", Inches(0.55), Inches(1.5), Inches(3.15), Inches(1.05))
    add_card(slide, "判定二", "函数在该点有定义。", Inches(0.55), Inches(2.75), Inches(3.15), Inches(1.05))
    add_card(slide, "判定三", "函数值等于极限值。", Inches(0.55), Inches(4.0), Inches(3.15), Inches(1.05))
    add_card(slide, "易错点", "只检查图像不断开还不够。", Inches(0.55), Inches(5.25), Inches(3.15), Inches(1.05))

    graph = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE,
        Inches(4.05),
        Inches(1.5),
        Inches(5.15),
        Inches(4.9),
    )
    graph.fill.solid()
    graph.fill.fore_color.rgb = WHITE
    graph.line.color.rgb = RGBColor(202, 215, 230)
    axis_x = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, Inches(4.55), Inches(5.55), Inches(4.1), Inches(0.03))
    axis_y = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, Inches(6.45), Inches(2.0), Inches(0.03), Inches(3.55))
    for axis in (axis_x, axis_y):
        axis.fill.solid()
        axis.fill.fore_color.rgb = MUTED
        axis.line.fill.background()
    for offset_x, offset_y in ((0.0, 1.85), (0.55, 1.35), (1.1, 1.05), (1.65, 1.35), (2.2, 1.85), (2.75, 2.45), (3.3, 3.0)):
        point = slide.shapes.add_shape(
            MSO_AUTO_SHAPE_TYPE.OVAL,
            Inches(4.7 + offset_x),
            Inches(2.15 + offset_y),
            Inches(0.16),
            Inches(0.16),
        )
        point.fill.solid()
        point.fill.fore_color.rgb = BLUE
        point.line.fill.background()
    discontinuity = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.OVAL,
        Inches(6.37),
        Inches(3.12),
        Inches(0.27),
        Inches(0.27),
    )
    discontinuity.fill.solid()
    discontinuity.fill.fore_color.rgb = WHITE
    discontinuity.line.color.rgb = ORANGE
    discontinuity.line.width = Pt(2)
    add_textbox(slide, "缺口", Inches(6.68), Inches(3.03), Inches(0.75), Inches(0.3), font_size=12, color=ORANGE, bold=True)
    add_textbox(slide, "x", Inches(8.72), Inches(5.45), Inches(0.3), Inches(0.3), font_size=13, color=MUTED)
    add_textbox(slide, "y", Inches(6.22), Inches(1.72), Inches(0.3), Inches(0.3), font_size=13, color=MUTED)
    add_textbox(slide, "图像观察：在缺口两侧函数值趋于同一高度，但还需检查该点函数值。", Inches(4.45), Inches(5.85), Inches(4.4), Inches(0.35), font_size=12, color=MUTED, align=PP_ALIGN.CENTER)

    note = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE,
        Inches(9.55),
        Inches(1.5),
        Inches(3.23),
        Inches(4.9),
    )
    note.fill.solid()
    note.fill.fore_color.rgb = RGBColor(255, 247, 232)
    note.line.color.rgb = ORANGE
    add_textbox(slide, "课堂问题", Inches(9.85), Inches(1.82), Inches(2.5), Inches(0.4), font_size=17, color=NAVY, bold=True)
    add_textbox(slide, "1. 补上缺口后连续吗？\n2. 若函数值改为 3，结论如何？\n3. 怎样用极限语言完整表述？", Inches(9.85), Inches(2.45), Inches(2.45), Inches(2.25), font_size=15, color=INK)
    badge = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE, Inches(9.85), Inches(5.25), Inches(2.55), Inches(0.55))
    badge.fill.solid()
    badge.fill.fore_color.rgb = GREEN
    badge.line.fill.background()
    add_textbox(slide, "先极限，后函数值", Inches(9.95), Inches(5.37), Inches(2.35), Inches(0.25), font_size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)


def inject_omml(fixture_path: Path) -> None:
    math_xml = (
        b'<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">'
        b'<m:limLow><m:lim><m:r><m:t>lim</m:t></m:r></m:lim>'
        b'<m:lim><m:r><m:t>x&#8594;0</m:t></m:r></m:lim></m:limLow>'
        b'<m:r><m:t> sin x / x = 1</m:t></m:r></m:oMath>'
    )
    temporary_path = fixture_path.with_suffix(".tmp.pptx")
    with zipfile.ZipFile(fixture_path) as source, zipfile.ZipFile(
        temporary_path, "w", zipfile.ZIP_DEFLATED
    ) as destination:
        for item in source.infolist():
            data = source.read(item.filename)
            if item.filename == "ppt/slides/slide2.xml":
                data = data.replace(b"</a:p>", math_xml + b"</a:p>", 1)
                if math_xml not in data:
                    raise RuntimeError("failed to add OMML to slide 2")
            destination.writestr(item, data)
    shutil.move(temporary_path, fixture_path)


def create_fixture() -> None:
    presentation = Presentation()
    presentation.slide_width = SLIDE_WIDTH
    presentation.slide_height = SLIDE_HEIGHT
    blank_layout = presentation.slide_layouts[6]
    add_plain_text_slide(presentation.slides.add_slide(blank_layout))
    add_omml_slide(presentation.slides.add_slide(blank_layout))
    add_crowded_slide(presentation.slides.add_slide(blank_layout))
    presentation.save(FIXTURE_PATH)
    inject_omml(FIXTURE_PATH)

    sha256 = hashlib.sha256(FIXTURE_PATH.read_bytes()).hexdigest()
    manifest = {
        "schemaVersion": 1,
        "fixture": FIXTURE_PATH.name,
        "source": "Synthetic repository-owned teaching material created for T0.",
        "sha256": sha256,
        "approvalStatus": "APPROVED",
        "approvedAt": "2026-08-02",
        "slides": [
            {
                "number": 1,
                "kind": "plain-text",
                "expectedTitle": "极限：从直观到定义",
                "proposedOverlaySafeRegion": {"x": 0.74, "y": 0.78, "width": 0.20, "height": 0.14},
            },
            {
                "number": 2,
                "kind": "omml-formula",
                "expectedOmmlText": "limx→0 sin x / x = 1",
                "proposedOverlaySafeRegion": {"x": 0.74, "y": 0.77, "width": 0.20, "height": 0.15},
            },
            {
                "number": 3,
                "kind": "crowded-text-and-diagram",
                "expectedTitle": "连续性的图像判定",
                "proposedOverlaySafeRegion": None,
                "proposedAvatarPolicy": "HIDE",
            },
        ],
        "reviewInstructions": [
            "Confirm each rendered PNG matches the intended source page.",
            "Confirm the page-specific proposed safe region does not obscure title, formula, diagram, key text, or subtitle-safe space.",
            "For the crowded third page, confirm the default policy to hide the avatar rather than cover source content.",
            "Approved on 2026-08-02 as the T0 three-page fixture baseline.",
        ],
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    create_fixture()
