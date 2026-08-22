from __future__ import annotations

import hashlib
import math
import re
from datetime import datetime, timezone
from typing import Any, Iterable


SCHEMA_VERSION = "animation-manifest-v1"
COM_PARSER_VERSION = "powerpoint-com-animation-v1"
STATIC_PARSER_VERSION = "static-animation-fallback-v1"
STABLE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")
SUPPORT_LEVELS = {
    "METADATA_SUPPORTED",
    "REBUILD_WHITELIST",
    "PRESERVE_NATIVE_RECOMMENDED",
    "UNSUPPORTED_REQUIRES_REVIEW",
    "STATIC_FALLBACK",
}
WARNING_CODES = {
    "ANIMATION_METADATA_UNAVAILABLE",
    "ANIMATION_METADATA_SLIDE_COUNT_MISMATCH",
    "POWERPOINT_NOT_INSTALLED",
    "POWERPOINT_COM_UNAVAILABLE",
    "POWERPOINT_SECURITY_CONFIGURATION_FAILED",
    "POWERPOINT_FILE_OPEN_FAILED",
    "POWERPOINT_ANIMATION_TIMEOUT",
    "POWERPOINT_ANIMATION_CANCELLED",
    "POWERPOINT_ANIMATION_INVALID",
    "POWERPOINT_ANIMATION_EXTRACTION_FAILED",
    "ANIMATION_STRUCTURE_PARTIAL",
    "UNKNOWN_ANIMATION_EFFECT",
    "CUSTOM_ANIMATION",
    "MORPH_TRANSITION",
    "COMPLEX_MOTION_PATH",
    "MEDIA_TRIGGER_OR_EFFECT",
    "INTERACTIVE_TRIGGER_REQUIRES_REVIEW",
    "UNKNOWN_TRIGGER",
    "UNKNOWN_TRANSITION",
    "REPEAT_OR_AUTO_REVERSE_REQUIRES_REVIEW",
    "NATIVE_PLAYBACK_RECOMMENDED",
}


class AnimationContractError(ValueError):
    """Raised when isolated animation JSON fails the strict shared shape."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def stable_id(prefix: str, *parts: object) -> str:
    digest = hashlib.sha256("\x1f".join(str(part) for part in parts).encode("utf-8")).hexdigest()
    return f"{prefix}_{digest}"


def warning(
    code: str,
    message: str,
    *,
    effect_id: str | None = None,
    raw_value: int | None = None,
) -> dict[str, Any]:
    value: dict[str, Any] = {"code": code, "message": message}
    if effect_id is not None:
        value["effectId"] = effect_id
    if raw_value is not None:
        value["rawValue"] = raw_value
    return value


def assessment(levels: Iterable[str], summary: str) -> dict[str, Any]:
    return {"levels": list(dict.fromkeys(levels)), "summary": summary}


def make_static_fallback_manifest(
    source_file_sha256: str,
    slide_count: int,
    *,
    warning_code: str = "ANIMATION_METADATA_UNAVAILABLE",
    warning_message: str = "当前环境无法读取 PowerPoint 动画元数据；课件仍按静态原页处理，请人工确认动画语义已丢失。",
    extracted_at: str | None = None,
) -> dict[str, Any]:
    manifest_id = stable_id("animation_manifest", source_file_sha256, SCHEMA_VERSION)
    root_warning = warning(warning_code, warning_message)
    slides = [
        {
            "id": stable_id("slide_animation", source_file_sha256, slide_number),
            "slideNumber": slide_number,
            "sequences": [],
            "transition": None,
            "effectCount": 0,
            "supportAssessment": assessment(
                ["STATIC_FALLBACK"],
                "该页没有可用的权威动画元数据，只能保留静态原页并人工审核。",
            ),
            "warnings": [root_warning],
        }
        for slide_number in range(1, slide_count + 1)
    ]
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "id": manifest_id,
        "metadataSource": "STATIC_FALLBACK",
        "parserVersion": STATIC_PARSER_VERSION,
        "sourceFileSha256": source_file_sha256,
        "extractedAt": extracted_at or utc_now(),
        "slideCount": slide_count,
        "slides": slides,
        "supportAssessment": assessment(
            ["STATIC_FALLBACK"],
            "当前演示文稿只能静态处理，不能声明动画已经识别。",
        ),
        "warnings": [root_warning],
    }
    return validate_animation_manifest(
        manifest,
        expected_source_sha256=source_file_sha256,
        expected_slide_count=slide_count,
    )


def validate_animation_manifest(
    raw: Any,
    *,
    expected_source_sha256: str | None = None,
    expected_slide_count: int | None = None,
) -> dict[str, Any]:
    manifest = _object(
        raw,
        {
            "schemaVersion",
            "id",
            "metadataSource",
            "parserVersion",
            "sourceFileSha256",
            "extractedAt",
            "slideCount",
            "slides",
            "supportAssessment",
            "warnings",
        },
        "manifest",
    )
    _literal(manifest["schemaVersion"], SCHEMA_VERSION, "manifest.schemaVersion")
    _stable_id(manifest["id"], "manifest.id")
    _enum(manifest["metadataSource"], {"POWERPOINT_COM", "STATIC_FALLBACK"}, "manifest.metadataSource")
    _string(manifest["parserVersion"], 1, 100, "manifest.parserVersion")
    _sha256(manifest["sourceFileSha256"], "manifest.sourceFileSha256")
    _iso_date(manifest["extractedAt"], "manifest.extractedAt")
    slide_count = _integer(manifest["slideCount"], 1, 100, "manifest.slideCount")
    if expected_source_sha256 is not None and manifest["sourceFileSha256"] != expected_source_sha256:
        raise AnimationContractError("manifest source fingerprint mismatch")
    if expected_slide_count is not None and slide_count != expected_slide_count:
        raise AnimationContractError("manifest slide count mismatch")
    slides = _array(manifest["slides"], 1, 100, "manifest.slides")
    if len(slides) != slide_count:
        raise AnimationContractError("manifest slide array mismatch")
    slide_ids: set[str] = set()
    for index, slide in enumerate(slides, 1):
        _validate_slide(slide, index, manifest["metadataSource"], slide_ids)
    _validate_assessment(manifest["supportAssessment"], "manifest.supportAssessment")
    _validate_warnings(manifest["warnings"], "manifest.warnings", 500)
    fallback = manifest["metadataSource"] == "STATIC_FALLBACK"
    levels = manifest["supportAssessment"]["levels"]
    if fallback != (levels == ["STATIC_FALLBACK"]):
        raise AnimationContractError("manifest source and support assessment mismatch")
    return manifest


def _validate_slide(raw: Any, expected_number: int, source: str, seen_ids: set[str]) -> None:
    slide = _object(
        raw,
        {"id", "slideNumber", "sequences", "transition", "effectCount", "supportAssessment", "warnings"},
        f"slides[{expected_number - 1}]",
    )
    slide_id = _stable_id(slide["id"], f"slides[{expected_number - 1}].id")
    if slide_id in seen_ids:
        raise AnimationContractError("duplicate animation slide id")
    seen_ids.add(slide_id)
    if _integer(slide["slideNumber"], 1, 100, "slide.slideNumber") != expected_number:
        raise AnimationContractError("animation slides must use continuous order")
    sequences = _array(slide["sequences"], 0, 1_001, "slide.sequences")
    sequence_ids: set[str] = set()
    effect_count = 0
    for sequence_index, sequence in enumerate(sequences):
        effect_count += _validate_sequence(sequence, sequence_index, sequence_ids)
    main_sequences = [sequence for sequence in sequences if sequence["kind"] == "MAIN"]
    if len(main_sequences) > 1 or (
        main_sequences
        and (main_sequences[0]["index"] != 1 or sequences[0]["kind"] != "MAIN")
    ):
        raise AnimationContractError("main animation sequence must be unique and ordered first")
    interactive_sequences = [sequence for sequence in sequences if sequence["kind"] == "INTERACTIVE"]
    if any(sequence["index"] != index for index, sequence in enumerate(interactive_sequences, 1)):
        raise AnimationContractError("interactive animation sequence indexes must be continuous")
    all_effect_ids = [
        effect["id"]
        for sequence in sequences
        for effect in sequence["effects"]
    ]
    if len(all_effect_ids) != len(set(all_effect_ids)):
        raise AnimationContractError("duplicate animation effect id on slide")
    if slide["transition"] is not None:
        _validate_transition(slide["transition"])
    if source == "STATIC_FALLBACK" and (sequences or slide["transition"] is not None):
        raise AnimationContractError("static fallback cannot contain invented animation facts")
    if _integer(slide["effectCount"], 0, 20_000, "slide.effectCount") != effect_count:
        raise AnimationContractError("slide effect count mismatch")
    _validate_assessment(slide["supportAssessment"], "slide.supportAssessment")
    _validate_warnings(slide["warnings"], "slide.warnings", 200)


def _validate_sequence(raw: Any, position: int, seen_ids: set[str]) -> int:
    sequence = _object(
        raw,
        {"id", "kind", "index", "effects", "supportAssessment", "warnings"},
        "sequence",
    )
    sequence_id = _stable_id(sequence["id"], "sequence.id")
    if sequence_id in seen_ids:
        raise AnimationContractError("duplicate animation sequence id")
    seen_ids.add(sequence_id)
    _enum(sequence["kind"], {"MAIN", "INTERACTIVE"}, "sequence.kind")
    _integer(sequence["index"], 1, 1_001, "sequence.index")
    effects = _array(sequence["effects"], 0, 2_000, "sequence.effects")
    effect_ids: set[str] = set()
    for order, effect in enumerate(effects, 1):
        _validate_effect(effect, order, effect_ids)
    _validate_assessment(sequence["supportAssessment"], "sequence.supportAssessment")
    _validate_warnings(sequence["warnings"], "sequence.warnings", 100)
    return len(effects)


def _validate_effect(raw: Any, expected_order: int, seen_ids: set[str]) -> None:
    effect = _object(
        raw,
        {
            "id",
            "index",
            "order",
            "effectType",
            "category",
            "exit",
            "exitRawValue",
            "shape",
            "paragraph",
            "textRangeStart",
            "textRangeLength",
            "timing",
            "supportAssessment",
            "warnings",
        },
        "effect",
    )
    effect_id = _stable_id(effect["id"], "effect.id")
    if effect_id in seen_ids:
        raise AnimationContractError("duplicate animation effect id")
    seen_ids.add(effect_id)
    if effect["index"] is not None:
        _integer(effect["index"], 1, 100_000, "effect.index")
    if _integer(effect["order"], 1, 100_000, "effect.order") != expected_order:
        raise AnimationContractError("effect order must be continuous")
    _validate_raw_enum(effect["effectType"], "effect.effectType")
    _enum(
        effect["category"],
        {"ENTRANCE", "EMPHASIS", "EXIT", "MOTION_PATH", "MEDIA", "CUSTOM_OR_UNKNOWN"},
        "effect.category",
    )
    _nullable_boolean(effect["exit"], "effect.exit")
    _nullable_integer(effect["exitRawValue"], "effect.exitRawValue")
    if effect["shape"] is not None:
        _validate_shape(effect["shape"], "effect.shape")
    _nullable_integer(effect["paragraph"], "effect.paragraph")
    _nullable_integer(effect["textRangeStart"], "effect.textRangeStart")
    _nullable_integer(effect["textRangeLength"], "effect.textRangeLength")
    _validate_timing(effect["timing"])
    _validate_assessment(effect["supportAssessment"], "effect.supportAssessment")
    _validate_warnings(effect["warnings"], "effect.warnings", 20)


def _validate_timing(raw: Any) -> None:
    timing = _object(
        raw,
        {
            "trigger",
            "triggerDelaySeconds",
            "durationSeconds",
            "repeatCount",
            "repeatDurationSeconds",
            "autoReverse",
            "autoReverseRawValue",
        },
        "timing",
    )
    trigger = _object(timing["trigger"], {"type", "shape"}, "timing.trigger")
    _validate_raw_enum(trigger["type"], "timing.trigger.type")
    if trigger["shape"] is not None:
        _validate_shape(trigger["shape"], "timing.trigger.shape")
    for key in ("triggerDelaySeconds", "durationSeconds", "repeatCount", "repeatDurationSeconds"):
        _nullable_number(timing[key], f"timing.{key}")
    if timing["durationSeconds"] is not None and timing["durationSeconds"] < 0:
        raise AnimationContractError("animation duration cannot be negative")
    _nullable_boolean(timing["autoReverse"], "timing.autoReverse")
    _nullable_integer(timing["autoReverseRawValue"], "timing.autoReverseRawValue")


def _validate_transition(raw: Any) -> None:
    transition = _object(
        raw,
        {
            "entryEffect",
            "durationSeconds",
            "advanceOnClick",
            "advanceOnClickRawValue",
            "advanceOnTime",
            "advanceOnTimeRawValue",
            "advanceTimeSeconds",
            "morphDetected",
            "supportAssessment",
            "warnings",
        },
        "transition",
    )
    _validate_raw_enum(transition["entryEffect"], "transition.entryEffect")
    for key in ("durationSeconds", "advanceTimeSeconds"):
        _nullable_number(transition[key], f"transition.{key}")
        if transition[key] is not None and transition[key] < 0:
            raise AnimationContractError(f"transition {key} cannot be negative")
    _nullable_boolean(transition["advanceOnClick"], "transition.advanceOnClick")
    _nullable_integer(transition["advanceOnClickRawValue"], "transition.advanceOnClickRawValue")
    _nullable_boolean(transition["advanceOnTime"], "transition.advanceOnTime")
    _nullable_integer(transition["advanceOnTimeRawValue"], "transition.advanceOnTimeRawValue")
    if not isinstance(transition["morphDetected"], bool):
        raise AnimationContractError("transition.morphDetected must be boolean")
    _validate_assessment(transition["supportAssessment"], "transition.supportAssessment")
    _validate_warnings(transition["warnings"], "transition.warnings", 20)


def _validate_shape(raw: Any, path: str) -> None:
    shape = _object(raw, {"id", "sourceShapeId", "name", "shapeTypeRaw", "boundsPoints", "visibleBounds"}, path)
    _stable_id(shape["id"], f"{path}.id")
    if shape["sourceShapeId"] is not None:
        _integer(shape["sourceShapeId"], 1, 2_147_483_647, f"{path}.sourceShapeId")
    _string(shape["name"], 1, 500, f"{path}.name")
    _integer(shape["shapeTypeRaw"], -2_147_483_648, 2_147_483_647, f"{path}.shapeTypeRaw")
    bounds = _object(shape["boundsPoints"], {"left", "top", "width", "height"}, f"{path}.boundsPoints")
    for key in ("left", "top", "width", "height"):
        _number(bounds[key], f"{path}.boundsPoints.{key}")
    if bounds["width"] < 0 or bounds["height"] < 0:
        raise AnimationContractError("shape dimensions cannot be negative")
    if shape["visibleBounds"] is not None:
        visible = _object(shape["visibleBounds"], {"x", "y", "width", "height"}, f"{path}.visibleBounds")
        for key in ("x", "y", "width", "height"):
            value = _number(visible[key], f"{path}.visibleBounds.{key}")
            if value < 0 or value > 1:
                raise AnimationContractError("visible bounds must be normalized")


def _validate_raw_enum(raw: Any, path: str) -> None:
    value = _object(raw, {"rawValue", "name", "known"}, path)
    if value["rawValue"] is not None:
        _integer(value["rawValue"], -2_147_483_648, 2_147_483_647, f"{path}.rawValue")
    _string(value["name"], 1, 120, f"{path}.name")
    if not isinstance(value["known"], bool):
        raise AnimationContractError(f"{path}.known must be boolean")


def _validate_assessment(raw: Any, path: str) -> None:
    value = _object(raw, {"levels", "summary"}, path)
    levels = _array(value["levels"], 1, 5, f"{path}.levels")
    if any(level not in SUPPORT_LEVELS for level in levels):
        raise AnimationContractError(f"{path}.levels contains an unsupported value")
    if len(set(levels)) != len(levels):
        raise AnimationContractError(f"{path}.levels contains duplicates")
    if "STATIC_FALLBACK" in levels and levels != ["STATIC_FALLBACK"]:
        raise AnimationContractError("STATIC_FALLBACK must be exclusive")
    if "STATIC_FALLBACK" not in levels and "METADATA_SUPPORTED" not in levels:
        raise AnimationContractError("metadata-supported assessments must include METADATA_SUPPORTED")
    _string(value["summary"], 1, 1_000, f"{path}.summary")


def _validate_warnings(raw: Any, path: str, maximum: int) -> None:
    values = _array(raw, 0, maximum, path)
    for index, item in enumerate(values):
        value = _object(item, {"code", "message"}, f"{path}[{index}]", optional={"effectId", "rawValue"})
        _enum(value["code"], WARNING_CODES, f"{path}[{index}].code")
        _string(value["message"], 1, 500, f"{path}[{index}].message")
        if "effectId" in value:
            _stable_id(value["effectId"], f"{path}[{index}].effectId")
        if "rawValue" in value:
            _integer(value["rawValue"], -2_147_483_648, 2_147_483_647, f"{path}[{index}].rawValue")


def _object(raw: Any, required: set[str], path: str, *, optional: set[str] | None = None) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise AnimationContractError(f"{path} must be an object")
    allowed = required | (optional or set())
    if set(raw) != required | (set(raw) & (optional or set())):
        missing = sorted(required - set(raw))
        unknown = sorted(set(raw) - allowed)
        raise AnimationContractError(f"{path} fields invalid; missing={missing}; unknown={unknown}")
    return raw


def _array(raw: Any, minimum: int, maximum: int, path: str) -> list[Any]:
    if not isinstance(raw, list) or len(raw) < minimum or len(raw) > maximum:
        raise AnimationContractError(f"{path} must contain {minimum}..{maximum} items")
    return raw


def _string(raw: Any, minimum: int, maximum: int, path: str) -> str:
    if not isinstance(raw, str) or len(raw) < minimum or len(raw) > maximum:
        raise AnimationContractError(f"{path} must be a bounded string")
    return raw


def _stable_id(raw: Any, path: str) -> str:
    value = _string(raw, 3, 128, path)
    if not STABLE_ID.fullmatch(value) or not re.search(r"[A-Za-z_-]", value):
        raise AnimationContractError(f"{path} is not a stable business id")
    return value


def _sha256(raw: Any, path: str) -> str:
    value = _string(raw, 64, 64, path)
    if not SHA256.fullmatch(value):
        raise AnimationContractError(f"{path} is not SHA-256")
    return value


def _integer(raw: Any, minimum: int, maximum: int, path: str) -> int:
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < minimum or raw > maximum:
        raise AnimationContractError(f"{path} must be an integer in range")
    return raw


def _nullable_integer(raw: Any, path: str) -> int | None:
    if raw is None:
        return None
    return _integer(raw, -2_147_483_648, 2_147_483_647, path)


def _number(raw: Any, path: str) -> float:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw):
        raise AnimationContractError(f"{path} must be a finite number")
    return float(raw)


def _nullable_number(raw: Any, path: str) -> float | None:
    if raw is None:
        return None
    return _number(raw, path)


def _nullable_boolean(raw: Any, path: str) -> bool | None:
    if raw is not None and not isinstance(raw, bool):
        raise AnimationContractError(f"{path} must be boolean or null")
    return raw


def _enum(raw: Any, allowed: set[str], path: str) -> str:
    if not isinstance(raw, str) or raw not in allowed:
        raise AnimationContractError(f"{path} contains an unsupported value")
    return raw


def _literal(raw: Any, expected: str, path: str) -> None:
    if raw != expected:
        raise AnimationContractError(f"{path} must equal {expected}")


def _iso_date(raw: Any, path: str) -> None:
    value = _string(raw, 20, 40, path)
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AnimationContractError(f"{path} is not an ISO timestamp") from exc
