from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend import prepare


class RenderSelectionTests(unittest.TestCase):
    def test_prefers_unattended_libreoffice_before_powerpoint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_value:
            output_dir = Path(temp_value) / "slides"
            with (
                mock.patch.object(
                    prepare, "render_with_libreoffice", return_value="libreoffice"
                ) as libreoffice,
                mock.patch.object(prepare, "render_with_powerpoint") as powerpoint,
            ):
                renderer, error = prepare.render_slides(
                    Path(temp_value) / "fixture.pptx", output_dir
                )

        self.assertEqual(renderer, "libreoffice")
        self.assertIsNone(error)
        libreoffice.assert_called_once()
        powerpoint.assert_not_called()

    def test_uses_powerpoint_only_after_libreoffice_fails_on_windows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_value:
            output_dir = Path(temp_value) / "slides"
            with (
                mock.patch.object(
                    prepare,
                    "render_with_libreoffice",
                    side_effect=RuntimeError("LibreOffice is required"),
                ),
                mock.patch.object(
                    prepare, "render_with_powerpoint", return_value="powerpoint"
                ) as powerpoint,
                mock.patch.object(prepare.sys, "platform", "win32"),
            ):
                renderer, error = prepare.render_slides(
                    Path(temp_value) / "fixture.pptx", output_dir
                )

        self.assertEqual(renderer, "powerpoint")
        self.assertIsNone(error)
        powerpoint.assert_called_once()


if __name__ == "__main__":
    unittest.main()
