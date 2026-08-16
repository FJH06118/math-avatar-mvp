"""Create synthetic PPTX files for stage 11B page-count coverage tests."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Inches, Pt


def create_fixture(output: Path, slide_count: int) -> None:
    if not 1 <= slide_count <= 100:
        raise ValueError("slide_count must be between 1 and 100")
    output.parent.mkdir(parents=True, exist_ok=True)
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    formula_image = output.with_suffix(".formula.png")
    image = Image.new("RGB", (640, 180), "white")
    ImageDraw.Draw(image).text((24, 68), "f'(x) = lim h->0 [f(x+h)-f(x)]/h", fill="black")
    image.save(formula_image)
    try:
        for index in range(1, slide_count + 1):
            slide = presentation.slides.add_slide(presentation.slide_layouts[6])
            title = slide.shapes.add_textbox(Inches(0.7), Inches(0.45), Inches(11.8), Inches(0.7))
            run = title.text_frame.paragraphs[0].add_run()
            run.text = f"覆盖测试第 {index} 页"
            run.font.name = "Microsoft YaHei"
            run.font.size = Pt(28)
            body = slide.shapes.add_textbox(Inches(0.9), Inches(1.7), Inches(11.2), Inches(2.0))
            body.text_frame.text = f"稳定页码 {index}/{slide_count}。公式候选：f(x)=x^{index % 5 + 1}。"
            if index == min(2, slide_count):
                slide.shapes.add_picture(str(formula_image), Inches(2.2), Inches(4.2), width=Inches(7.2))
        presentation.save(output)
    finally:
        formula_image.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--slides", type=int, required=True)
    args = parser.parse_args()
    create_fixture(Path(args.output).resolve(), args.slides)


if __name__ == "__main__":
    main()
