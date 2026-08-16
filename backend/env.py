from __future__ import annotations

import os
import re
from pathlib import Path


ENVIRONMENT_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def parse_env_value(raw_value: str) -> str:
    value = raw_value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_local_env(path: Path | None = None) -> None:
    """Load a local .env without overriding explicit process environment values."""

    env_path = path or Path(__file__).with_name(".env")
    if not env_path.is_file():
        return

    for line_number, raw_line in enumerate(
        env_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        name, separator, raw_value = line.partition("=")
        if not separator or not ENVIRONMENT_NAME.fullmatch(name.strip()):
            raise ValueError(f"Invalid environment entry at {env_path}:{line_number}")
        os.environ.setdefault(name.strip(), parse_env_value(raw_value))
