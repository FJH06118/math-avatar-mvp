from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend.animation_contract import make_static_fallback_manifest
from backend.powerpoint_animation_runner import (
    IsolatedAnimationResult,
    extract_animation_manifest_isolated,
    finalize_animation_manifest,
)


class TimeoutProcess:
    pid = 3210
    returncode = None

    def communicate(self, timeout: float) -> tuple[bytes, bytes]:
        raise subprocess.TimeoutExpired(["adapter"], timeout)

    def poll(self) -> None:
        return None


class CancelledProcess(TimeoutProcess):
    def communicate(self, timeout: float) -> tuple[bytes, bytes]:
        raise KeyboardInterrupt()


class PowerPointAnimationRunnerTests(unittest.TestCase):
    def test_non_windows_is_an_explicit_libreoffice_static_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "中文静态课件.pptx"
            source.write_bytes(b"static")
            with mock.patch("backend.powerpoint_animation_runner.sys.platform", "linux"):
                result = extract_animation_manifest_isolated(source, Path(directory) / "animation")
            manifest = finalize_animation_manifest(result, source, 2)
            self.assertEqual(manifest["metadataSource"], "STATIC_FALLBACK")
            self.assertEqual(manifest["slideCount"], 2)
            self.assertEqual(manifest["warnings"][0]["code"], "ANIMATION_METADATA_UNAVAILABLE")
            self.assertIn("LibreOffice/PDF", manifest["warnings"][0]["message"])

    def test_timeout_terminates_adapter_and_requests_exact_powerpoint_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "timeout.pptx"
            source.write_bytes(b"timeout")
            process = TimeoutProcess()
            with (
                mock.patch("backend.powerpoint_animation_runner.sys.platform", "win32"),
                mock.patch("backend.powerpoint_animation_runner.subprocess.Popen", return_value=process),
                mock.patch("backend.powerpoint_animation_runner._terminate_adapter_process_tree") as terminate,
                mock.patch("backend.powerpoint_animation_runner.cleanup_powerpoint_from_state") as cleanup,
            ):
                result = extract_animation_manifest_isolated(
                    source,
                    Path(directory) / "animation",
                    timeout_seconds=5,
                )
            self.assertEqual(result.warning_code, "POWERPOINT_ANIMATION_TIMEOUT")
            terminate.assert_called_once_with(process)
            cleanup.assert_called_once()

    def test_cancellation_terminates_adapter_and_requests_powerpoint_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "cancel.pptx"
            source.write_bytes(b"cancel")
            process = CancelledProcess()
            with (
                mock.patch("backend.powerpoint_animation_runner.sys.platform", "win32"),
                mock.patch("backend.powerpoint_animation_runner.subprocess.Popen", return_value=process),
                mock.patch("backend.powerpoint_animation_runner._terminate_adapter_process_tree") as terminate,
                mock.patch("backend.powerpoint_animation_runner.cleanup_powerpoint_from_state") as cleanup,
            ):
                with self.assertRaises(KeyboardInterrupt):
                    extract_animation_manifest_isolated(
                        source,
                        Path(directory) / "animation",
                        timeout_seconds=5,
                    )
            terminate.assert_called_once_with(process)
            cleanup.assert_called_once()

    def test_manifest_count_mismatch_never_claims_animation_was_identified(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "mismatch.pptx"
            source.write_bytes(b"mismatch")
            import hashlib

            source_sha = hashlib.sha256(b"mismatch").hexdigest()
            one_slide = make_static_fallback_manifest(source_sha, 1)
            one_slide["metadataSource"] = "POWERPOINT_COM"
            one_slide["parserVersion"] = "powerpoint-com-animation-v1"
            one_slide["supportAssessment"] = {
                "levels": ["METADATA_SUPPORTED"],
                "summary": "测试元数据。",
            }
            one_slide["slides"][0]["supportAssessment"] = {
                "levels": ["METADATA_SUPPORTED"],
                "summary": "测试页面元数据。",
            }
            result = IsolatedAnimationResult(manifest=one_slide)
            manifest = finalize_animation_manifest(result, source, 2)
            self.assertEqual(manifest["metadataSource"], "STATIC_FALLBACK")
            self.assertEqual(manifest["warnings"][0]["code"], "ANIMATION_METADATA_SLIDE_COUNT_MISMATCH")


if __name__ == "__main__":
    unittest.main()
