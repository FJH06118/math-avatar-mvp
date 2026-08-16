from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.env import load_local_env, parse_env_value


class LocalEnvTests(unittest.TestCase):
    def test_loads_values_without_overriding_process_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            env_path.write_text(
                "LOCAL_ENV_NEW='loaded'\nLOCAL_ENV_EXISTING=from-file\n",
                encoding="utf-8",
            )
            with patch.dict(
                os.environ,
                {"LOCAL_ENV_EXISTING": "from-process"},
                clear=False,
            ):
                os.environ.pop("LOCAL_ENV_NEW", None)
                load_local_env(env_path)
                self.assertEqual(os.environ["LOCAL_ENV_NEW"], "loaded")
                self.assertEqual(os.environ["LOCAL_ENV_EXISTING"], "from-process")

    def test_rejects_invalid_entry(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            env_path = Path(temporary_directory) / ".env"
            env_path.write_text("not an environment entry\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                load_local_env(env_path)

    def test_parses_quoted_and_unquoted_values(self) -> None:
        self.assertEqual(parse_env_value(" plain "), "plain")
        self.assertEqual(parse_env_value('"quoted"'), "quoted")
