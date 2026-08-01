from __future__ import annotations

import unittest

from backend.contracts import ContractError, normalize_scene_payload


class SceneContractTests(unittest.TestCase):
    def test_normalizes_string_narration(self) -> None:
        payload = normalize_scene_payload(
            {
                "courseTitle": "测试课程",
                "scenes": [
                    {
                        "title": "定义",
                        "sourceSlides": [1],
                        "narration": ["第一句。"],
                    }
                ],
            },
            slide_count=2,
            default_title="默认标题",
        )
        self.assertEqual(
            payload["scenes"][0]["narration"][0]["spokenText"],
            "第一句。",
        )
        self.assertEqual(
            payload["scenes"][0]["slideImage"],
            "slides/slide-001.png",
        )

    def test_rejects_out_of_range_slide(self) -> None:
        with self.assertRaises(ContractError):
            normalize_scene_payload(
                {
                    "scenes": [
                        {
                            "title": "错误页码",
                            "sourceSlides": [3],
                            "narration": ["内容"],
                        }
                    ]
                },
                slide_count=2,
                default_title="测试",
            )

    def test_drops_punctuation_only_narration_and_private_use_bullet(
        self,
    ) -> None:
        payload = normalize_scene_payload(
            {
                "scenes": [
                    {
                        "title": "开集",
                        "sourceSlides": [1],
                        "narration": [
                            "。",
                            {
                                "displayText": "\uf0b7 若集合中的点都是内点。",
                                "spokenText": "\uf0b7 若集合中的点都是内点。",
                            },
                        ],
                    }
                ]
            },
            slide_count=1,
            default_title="集合",
        )
        self.assertEqual(len(payload["scenes"][0]["narration"]), 1)
        self.assertEqual(
            payload["scenes"][0]["narration"][0]["spokenText"],
            "若集合中的点都是内点。",
        )


if __name__ == "__main__":
    unittest.main()
