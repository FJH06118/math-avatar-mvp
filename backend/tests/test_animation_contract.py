from __future__ import annotations

import unittest

from backend.animation_contract import (
    AnimationContractError,
    make_static_fallback_manifest,
    validate_animation_manifest,
)


class AnimationContractTests(unittest.TestCase):
    def test_static_fallback_is_strict_and_contains_no_invented_facts(self) -> None:
        manifest = make_static_fallback_manifest("a" * 64, 2)
        self.assertEqual(manifest["metadataSource"], "STATIC_FALLBACK")
        self.assertEqual(manifest["supportAssessment"]["levels"], ["STATIC_FALLBACK"])
        self.assertEqual([slide["sequences"] for slide in manifest["slides"]], [[], []])
        self.assertTrue(all(slide["transition"] is None for slide in manifest["slides"]))

        invented = dict(manifest)
        invented["diskPath"] = r"C:\private\course.pptx"
        with self.assertRaises(AnimationContractError):
            validate_animation_manifest(invented)

    def test_source_and_slide_count_must_match_the_authoritative_parse(self) -> None:
        manifest = make_static_fallback_manifest("b" * 64, 1)
        with self.assertRaises(AnimationContractError):
            validate_animation_manifest(manifest, expected_source_sha256="c" * 64)
        with self.assertRaises(AnimationContractError):
            validate_animation_manifest(manifest, expected_slide_count=2)


if __name__ == "__main__":
    unittest.main()
