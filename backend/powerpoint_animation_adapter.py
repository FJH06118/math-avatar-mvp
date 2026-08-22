from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
import re
import sys
import zipfile
from pathlib import Path
from typing import Any, Callable, Iterable

from backend.animation_contract import (
    COM_PARSER_VERSION,
    SCHEMA_VERSION,
    AnimationContractError,
    assessment,
    stable_id,
    utc_now,
    validate_animation_manifest,
    warning,
)


ANIMATION_ERROR_PREFIX = "PPT_DH_ANIMATION_ERROR:"
SUPPORT_ORDER = [
    "METADATA_SUPPORTED",
    "REBUILD_WHITELIST",
    "PRESERVE_NATIVE_RECOMMENDED",
    "UNSUPPORTED_REQUIRES_REVIEW",
]
TRIGGER_NAMES = {
    -1: "msoAnimTriggerMixed",
    0: "msoAnimTriggerNone",
    1: "msoAnimTriggerOnPageClick",
    2: "msoAnimTriggerWithPrevious",
    3: "msoAnimTriggerAfterPrevious",
    4: "msoAnimTriggerOnShapeClick",
    5: "msoAnimTriggerOnMediaBookmark",
}
EFFECT_NAMES = {
    0: "msoAnimEffectCustom",
    1: "msoAnimEffectAppear",
    2: "msoAnimEffectFly",
    3: "msoAnimEffectBlinds",
    4: "msoAnimEffectBox",
    5: "msoAnimEffectCheckerboard",
    6: "msoAnimEffectCircle",
    7: "msoAnimEffectCrawl",
    8: "msoAnimEffectDiamond",
    9: "msoAnimEffectDissolve",
    10: "msoAnimEffectFade",
    11: "msoAnimEffectFlashOnce",
    12: "msoAnimEffectPeek",
    13: "msoAnimEffectPlus",
    14: "msoAnimEffectRandomBars",
    15: "msoAnimEffectSpiral",
    16: "msoAnimEffectSplit",
    17: "msoAnimEffectStretch",
    18: "msoAnimEffectStrips",
    19: "msoAnimEffectSwivel",
    20: "msoAnimEffectWedge",
    21: "msoAnimEffectWheel",
    22: "msoAnimEffectWipe",
    23: "msoAnimEffectZoom",
    24: "msoAnimEffectRandomEffects",
    25: "msoAnimEffectBoomerang",
    26: "msoAnimEffectBounce",
    27: "msoAnimEffectColorReveal",
    28: "msoAnimEffectCredits",
    29: "msoAnimEffectEaseIn",
    30: "msoAnimEffectFloat",
    31: "msoAnimEffectGrowAndTurn",
    32: "msoAnimEffectLightSpeed",
    33: "msoAnimEffectPinwheel",
    34: "msoAnimEffectRiseUp",
    35: "msoAnimEffectSwish",
    36: "msoAnimEffectThinLine",
    37: "msoAnimEffectUnfold",
    38: "msoAnimEffectWhip",
    39: "msoAnimEffectAscend",
    40: "msoAnimEffectCenterRevolve",
    41: "msoAnimEffectFadedSwivel",
    42: "msoAnimEffectDescend",
    43: "msoAnimEffectSling",
    44: "msoAnimEffectSpinner",
    45: "msoAnimEffectStretchy",
    46: "msoAnimEffectZip",
    47: "msoAnimEffectArcUp",
    48: "msoAnimEffectFadedZoom",
    49: "msoAnimEffectGlide",
    50: "msoAnimEffectExpand",
    51: "msoAnimEffectFlip",
    52: "msoAnimEffectShimmer",
    53: "msoAnimEffectFold",
    54: "msoAnimEffectChangeFillColor",
    55: "msoAnimEffectChangeFont",
    56: "msoAnimEffectChangeFontColor",
    57: "msoAnimEffectChangeFontSize",
    58: "msoAnimEffectChangeFontStyle",
    59: "msoAnimEffectGrowShrink",
    60: "msoAnimEffectChangeLineColor",
    61: "msoAnimEffectSpin",
    62: "msoAnimEffectTransparency",
    63: "msoAnimEffectBoldFlash",
    64: "msoAnimEffectBlast",
    65: "msoAnimEffectBoldReveal",
    66: "msoAnimEffectBrushOnColor",
    67: "msoAnimEffectBrushOnUnderline",
    68: "msoAnimEffectColorBlend",
    69: "msoAnimEffectColorWave",
    70: "msoAnimEffectComplementaryColor",
    71: "msoAnimEffectComplementaryColor2",
    72: "msoAnimEffectContrastingColor",
    73: "msoAnimEffectDarken",
    74: "msoAnimEffectDesaturate",
    75: "msoAnimEffectFlashBulb",
    76: "msoAnimEffectFlicker",
    77: "msoAnimEffectGrowWithColor",
    78: "msoAnimEffectLighten",
    79: "msoAnimEffectStyleEmphasis",
    80: "msoAnimEffectTeeter",
    81: "msoAnimEffectVerticalGrow",
    82: "msoAnimEffectWave",
    83: "msoAnimEffectMediaPlay",
    84: "msoAnimEffectMediaPause",
    85: "msoAnimEffectMediaStop",
}
TRANSITION_NAMES = {
    -2: "ppEffectMixed",
    0: "ppEffectNone",
    257: "ppEffectCut",
    258: "ppEffectCutThroughBlack",
    769: "ppEffectBlindsHorizontal",
    770: "ppEffectBlindsVertical",
    1025: "ppEffectCheckerboardAcross",
    1026: "ppEffectCheckerboardDown",
    1537: "ppEffectDissolve",
    1793: "ppEffectFade",
    2305: "ppEffectRandomBarsHorizontal",
    2306: "ppEffectRandomBarsVertical",
    2817: "ppEffectWipeLeft",
    2818: "ppEffectWipeUp",
    2819: "ppEffectWipeRight",
    2820: "ppEffectWipeDown",
    3849: "ppEffectFadeSmoothly",
}
SIMPLE_EFFECTS = {1, 10, 22, 54, 56, 59, 60, 62, 66, 67}
SIMPLE_TRANSITIONS = {0, 257, 258, 1537, 1793, 2817, 2818, 2819, 2820, 3849}
MORPH_TAG = re.compile(rb"(?:<|:)morph(?:\s|/|>)", re.IGNORECASE)


class AnimationAdapterError(RuntimeError):
    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.public_message = message
        self.retryable = retryable


def emit_animation_error(error: AnimationAdapterError) -> None:
    payload = {
        "code": error.code,
        "message": error.public_message,
        "retryable": error.retryable,
    }
    print(f"{ANIMATION_ERROR_PREFIX}{json.dumps(payload, ensure_ascii=True)}", file=sys.stderr)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_animation_manifest(
    presentation: Any,
    *,
    source_file_sha256: str,
    morph_slides: set[int] | None = None,
) -> dict[str, Any]:
    """Extract only authoritative object-model facts from an already-open presentation."""

    morph_slides = morph_slides or set()
    slide_count = _required_positive_int(_get(presentation.Slides, "Count"), "PowerPoint 未返回合法幻灯片数量。")
    page_width = _required_positive_number(_get(presentation.PageSetup, "SlideWidth"), "PowerPoint 未返回合法页面宽度。")
    page_height = _required_positive_number(_get(presentation.PageSetup, "SlideHeight"), "PowerPoint 未返回合法页面高度。")
    slides: list[dict[str, Any]] = []
    root_warnings: list[dict[str, Any]] = []

    for slide_number in range(1, slide_count + 1):
        slide = _item(presentation.Slides, slide_number)
        slide_manifest = _extract_slide(
            slide,
            source_file_sha256=source_file_sha256,
            slide_number=slide_number,
            page_width=page_width,
            page_height=page_height,
            morph_detected=slide_number in morph_slides,
        )
        slides.append(slide_manifest)
        root_warnings.extend(slide_manifest["warnings"])

    root_levels = _merge_levels(slide["supportAssessment"]["levels"] for slide in slides)
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "id": stable_id("animation_manifest", source_file_sha256, SCHEMA_VERSION),
        "metadataSource": "POWERPOINT_COM",
        "parserVersion": COM_PARSER_VERSION,
        "sourceFileSha256": source_file_sha256,
        "extractedAt": utc_now(),
        "slideCount": slide_count,
        "slides": slides,
        "supportAssessment": assessment(
            root_levels,
            _support_summary(root_levels, "演示文稿"),
        ),
        "warnings": _deduplicate_warnings(root_warnings),
    }
    return validate_animation_manifest(
        manifest,
        expected_source_sha256=source_file_sha256,
        expected_slide_count=slide_count,
    )


def run_powerpoint_adapter(
    input_path: Path,
    output_path: Path,
    state_path: Path,
    *,
    dispatch_ex: Callable[[str], Any] | None = None,
    pythoncom_module: Any | None = None,
    process_id_getter: Callable[[Any], int | None] | None = None,
    process_ids_getter: Callable[[], set[int]] | None = None,
) -> dict[str, Any]:
    if sys.platform != "win32" and dispatch_ex is None:
        raise AnimationAdapterError(
            "POWERPOINT_NOT_INSTALLED",
            "当前系统未安装可用的 Microsoft PowerPoint，无法读取动画元数据。",
        )
    if not input_path.exists():
        raise AnimationAdapterError(
            "POWERPOINT_FILE_OPEN_FAILED",
            "PowerPoint 无法打开课件，文件可能不存在、损坏或已加密。",
        )

    if pythoncom_module is None:
        try:
            import pythoncom as pythoncom_module
        except ImportError as exc:
            raise AnimationAdapterError(
                "POWERPOINT_COM_UNAVAILABLE",
                "PowerPoint COM 组件不可用，请修复或重新安装桌面运行时。",
            ) from exc
    if dispatch_ex is None:
        try:
            import win32com.client
        except ImportError as exc:
            raise AnimationAdapterError(
                "POWERPOINT_COM_UNAVAILABLE",
                "PowerPoint COM 组件不可用，请修复或重新安装桌面运行时。",
            ) from exc
        dispatch_ex = win32com.client.DispatchEx
    if process_id_getter is None:
        process_id_getter = _powerpoint_process_id
    if process_ids_getter is None:
        process_ids_getter = _running_powerpoint_process_ids

    application = None
    presentation = None
    initialized = False
    pid: int | None = None
    cleanup_failed = False
    try:
        pythoncom_module.CoInitialize()
        initialized = True
        existing_powerpoint_process_ids = process_ids_getter()
        try:
            application = dispatch_ex("PowerPoint.Application")
        except Exception as exc:
            raise AnimationAdapterError(
                "POWERPOINT_COM_UNAVAILABLE",
                "无法启动隔离的 Microsoft PowerPoint，请关闭占用中的 Office 进程后重试。",
                retryable=True,
            ) from exc

        # PowerPoint resets this setting when it starts. Set it before opening any
        # untrusted presentation, then never access macros, actions, links, or OLE code.
        try:
            application.AutomationSecurity = 3  # msoAutomationSecurityForceDisable
        except Exception as exc:
            raise AnimationAdapterError(
                "POWERPOINT_SECURITY_CONFIGURATION_FAILED",
                "无法强制禁用 PowerPoint 宏与自动化脚本；为安全起见已停止动画读取。",
            ) from exc
        try:
            application.DisplayAlerts = 1  # ppAlertsNone
        except Exception:
            pass
        pid = process_id_getter(application)
        if pid is None:
            new_process_ids = process_ids_getter() - existing_powerpoint_process_ids
            if len(new_process_ids) == 1:
                pid = next(iter(new_process_ids))
        _write_json(state_path, {"schemaVersion": 1, "powerPointProcessId": pid, "status": "OPENING"})

        try:
            presentation = application.Presentations.Open(
                str(input_path.resolve()),
                ReadOnly=True,
                Untitled=False,
                WithWindow=False,
            )
        except Exception as exc:
            raise AnimationAdapterError(
                "POWERPOINT_FILE_OPEN_FAILED",
                "PowerPoint 无法只读打开课件；文件可能已加密、损坏或包含不兼容结构。",
            ) from exc

        _write_json(state_path, {"schemaVersion": 1, "powerPointProcessId": pid, "status": "EXTRACTING"})
        source_sha256 = sha256_file(input_path)
        morph_slides = _detect_morph_slides(input_path)
        try:
            manifest = extract_animation_manifest(
                presentation,
                source_file_sha256=source_sha256,
                morph_slides=morph_slides,
            )
        except AnimationContractError as exc:
            raise AnimationAdapterError(
                "POWERPOINT_ANIMATION_INVALID",
                "PowerPoint 动画结构未通过严格契约；静态原页仍可继续处理，请人工审核动画。",
            ) from exc
        except AnimationAdapterError:
            raise
        except Exception as exc:
            raise AnimationAdapterError(
                "POWERPOINT_ANIMATION_EXTRACTION_FAILED",
                "PowerPoint 动画结构读取失败；静态原页仍可继续处理，请人工审核动画。",
                retryable=True,
            ) from exc
        _write_json(output_path, manifest)
        _write_json(state_path, {"schemaVersion": 1, "powerPointProcessId": pid, "status": "COMPLETE"})
        return manifest
    finally:
        if presentation is not None:
            try:
                presentation.Close()
            except Exception:
                cleanup_failed = True
        if application is not None:
            try:
                application.Quit()
            except Exception:
                cleanup_failed = True
        presentation = None
        application = None
        gc.collect()
        if initialized:
            try:
                pythoncom_module.CoUninitialize()
            except Exception:
                cleanup_failed = True
        if pid is not None:
            try:
                _write_json(
                    state_path,
                    {
                        "schemaVersion": 1,
                        "powerPointProcessId": pid,
                        "status": "CLEANUP_FAILED" if cleanup_failed else "CLOSED",
                    },
                )
            except Exception:
                pass


def _extract_slide(
    slide: Any,
    *,
    source_file_sha256: str,
    slide_number: int,
    page_width: float,
    page_height: float,
    morph_detected: bool,
) -> dict[str, Any]:
    slide_warnings: list[dict[str, Any]] = []
    sequences: list[dict[str, Any]] = []
    timeline = _optional_get(slide, "TimeLine")
    if timeline is None:
        raise AnimationAdapterError(
            "POWERPOINT_ANIMATION_INVALID",
            "PowerPoint 未返回完整时间轴；静态原页仍可继续处理，请人工审核动画。",
        )
    else:
        main = _optional_get(timeline, "MainSequence")
        main_count = _collection_count(main)
        if main_count is None:
            raise AnimationAdapterError(
                "POWERPOINT_ANIMATION_INVALID",
                "PowerPoint 主动画序列无法完整读取；静态原页仍可继续处理，请人工审核动画。",
            )
        elif main_count > 0:
            sequences.append(
                _extract_sequence(
                    main,
                    source_file_sha256=source_file_sha256,
                    slide_number=slide_number,
                    kind="MAIN",
                    sequence_index=1,
                    page_width=page_width,
                    page_height=page_height,
                )
            )

        interactive_sequences = _optional_get(timeline, "InteractiveSequences")
        interactive_count = _collection_count(interactive_sequences)
        if interactive_count is None:
            raise AnimationAdapterError(
                "POWERPOINT_ANIMATION_INVALID",
                "PowerPoint 交互动画序列无法完整读取；静态原页仍可继续处理，请人工审核动画。",
            )
        else:
            for index in range(1, interactive_count + 1):
                sequence = _item(interactive_sequences, index)
                sequences.append(
                    _extract_sequence(
                        sequence,
                        source_file_sha256=source_file_sha256,
                        slide_number=slide_number,
                        kind="INTERACTIVE",
                        sequence_index=index,
                        page_width=page_width,
                        page_height=page_height,
                    )
                )

    transition = _extract_transition(slide, morph_detected=morph_detected)
    for sequence in sequences:
        slide_warnings.extend(sequence["warnings"])
        for effect in sequence["effects"]:
            slide_warnings.extend(effect["warnings"])
    slide_warnings.extend(transition["warnings"])
    levels = _merge_levels(
        [sequence["supportAssessment"]["levels"] for sequence in sequences]
        + [transition["supportAssessment"]["levels"]]
        + ([
            ["METADATA_SUPPORTED", "PRESERVE_NATIVE_RECOMMENDED", "UNSUPPORTED_REQUIRES_REVIEW"]
        ] if slide_warnings and any(item["code"] == "ANIMATION_STRUCTURE_PARTIAL" for item in slide_warnings) else [])
    )
    effect_count = sum(len(sequence["effects"]) for sequence in sequences)
    return {
        "id": stable_id("slide_animation", source_file_sha256, slide_number),
        "slideNumber": slide_number,
        "sequences": sequences,
        "transition": transition,
        "effectCount": effect_count,
        "supportAssessment": assessment(levels, _support_summary(levels, f"第 {slide_number} 页")),
        "warnings": _deduplicate_warnings(slide_warnings),
    }


def _extract_sequence(
    sequence: Any,
    *,
    source_file_sha256: str,
    slide_number: int,
    kind: str,
    sequence_index: int,
    page_width: float,
    page_height: float,
) -> dict[str, Any]:
    sequence_id = stable_id("sequence", source_file_sha256, slide_number, kind, sequence_index)
    count = _collection_count(sequence)
    if count is None:
        raise AnimationAdapterError(
            "POWERPOINT_ANIMATION_INVALID",
            "PowerPoint 动画序列无法枚举，请人工审核该页动画。",
        )
    effects: list[dict[str, Any]] = []
    sequence_warnings: list[dict[str, Any]] = []
    for order in range(1, count + 1):
        try:
            effect = _item(sequence, order)
            effects.append(
                _extract_effect(
                    effect,
                    source_file_sha256=source_file_sha256,
                    slide_number=slide_number,
                    sequence_id=sequence_id,
                    sequence_kind=kind,
                    order=order,
                    page_width=page_width,
                    page_height=page_height,
                )
            )
        except AnimationAdapterError:
            raise
        except Exception as exc:
            raise AnimationAdapterError(
                "POWERPOINT_ANIMATION_INVALID",
                "PowerPoint 动画效果无法完整枚举；静态原页仍可继续处理，请人工审核动画。",
            ) from exc
    if kind == "INTERACTIVE":
        sequence_warnings.append(
            warning(
                "INTERACTIVE_TRIGGER_REQUIRES_REVIEW",
                "交互序列依赖点击指定对象；线性视频应保留原生播放或由教师确认同步方式。",
            )
        )
    levels = _merge_levels(effect["supportAssessment"]["levels"] for effect in effects)
    if kind == "INTERACTIVE" or sequence_warnings:
        levels = _merge_levels([levels, ["METADATA_SUPPORTED", "PRESERVE_NATIVE_RECOMMENDED", "UNSUPPORTED_REQUIRES_REVIEW"]])
    return {
        "id": sequence_id,
        "kind": kind,
        "index": sequence_index,
        "effects": effects,
        "supportAssessment": assessment(levels, _support_summary(levels, "动画序列")),
        "warnings": _deduplicate_warnings(sequence_warnings),
    }


def _extract_effect(
    effect: Any,
    *,
    source_file_sha256: str,
    slide_number: int,
    sequence_id: str,
    sequence_kind: str,
    order: int,
    page_width: float,
    page_height: float,
) -> dict[str, Any]:
    raw_index = _optional_int(_optional_get(effect, "Index"))
    raw_effect_type = _optional_int(_optional_get(effect, "EffectType"))
    raw_exit = _optional_int(_optional_get(effect, "Exit"))
    effect_id = stable_id("effect", source_file_sha256, slide_number, sequence_id, raw_index, order)
    effect_warnings: list[dict[str, Any]] = []

    effect_name, known_effect = _effect_name(raw_effect_type)
    if raw_effect_type is None:
        effect_warnings.append(
            warning("ANIMATION_STRUCTURE_PARTIAL", "PowerPoint 未返回动画效果枚举。", effect_id=effect_id)
        )
    elif raw_effect_type == 0:
        effect_warnings.append(
            warning("CUSTOM_ANIMATION", "自定义 PowerPoint 动画不能由当前渲染器可靠重建。", effect_id=effect_id, raw_value=raw_effect_type)
        )
    elif 86 <= raw_effect_type <= 149:
        effect_warnings.append(
            warning("COMPLEX_MOTION_PATH", "路径动画需要 PowerPoint 原生播放或人工审核。", effect_id=effect_id, raw_value=raw_effect_type)
        )
    elif raw_effect_type in {83, 84, 85}:
        effect_warnings.append(
            warning("MEDIA_TRIGGER_OR_EFFECT", "媒体动画或触发器不属于首阶段重建范围。", effect_id=effect_id, raw_value=raw_effect_type)
        )
    elif not known_effect:
        effect_warnings.append(
            warning("UNKNOWN_ANIMATION_EFFECT", "PowerPoint 返回了当前解析器未知的动画枚举，原始值已保留。", effect_id=effect_id, raw_value=raw_effect_type)
        )

    target_shape = _shape_reference(
        _optional_get(effect, "Shape"),
        source_file_sha256=source_file_sha256,
        slide_number=slide_number,
        page_width=page_width,
        page_height=page_height,
    )
    timing_object = _optional_get(effect, "Timing")
    timing, timing_warnings = _extract_timing(
        timing_object,
        source_file_sha256=source_file_sha256,
        slide_number=slide_number,
        effect_id=effect_id,
        page_width=page_width,
        page_height=page_height,
    )
    effect_warnings.extend(timing_warnings)
    exit_value = _tri_state(raw_exit)
    category = _effect_category(raw_effect_type, exit_value)
    levels = _effect_support_levels(
        raw_effect_type,
        timing["trigger"]["type"]["rawValue"],
        sequence_kind,
        effect_warnings,
    )
    return {
        "id": effect_id,
        "index": raw_index,
        "order": order,
        "effectType": {"rawValue": raw_effect_type, "name": effect_name, "known": known_effect},
        "category": category,
        "exit": exit_value,
        "exitRawValue": raw_exit,
        "shape": target_shape,
        "paragraph": _optional_int(_optional_get(effect, "Paragraph")),
        "textRangeStart": _optional_int(_optional_get(effect, "TextRangeStart")),
        "textRangeLength": _optional_int(_optional_get(effect, "TextRangeLength")),
        "timing": timing,
        "supportAssessment": assessment(levels, _support_summary(levels, "动画效果")),
        "warnings": _deduplicate_warnings(effect_warnings),
    }


def _extract_timing(
    timing: Any | None,
    *,
    source_file_sha256: str,
    slide_number: int,
    effect_id: str,
    page_width: float,
    page_height: float,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    warnings: list[dict[str, Any]] = []
    if timing is None:
        warnings.append(
            warning("ANIMATION_STRUCTURE_PARTIAL", "PowerPoint 未返回动画计时对象。", effect_id=effect_id)
        )
        trigger_raw = None
        trigger_shape = None
        delay = duration = repeat_count = repeat_duration = None
        auto_reverse_raw = None
    else:
        trigger_raw = _optional_int(_optional_get(timing, "TriggerType"))
        trigger_shape = _shape_reference(
            _optional_get(timing, "TriggerShape"),
            source_file_sha256=source_file_sha256,
            slide_number=slide_number,
            page_width=page_width,
            page_height=page_height,
        )
        delay = _optional_number(_optional_get(timing, "TriggerDelayTime"))
        duration = _optional_number(_optional_get(timing, "Duration"))
        repeat_count = _optional_number(_optional_get(timing, "RepeatCount"))
        repeat_duration = _optional_number(_optional_get(timing, "RepeatDuration"))
        auto_reverse_raw = _optional_int(_optional_get(timing, "AutoReverse"))

    trigger_name = TRIGGER_NAMES.get(trigger_raw, f"UNKNOWN_{trigger_raw}" if trigger_raw is not None else "UNREADABLE")
    known_trigger = trigger_raw in TRIGGER_NAMES
    if trigger_raw is None:
        warnings.append(
            warning("ANIMATION_STRUCTURE_PARTIAL", "PowerPoint 未返回动画触发器。", effect_id=effect_id)
        )
    elif trigger_raw not in TRIGGER_NAMES:
        warnings.append(
            warning("UNKNOWN_TRIGGER", "PowerPoint 返回了当前解析器未知的触发器，原始值已保留。", effect_id=effect_id, raw_value=trigger_raw)
        )
    if trigger_raw == 4 and trigger_shape is None:
        warnings.append(
            warning("ANIMATION_STRUCTURE_PARTIAL", "点击对象触发器缺少可读取的 TriggerShape。", effect_id=effect_id)
        )
    if trigger_raw == 5:
        warnings.append(
            warning("MEDIA_TRIGGER_OR_EFFECT", "媒体书签触发器需要人工审核并建议保留 PowerPoint 原生播放。", effect_id=effect_id, raw_value=trigger_raw)
        )
    auto_reverse = _tri_state(auto_reverse_raw)
    if (repeat_count not in (None, 0.0, 1.0)) or (repeat_duration not in (None, 0.0)) or auto_reverse:
        warnings.append(
            warning("REPEAT_OR_AUTO_REVERSE_REQUIRES_REVIEW", "重复或自动反转计时已保留，但不属于首阶段简单重建范围。", effect_id=effect_id)
        )
    return (
        {
            "trigger": {
                "type": {"rawValue": trigger_raw, "name": trigger_name, "known": known_trigger},
                "shape": trigger_shape,
            },
            "triggerDelaySeconds": delay,
            "durationSeconds": duration if duration is None or duration >= 0 else None,
            "repeatCount": repeat_count,
            "repeatDurationSeconds": repeat_duration,
            "autoReverse": auto_reverse,
            "autoReverseRawValue": auto_reverse_raw,
        },
        warnings,
    )


def _extract_transition(slide: Any, *, morph_detected: bool) -> dict[str, Any]:
    transition = _optional_get(slide, "SlideShowTransition")
    warnings: list[dict[str, Any]] = []
    if transition is None:
        raw_entry = None
        duration = advance_time = None
        click_raw = time_raw = None
        warnings.append(warning("ANIMATION_STRUCTURE_PARTIAL", "PowerPoint 未返回页面切换对象。"))
    else:
        raw_entry = _optional_int(_optional_get(transition, "EntryEffect"))
        duration = _optional_number(_optional_get(transition, "Duration"))
        click_raw = _optional_int(_optional_get(transition, "AdvanceOnClick"))
        time_raw = _optional_int(_optional_get(transition, "AdvanceOnTime"))
        advance_time = _optional_number(_optional_get(transition, "AdvanceTime"))
    transition_name = TRANSITION_NAMES.get(raw_entry, f"UNKNOWN_{raw_entry}" if raw_entry is not None else "UNREADABLE")
    known_transition = raw_entry in TRANSITION_NAMES
    levels = ["METADATA_SUPPORTED"]
    if morph_detected:
        warnings.append(warning("MORPH_TRANSITION", "检测到 Morph 页面切换；当前渲染器不能可靠重建，建议使用 PowerPoint 原生播放或视频导出。"))
        levels.extend(["PRESERVE_NATIVE_RECOMMENDED", "UNSUPPORTED_REQUIRES_REVIEW"])
    elif raw_entry is None:
        levels.extend(["PRESERVE_NATIVE_RECOMMENDED", "UNSUPPORTED_REQUIRES_REVIEW"])
    elif not known_transition:
        warnings.append(warning("UNKNOWN_TRANSITION", "PowerPoint 返回了当前解析器未知的页面切换枚举，原始值已保留。", raw_value=raw_entry))
        levels.extend(["PRESERVE_NATIVE_RECOMMENDED", "UNSUPPORTED_REQUIRES_REVIEW"])
    elif raw_entry in SIMPLE_TRANSITIONS:
        levels.append("REBUILD_WHITELIST")
    else:
        warnings.append(warning("NATIVE_PLAYBACK_RECOMMENDED", "该页面切换不属于简单重建白名单，建议保留 PowerPoint 原生播放。", raw_value=raw_entry))
        levels.append("PRESERVE_NATIVE_RECOMMENDED")
    levels = _ordered_levels(levels)
    return {
        "entryEffect": {"rawValue": raw_entry, "name": transition_name, "known": known_transition},
        "durationSeconds": duration if duration is None or duration >= 0 else None,
        "advanceOnClick": _tri_state(click_raw),
        "advanceOnClickRawValue": click_raw,
        "advanceOnTime": _tri_state(time_raw),
        "advanceOnTimeRawValue": time_raw,
        "advanceTimeSeconds": advance_time if advance_time is None or advance_time >= 0 else None,
        "morphDetected": morph_detected,
        "supportAssessment": assessment(levels, _support_summary(levels, "页面切换")),
        "warnings": _deduplicate_warnings(warnings),
    }


def _shape_reference(
    shape: Any | None,
    *,
    source_file_sha256: str,
    slide_number: int,
    page_width: float,
    page_height: float,
) -> dict[str, Any] | None:
    if shape is None:
        return None
    source_shape_id = _optional_int(_optional_get(shape, "Id"))
    name_value = _optional_get(shape, "Name")
    name = str(name_value).strip()[:500] if name_value is not None else "未命名对象"
    if not name:
        name = "未命名对象"
    shape_type = _optional_int(_optional_get(shape, "Type"))
    if shape_type is None:
        shape_type = -2
    left = _optional_number(_optional_get(shape, "Left")) or 0.0
    top = _optional_number(_optional_get(shape, "Top")) or 0.0
    width = max(0.0, _optional_number(_optional_get(shape, "Width")) or 0.0)
    height = max(0.0, _optional_number(_optional_get(shape, "Height")) or 0.0)
    visible = _visible_bounds(left, top, width, height, page_width, page_height)
    return {
        "id": stable_id(
            "shape",
            source_file_sha256,
            slide_number,
            source_shape_id,
            name,
            left,
            top,
            width,
            height,
        ),
        "sourceShapeId": source_shape_id,
        "name": name,
        "shapeTypeRaw": shape_type,
        "boundsPoints": {"left": left, "top": top, "width": width, "height": height},
        "visibleBounds": visible,
    }


def _visible_bounds(
    left: float,
    top: float,
    width: float,
    height: float,
    page_width: float,
    page_height: float,
) -> dict[str, float] | None:
    right = min(page_width, max(0.0, left + width))
    bottom = min(page_height, max(0.0, top + height))
    clipped_left = min(page_width, max(0.0, left))
    clipped_top = min(page_height, max(0.0, top))
    if right <= clipped_left or bottom <= clipped_top:
        return None
    return {
        "x": clipped_left / page_width,
        "y": clipped_top / page_height,
        "width": (right - clipped_left) / page_width,
        "height": (bottom - clipped_top) / page_height,
    }


def _effect_name(raw_value: int | None) -> tuple[str, bool]:
    if raw_value is None:
        return "UNREADABLE", False
    if raw_value in EFFECT_NAMES:
        return EFFECT_NAMES[raw_value], True
    if 86 <= raw_value <= 149:
        return f"msoAnimEffectMotionPath_{raw_value}", True
    return f"UNKNOWN_{raw_value}", False


def _effect_category(raw_value: int | None, exit_value: bool | None) -> str:
    if exit_value:
        return "EXIT"
    if raw_value is None or raw_value == 0 or (raw_value not in EFFECT_NAMES and not 86 <= raw_value <= 149):
        return "CUSTOM_OR_UNKNOWN"
    if 86 <= raw_value <= 149:
        return "MOTION_PATH"
    if raw_value in {83, 84, 85}:
        return "MEDIA"
    if 54 <= raw_value <= 82:
        return "EMPHASIS"
    return "ENTRANCE"


def _effect_support_levels(
    raw_effect_type: int | None,
    raw_trigger_type: int | None,
    sequence_kind: str,
    warnings: list[dict[str, Any]],
) -> list[str]:
    levels = ["METADATA_SUPPORTED"]
    unsupported_codes = {
        "ANIMATION_STRUCTURE_PARTIAL",
        "UNKNOWN_ANIMATION_EFFECT",
        "CUSTOM_ANIMATION",
        "COMPLEX_MOTION_PATH",
        "MEDIA_TRIGGER_OR_EFFECT",
        "UNKNOWN_TRIGGER",
        "REPEAT_OR_AUTO_REVERSE_REQUIRES_REVIEW",
    }
    unsupported = any(item["code"] in unsupported_codes for item in warnings)
    if sequence_kind == "INTERACTIVE" or raw_trigger_type in {4, 5}:
        unsupported = True
    if raw_effect_type in SIMPLE_EFFECTS and raw_trigger_type in {1, 2, 3} and not unsupported:
        levels.append("REBUILD_WHITELIST")
    else:
        levels.append("PRESERVE_NATIVE_RECOMMENDED")
        if unsupported:
            levels.append("UNSUPPORTED_REQUIRES_REVIEW")
    return _ordered_levels(levels)


def _support_summary(levels: list[str], subject: str) -> str:
    if "STATIC_FALLBACK" in levels:
        return f"{subject}只能静态处理。"
    if "UNSUPPORTED_REQUIRES_REVIEW" in levels:
        return f"{subject}的权威元数据可读，但包含复杂或未知效果，需要人工审核并建议保留原生播放。"
    if "PRESERVE_NATIVE_RECOMMENDED" in levels:
        return f"{subject}的权威元数据可读；为保留视觉语义，建议使用 PowerPoint 原生播放。"
    if "REBUILD_WHITELIST" in levels:
        return f"{subject}的权威元数据可读，且简单效果属于内部重建白名单。"
    return f"{subject}的权威动画元数据可读取。"


def _merge_levels(groups: Iterable[Iterable[str]]) -> list[str]:
    values = {"METADATA_SUPPORTED"}
    for group in groups:
        values.update(group)
    return [level for level in SUPPORT_ORDER if level in values]


def _ordered_levels(levels: Iterable[str]) -> list[str]:
    values = set(levels)
    return [level for level in SUPPORT_ORDER if level in values]


def _deduplicate_warnings(values: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for item in values:
        key = (item.get("code"), item.get("message"), item.get("effectId"), item.get("rawValue"))
        if key not in seen:
            output.append(item)
            seen.add(key)
    return output


def _detect_morph_slides(path: Path) -> set[int]:
    if path.suffix.lower() not in {".pptx", ".pptm", ".ppsx", ".ppsm"}:
        return set()
    try:
        from pptx import Presentation

        presentation = Presentation(str(path))
        part_names = [str(slide.part.partname).lstrip("/") for slide in presentation.slides]
        with zipfile.ZipFile(path) as archive:
            return {
                index
                for index, part_name in enumerate(part_names, 1)
                if MORPH_TAG.search(archive.read(part_name))
            }
    except Exception:
        return set()


def _powerpoint_process_id(application: Any) -> int | None:
    try:
        import win32process

        _thread_id, process_id = win32process.GetWindowThreadProcessId(int(application.HWND))
        return int(process_id) if process_id else None
    except Exception:
        return None


def _running_powerpoint_process_ids() -> set[int]:
    if sys.platform != "win32":
        return set()
    try:
        import ctypes
        from ctypes import wintypes

        class ProcessEntry32W(ctypes.Structure):
            _fields_ = [
                ("dwSize", wintypes.DWORD),
                ("cntUsage", wintypes.DWORD),
                ("th32ProcessID", wintypes.DWORD),
                ("th32DefaultHeapID", ctypes.c_size_t),
                ("th32ModuleID", wintypes.DWORD),
                ("cntThreads", wintypes.DWORD),
                ("th32ParentProcessID", wintypes.DWORD),
                ("pcPriClassBase", wintypes.LONG),
                ("dwFlags", wintypes.DWORD),
                ("szExeFile", wintypes.WCHAR * 260),
            ]

        snapshot = ctypes.windll.kernel32.CreateToolhelp32Snapshot(0x00000002, 0)
        if snapshot in (0, wintypes.HANDLE(-1).value):
            return set()
        try:
            entry = ProcessEntry32W()
            entry.dwSize = ctypes.sizeof(entry)
            values: set[int] = set()
            present = ctypes.windll.kernel32.Process32FirstW(snapshot, ctypes.byref(entry))
            while present:
                if entry.szExeFile.upper() == "POWERPNT.EXE":
                    values.add(int(entry.th32ProcessID))
                present = ctypes.windll.kernel32.Process32NextW(snapshot, ctypes.byref(entry))
            return values
        finally:
            ctypes.windll.kernel32.CloseHandle(snapshot)
    except Exception:
        return set()


def cleanup_powerpoint_from_state(state_path: Path) -> bool:
    """Terminate only the recorded isolated POWERPNT.EXE process, if it still exists."""

    if sys.platform != "win32" or not state_path.exists():
        return False
    try:
        if state_path.stat().st_size > 4_096:
            return False
        raw: Any = json.loads(state_path.read_text(encoding="utf-8"))
        if (
            not isinstance(raw, dict)
            or set(raw) != {"schemaVersion", "powerPointProcessId", "status"}
            or raw["schemaVersion"] != 1
            or isinstance(raw["powerPointProcessId"], bool)
            or not isinstance(raw["powerPointProcessId"], int)
            or raw["powerPointProcessId"] <= 0
            or raw["status"] not in {"OPENING", "EXTRACTING", "COMPLETE", "CLOSED", "CLEANUP_FAILED"}
        ):
            return False
        return _terminate_verified_powerpoint_process(raw["powerPointProcessId"])
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return False


def _terminate_verified_powerpoint_process(process_id: int) -> bool:
    # Never terminate an arbitrary PID. Query the live executable first and only
    # act when it is the exact isolated PowerPoint executable recorded by this adapter.
    from ctypes import byref, create_unicode_buffer, windll
    from ctypes import wintypes

    process_query_limited_information = 0x1000
    process_terminate = 0x0001
    synchronize = 0x00100000
    kernel32 = windll.kernel32
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    handle = kernel32.OpenProcess(
        process_query_limited_information | process_terminate | synchronize,
        False,
        process_id,
    )
    if not handle:
        return False
    try:
        capacity = wintypes.DWORD(32_768)
        executable = create_unicode_buffer(capacity.value)
        if not kernel32.QueryFullProcessImageNameW(handle, 0, executable, byref(capacity)):
            return False
        if Path(executable.value).name.upper() != "POWERPNT.EXE":
            return False
        if not kernel32.TerminateProcess(handle, 1):
            return False
        kernel32.WaitForSingleObject(handle, 5_000)
        return True
    finally:
        kernel32.CloseHandle(handle)


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _collection_count(collection: Any | None) -> int | None:
    if collection is None:
        return None
    return _optional_int(_optional_get(collection, "Count"))


def _item(collection: Any, index: int) -> Any:
    item = _optional_get(collection, "Item")
    if callable(item):
        return item(index)
    if callable(collection):
        return collection(index)
    return collection[index]


def _get(value: Any, name: str) -> Any:
    return getattr(value, name)


def _optional_get(value: Any, name: str) -> Any | None:
    if value is None:
        return None
    try:
        return getattr(value, name)
    except Exception:
        return None


def _optional_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return int(value) if isinstance(value, bool) else None
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _optional_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return round(result, 6) if result == result and abs(result) != float("inf") else None


def _tri_state(raw_value: int | None) -> bool | None:
    if raw_value is None:
        return None
    if raw_value == 0:
        return False
    if raw_value == -1:
        return True
    return None


def _required_positive_int(value: Any, message: str) -> int:
    parsed = _optional_int(value)
    if parsed is None or parsed < 1:
        raise AnimationAdapterError("POWERPOINT_ANIMATION_INVALID", message)
    return parsed


def _required_positive_number(value: Any, message: str) -> float:
    parsed = _optional_number(value)
    if parsed is None or parsed <= 0:
        raise AnimationAdapterError("POWERPOINT_ANIMATION_INVALID", message)
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract PowerPoint animation metadata in an isolated COM process.")
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--state")
    parser.add_argument("--cleanup-state")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.cleanup_state:
        cleanup_powerpoint_from_state(Path(args.cleanup_state).expanduser().resolve())
        return 0
    if not args.input or not args.output or not args.state:
        raise AnimationAdapterError(
            "POWERPOINT_ANIMATION_INVALID",
            "PowerPoint 动画读取参数不完整。",
        )
    run_powerpoint_adapter(
        Path(args.input).expanduser().resolve(),
        Path(args.output).expanduser().resolve(),
        Path(args.state).expanduser().resolve(),
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AnimationAdapterError as error:
        emit_animation_error(error)
        raise SystemExit(2)
    except Exception:
        emit_animation_error(
            AnimationAdapterError(
                "POWERPOINT_ANIMATION_EXTRACTION_FAILED",
                "PowerPoint 动画读取组件异常退出；静态原页仍可继续处理，请人工审核动画。",
                retryable=True,
            )
        )
        raise SystemExit(2)
