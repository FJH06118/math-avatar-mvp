from __future__ import annotations

import json
import unittest
from pathlib import Path

from backend.prepare import extract_deck


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
FIXTURE_PATH = FIXTURE_DIR / "tracer-3.pptx"
MANIFEST_PATH = FIXTURE_DIR / "tracer-3.fixture.json"


class TracerFixtureTests(unittest.TestCase):
    def test_three_page_fixture_has_required_content(self) -> None:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        deck = extract_deck(FIXTURE_PATH)

        self.assertEqual(deck["slideCount"], 3)
        self.assertEqual(deck["slides"][0]["title"], "极限：从直观到定义")
        self.assertEqual(deck["slides"][2]["title"], "连续性的图像判定")
        self.assertGreaterEqual(len(deck["slides"][2]["textBlocks"]), 10)

        formula_displays = [
            formula["display"] for formula in deck["slides"][1]["formulas"]
        ]
        self.assertIn("limx→0 sin x / x = 1", formula_displays)
        self.assertEqual(manifest["approvalStatus"], "APPROVED")
        self.assertEqual(manifest["approvedAt"], "2026-08-02")
        self.assertEqual(
            manifest["slides"][0]["proposedOverlaySafeRegion"],
            {"x": 0.74, "y": 0.78, "width": 0.2, "height": 0.14},
        )
        self.assertEqual(
            manifest["slides"][1]["proposedOverlaySafeRegion"],
            {"x": 0.74, "y": 0.77, "width": 0.2, "height": 0.15},
        )
        self.assertIsNone(manifest["slides"][2]["proposedOverlaySafeRegion"])
        self.assertEqual(manifest["slides"][2]["proposedAvatarPolicy"], "HIDE")
        self.assertEqual(
            [slide["kind"] for slide in manifest["slides"]],
            ["plain-text", "omml-formula", "crowded-text-and-diagram"],
        )


if __name__ == "__main__":
    unittest.main()
