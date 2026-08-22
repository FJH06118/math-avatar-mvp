from __future__ import annotations

import argparse
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend import prepare
from backend.powerpoint_animation_runner import IsolatedAnimationResult


def deck_fixture() -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "sourceFile": "source.pptx",
        "courseTitle": "中文动画课件",
        "slideCount": 1,
        "parsedAt": "2026-08-22T00:00:00+00:00",
        "slides": [{
            "index": 1,
            "title": "第一页",
            "type": "concept",
            "textBlocks": [],
            "extractedText": "逐步揭示答案",
            "notes": "",
            "formulas": [],
            "warnings": [],
            "thumbnail": "slides/slide-001.png",
        }],
    }


def args_for(source: Path, job_dir: Path) -> argparse.Namespace:
    return argparse.Namespace(
        input=str(source),
        job_dir=str(job_dir),
        audience="大学一年级学生",
        style="严谨",
        target_minutes=3,
        planner="rules",
        auto_approve=False,
        skip_slide_render=False,
    )


class PrepareAnimationIntegrationTests(unittest.TestCase):
    def test_animation_failure_keeps_successful_libreoffice_static_parse(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "中文课件.pptx"
            source.write_bytes(b"fixture")
            job_dir = root / "job"
            unavailable = IsolatedAnimationResult(
                manifest=None,
                warning_code="POWERPOINT_NOT_INSTALLED",
                warning_message="未安装 Microsoft PowerPoint；静态原页仍可继续处理。",
            )
            with (
                mock.patch.object(prepare, "parse_args", return_value=args_for(source, job_dir)),
                mock.patch.object(prepare, "extract_animation_manifest_isolated", return_value=unavailable),
                mock.patch.object(prepare, "extract_deck", return_value=deck_fixture()),
                mock.patch.object(prepare, "render_slides", return_value=("libreoffice", None)),
            ):
                self.assertEqual(prepare.main(), 0)
            parsed = json.loads((job_dir / "parsed-deck.json").read_text(encoding="utf-8"))
            self.assertEqual(parsed["slideRenderer"], "libreoffice")
            self.assertEqual(parsed["animationManifest"]["metadataSource"], "STATIC_FALLBACK")
            self.assertEqual(parsed["animationManifest"]["warnings"][0]["code"], "POWERPOINT_NOT_INSTALLED")
            self.assertIn("[动画:POWERPOINT_NOT_INSTALLED]", parsed["slides"][0]["warnings"][0])

    def test_legacy_ppt_animation_is_read_before_conversion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "旧版中文动画.ppt"
            source.write_bytes(b"legacy")
            job_dir = root / "job"
            calls: list[str] = []

            def extract_animation(path: Path, _work: Path) -> IsolatedAnimationResult:
                self.assertEqual(path, source.resolve())
                calls.append("animation")
                return IsolatedAnimationResult(
                    manifest=None,
                    warning_code="POWERPOINT_COM_UNAVAILABLE",
                    warning_message="测试降级。",
                )

            def convert(_source: Path, output: Path) -> None:
                calls.append("convert")
                output.write_bytes(b"converted")

            with (
                mock.patch.object(prepare, "parse_args", return_value=args_for(source, job_dir)),
                mock.patch.object(prepare, "extract_animation_manifest_isolated", side_effect=extract_animation),
                mock.patch.object(prepare, "convert_legacy_ppt", side_effect=convert),
                mock.patch.object(prepare, "extract_deck", return_value=deck_fixture()),
                mock.patch.object(prepare, "render_slides", return_value=("libreoffice", None)),
            ):
                self.assertEqual(prepare.main(), 0)
            self.assertEqual(calls, ["animation", "convert"])


if __name__ == "__main__":
    unittest.main()
