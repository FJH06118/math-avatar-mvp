from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image
from pptx import Presentation

from backend.prepare import (
    PrepareError,
    extract_deck,
    save_slide_on_canvas,
    spoken_formula_hint,
)


class PrepareTests(unittest.TestCase):
    def test_spoken_formula_hint_expands_common_calculus_symbols(self) -> None:
        spoken = spoken_formula_hint("lim x→x₀, Δy/Δx=|x|")
        self.assertIn("极限", spoken)
        self.assertIn("埃克斯趋于埃克斯零", spoken)
        self.assertIn("德尔塔歪除以德尔塔埃克斯", spoken)
        self.assertIn("埃克斯的绝对值", spoken)
        self.assertEqual(spoken_formula_hint("f\uf0a2(0)"), "函数 f撇(0)")

    def test_empty_presentation_has_an_actionable_stable_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_value:
            source = Path(temp_value) / "空课件.pptx"
            Presentation().save(source)

            with self.assertRaises(PrepareError) as raised:
                extract_deck(source)

        self.assertEqual(raised.exception.code, "PPTX_NO_SLIDES")
        self.assertFalse(raised.exception.retryable)
        self.assertIn("至少添加一页", raised.exception.public_message)

    def test_standard_and_portrait_pages_are_contained_on_a_1080p_canvas(self) -> None:
        with tempfile.TemporaryDirectory() as temp_value:
            for name, size in (("standard", (800, 600)), ("portrait", (600, 800))):
                output = Path(temp_value) / f"{name}.png"
                source = Image.new("RGB", size, (180, 20, 20))
                try:
                    save_slide_on_canvas(source, output)
                finally:
                    source.close()

                with Image.open(output) as rendered:
                    self.assertEqual(rendered.size, (1920, 1080))
                    self.assertEqual(rendered.getpixel((960, 540)), (180, 20, 20))
                    self.assertEqual(rendered.getpixel((0, 540)), (255, 255, 255))


if __name__ == "__main__":
    unittest.main()
