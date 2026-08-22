from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from backend.powerpoint_animation_adapter import _running_powerpoint_process_ids
from backend.powerpoint_animation_runner import extract_animation_manifest_isolated


FIXTURE = Path(__file__).with_name("fixtures") / "动画识别-中文课件.pptx"
REAL_POWERPOINT_ENABLED = (
    sys.platform == "win32"
    and os.environ.get("PPT_DH_REAL_POWERPOINT_COM") == "1"
    and FIXTURE.exists()
)


@unittest.skipUnless(
    REAL_POWERPOINT_ENABLED,
    "opt-in only: requires Windows PowerPoint and PPT_DH_REAL_POWERPOINT_COM=1",
)
class RealPowerPointAnimationIntegrationTests(unittest.TestCase):
    def test_real_powerpoint_matches_fixture_timeline_and_cleans_up(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            animation_dir = Path(directory) / "animation"
            result = extract_animation_manifest_isolated(
                FIXTURE,
                animation_dir,
                expected_slide_count=2,
                timeout_seconds=120,
            )
            self.assertIsNotNone(result.manifest, result.warning_message)
            assert result.manifest is not None
            first = result.manifest["slides"][0]
            self.assertEqual([sequence["kind"] for sequence in first["sequences"]], ["MAIN", "INTERACTIVE"])
            effects = [item for sequence in first["sequences"] for item in sequence["effects"]]
            self.assertEqual([item["effectType"]["rawValue"] for item in effects], [1, 61, 10, 10])
            self.assertEqual([item["timing"]["trigger"]["type"]["rawValue"] for item in effects], [1, 2, 3, 4])
            self.assertEqual([item["timing"]["durationSeconds"] for item in effects], [0.5, 1.25, 0.75, 0.6])
            self.assertEqual([item["timing"]["triggerDelaySeconds"] for item in effects], [0.1, 0.2, 0.3, 0.15])
            self.assertEqual(effects[1]["timing"]["repeatCount"], 2.0)
            self.assertTrue(effects[1]["timing"]["autoReverse"])
            self.assertEqual([item["shape"]["name"] for item in effects], ["中文标题", "逐步推导", "逐步推导", "答案展示"])
            self.assertEqual(effects[3]["timing"]["trigger"]["shape"]["name"], "点击显示答案")
            self.assertEqual(first["transition"]["entryEffect"]["rawValue"], 1793)
            self.assertEqual(first["transition"]["durationSeconds"], 1.0)
            self.assertTrue(first["transition"]["advanceOnClick"])
            self.assertTrue(first["transition"]["advanceOnTime"])
            self.assertEqual(first["transition"]["advanceTimeSeconds"], 4.0)
            self.assertEqual(result.manifest["slides"][1]["effectCount"], 0)

            state = json.loads(
                (animation_dir / "powerpoint-process.json").read_text(encoding="utf-8")
            )
            self.assertEqual(state["status"], "CLOSED")
            self.assertIsInstance(state["powerPointProcessId"], int)
            self.assertNotIn(
                state["powerPointProcessId"],
                _running_powerpoint_process_ids(),
                "isolated PowerPoint process must not survive the COM test",
            )


if __name__ == "__main__":
    unittest.main()
