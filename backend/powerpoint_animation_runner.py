from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.animation_contract import (
    AnimationContractError,
    WARNING_CODES,
    make_static_fallback_manifest,
    validate_animation_manifest,
)
from backend.powerpoint_animation_adapter import (
    ANIMATION_ERROR_PREFIX,
    cleanup_powerpoint_from_state,
)


DEFAULT_TIMEOUT_SECONDS = 120.0
MIN_TIMEOUT_SECONDS = 5.0
MAX_TIMEOUT_SECONDS = 300.0
MAX_ADAPTER_STDERR = 64 * 1024


@dataclass(frozen=True)
class IsolatedAnimationResult:
    manifest: dict[str, Any] | None
    warning_code: str | None = None
    warning_message: str | None = None


def extract_animation_manifest_isolated(
    input_path: Path,
    work_dir: Path,
    *,
    expected_slide_count: int | None = None,
    timeout_seconds: float | None = None,
) -> IsolatedAnimationResult:
    """Run COM extraction in a separate process and return only strict, public-safe data."""

    source_sha256 = sha256_file(input_path)
    if sys.platform != "win32":
        return _failure(
            "ANIMATION_METADATA_UNAVAILABLE",
            "当前环境只能使用静态课件解析；LibreOffice/PDF 不保留 PowerPoint 动画时间轴。",
        )

    try:
        work_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return _failure(
            "POWERPOINT_ANIMATION_EXTRACTION_FAILED",
            "动画读取临时目录不可用；静态原页仍可继续处理。",
        )
    output_path = work_dir / "animation-manifest.json"
    state_path = work_dir / "powerpoint-process.json"
    try:
        output_path.unlink(missing_ok=True)
        state_path.unlink(missing_ok=True)
    except OSError:
        return _failure(
            "POWERPOINT_ANIMATION_EXTRACTION_FAILED",
            "动画读取临时状态无法初始化；静态原页仍可继续处理。",
        )
    timeout = _timeout_seconds(timeout_seconds)
    command = [
        sys.executable,
        "-m",
        "backend.powerpoint_animation_adapter",
        "--input",
        str(input_path),
        "--output",
        str(output_path),
        "--state",
        str(state_path),
    ]
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(
        subprocess, "CREATE_NEW_PROCESS_GROUP", 0
    )
    process: subprocess.Popen[bytes] | None = None
    try:
        process = subprocess.Popen(
            command,
            cwd=Path(__file__).resolve().parents[1],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            creationflags=creation_flags,
        )
        try:
            _stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            _terminate_adapter_process_tree(process)
            cleanup_powerpoint_from_state(state_path)
            return _failure(
                "POWERPOINT_ANIMATION_TIMEOUT",
                f"PowerPoint 动画读取超过 {int(timeout)} 秒，已终止隔离进程；静态原页仍可继续处理。",
            )
        if process.returncode != 0:
            cleanup_powerpoint_from_state(state_path)
            error = _parse_adapter_error(stderr[-MAX_ADAPTER_STDERR:])
            return error or _failure(
                "POWERPOINT_ANIMATION_EXTRACTION_FAILED",
                "PowerPoint 动画读取组件异常退出；静态原页仍可继续处理，请人工审核动画。",
            )
        cleanup_powerpoint_from_state(state_path)
        try:
            if output_path.stat().st_size > 32 * 1024 * 1024:
                raise AnimationContractError("animation manifest exceeded size limit")
            raw: Any = json.loads(output_path.read_text(encoding="utf-8"))
            manifest = validate_animation_manifest(
                raw,
                expected_source_sha256=source_sha256,
                expected_slide_count=expected_slide_count,
            )
        except (OSError, ValueError, TypeError, json.JSONDecodeError, AnimationContractError):
            return _failure(
                "POWERPOINT_ANIMATION_INVALID",
                "PowerPoint 动画结果未通过严格契约；静态原页仍可继续处理，请人工审核动画。",
            )
        return IsolatedAnimationResult(manifest=manifest)
    except OSError:
        if process is not None:
            _terminate_adapter_process_tree(process)
        cleanup_powerpoint_from_state(state_path)
        return _failure(
            "POWERPOINT_COM_UNAVAILABLE",
            "PowerPoint COM 动画读取组件不可用；静态原页仍可继续处理。",
        )
    except BaseException:
        if process is not None:
            _terminate_adapter_process_tree(process)
        cleanup_powerpoint_from_state(state_path)
        raise


def finalize_animation_manifest(
    result: IsolatedAnimationResult,
    input_path: Path,
    slide_count: int,
) -> dict[str, Any]:
    source_sha256 = sha256_file(input_path)
    if result.manifest is not None:
        try:
            return validate_animation_manifest(
                result.manifest,
                expected_source_sha256=source_sha256,
                expected_slide_count=slide_count,
            )
        except AnimationContractError:
            return make_static_fallback_manifest(
                source_sha256,
                slide_count,
                warning_code="ANIMATION_METADATA_SLIDE_COUNT_MISMATCH",
                warning_message="PowerPoint 动画清单页数与静态解析页数不一致；已停止声明动画识别并等待人工审核。",
            )
    return make_static_fallback_manifest(
        source_sha256,
        slide_count,
        warning_code=result.warning_code or "ANIMATION_METADATA_UNAVAILABLE",
        warning_message=result.warning_message
        or "当前环境无法读取 PowerPoint 动画元数据；课件仍按静态原页处理，请人工确认动画语义已丢失。",
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _timeout_seconds(explicit: float | None) -> float:
    if explicit is not None:
        raw = explicit
    else:
        try:
            raw = float(os.environ.get("PPT_DH_POWERPOINT_ANIMATION_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS))
        except ValueError:
            raw = DEFAULT_TIMEOUT_SECONDS
    if raw != raw or raw in {float("inf"), float("-inf")}:
        raw = DEFAULT_TIMEOUT_SECONDS
    return min(MAX_TIMEOUT_SECONDS, max(MIN_TIMEOUT_SECONDS, raw))


def _parse_adapter_error(stderr: bytes) -> IsolatedAnimationResult | None:
    text = stderr.decode("utf-8", errors="replace")
    encoded: str | None = None
    for line in reversed(text.splitlines()):
        candidate = line.strip()
        if candidate.startswith(ANIMATION_ERROR_PREFIX):
            encoded = candidate[len(ANIMATION_ERROR_PREFIX) :]
            break
    if encoded is None:
        return None
    try:
        value: Any = json.loads(encoded)
        if (
            not isinstance(value, dict)
            or set(value) != {"code", "message", "retryable"}
            or value["code"] not in WARNING_CODES
            or not isinstance(value["message"], str)
            or not 1 <= len(value["message"]) <= 500
            or not isinstance(value["retryable"], bool)
        ):
            return None
        return _failure(value["code"], value["message"])
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def _failure(code: str, message: str) -> IsolatedAnimationResult:
    return IsolatedAnimationResult(manifest=None, warning_code=code, warning_message=message)


def _terminate_adapter_process_tree(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        try:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except (OSError, subprocess.TimeoutExpired):
            pass
    else:
        process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
