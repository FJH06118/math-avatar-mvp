from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
ALLOWED_SCENE_TYPES = {
    "opening",
    "roadmap",
    "concept",
    "definition",
    "theorem",
    "proof",
    "derivation",
    "example",
    "summary",
}


class ContractError(ValueError):
    """Raised when a pipeline JSON contract is invalid."""


def slugify_scene_id(value: str, index: int) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-").lower()
    if not normalized:
        normalized = f"scene-{index:03d}"
    if not normalized[0].isalnum():
        normalized = f"scene-{normalized}"
    return normalized[:80]


def _normalize_narration_item(item: Any) -> dict[str, str]:
    if isinstance(item, str):
        text = item.strip()
        return {"displayText": text, "spokenText": text}
    if not isinstance(item, dict):
        raise ContractError("narration items must be strings or objects")
    display_text = str(
        item.get("displayText")
        or item.get("display_text")
        or item.get("text")
        or item.get("spokenText")
        or ""
    ).strip()
    spoken_text = str(
        item.get("spokenText")
        or item.get("spoken_text")
        or display_text
    ).strip()
    spoken_text = "".join(
        " " if unicodedata.category(character) == "Co" else character
        for character in spoken_text
    )
    spoken_text = re.sub(r"\s+", " ", spoken_text).strip()
    if not display_text or not spoken_text:
        raise ContractError("narration displayText/spokenText cannot be empty")
    return {"displayText": display_text, "spokenText": spoken_text}


def normalize_scene(
    scene: dict[str, Any],
    index: int,
    slide_count: int,
) -> dict[str, Any]:
    raw_sources = (
        scene.get("sourceSlides")
        or scene.get("source_slides")
        or scene.get("sourceSlideNumbers")
        or []
    )
    if isinstance(raw_sources, int):
        raw_sources = [raw_sources]
    source_slides: list[int] = []
    for value in raw_sources:
        try:
            slide_number = int(value)
        except (TypeError, ValueError) as exc:
            raise ContractError(f"invalid source slide number: {value}") from exc
        if slide_number < 1 or slide_number > slide_count:
            raise ContractError(
                f"source slide {slide_number} outside 1..{slide_count}"
            )
        if slide_number not in source_slides:
            source_slides.append(slide_number)
    if not source_slides:
        raise ContractError("every scene must reference at least one source slide")

    title = str(scene.get("title") or "").strip()
    if not title:
        raise ContractError("scene title cannot be empty")
    section = str(scene.get("section") or "课程讲解").strip()
    scene_type = str(
        scene.get("type") or scene.get("sceneType") or "concept"
    ).strip()
    if scene_type not in ALLOWED_SCENE_TYPES:
        scene_type = "concept"

    narration_raw = scene.get("narration") or []
    if isinstance(narration_raw, str):
        narration_raw = [narration_raw]
    narration = []
    for item in narration_raw:
        if item is None:
            continue
        normalized_item = _normalize_narration_item(item)
        if not any(
            character.isalnum()
            for character in normalized_item["spokenText"]
        ):
            continue
        narration.append(normalized_item)
    if not narration:
        raise ContractError(f"scene '{title}' has no narration")

    formulas: list[dict[str, str]] = []
    for formula in scene.get("formulas") or []:
        if isinstance(formula, str):
            formulas.append(
                {"display": formula.strip(), "latex": "", "spokenText": ""}
            )
            continue
        if not isinstance(formula, dict):
            continue
        display = str(
            formula.get("display")
            or formula.get("source")
            or formula.get("latex")
            or ""
        ).strip()
        if not display:
            continue
        formulas.append(
            {
                "display": display,
                "latex": str(formula.get("latex") or "").strip(),
                "spokenText": str(
                    formula.get("spokenText")
                    or formula.get("spoken_text")
                    or ""
                ).strip(),
            }
        )

    return {
        "id": slugify_scene_id(str(scene.get("id") or ""), index),
        "type": scene_type,
        "section": section,
        "title": title,
        "sourceSlides": source_slides,
        "slideImage": f"slides/slide-{source_slides[0]:03d}.png",
        "narration": narration,
        "formulas": formulas,
        "reviewStatus": str(scene.get("reviewStatus") or "needs_review"),
        "warnings": [
            str(value).strip()
            for value in scene.get("warnings") or []
            if str(value).strip()
        ],
    }


def normalize_scene_payload(
    payload: dict[str, Any],
    *,
    slide_count: int,
    default_title: str,
) -> dict[str, Any]:
    raw_scenes = payload.get("scenes")
    if not isinstance(raw_scenes, list) or not raw_scenes:
        raise ContractError("payload must contain a non-empty scenes array")

    normalized_scenes: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw_scene in enumerate(raw_scenes, 1):
        if not isinstance(raw_scene, dict):
            raise ContractError(f"scene {index} is not an object")
        scene = normalize_scene(raw_scene, index, slide_count)
        base_id = scene["id"]
        suffix = 2
        while scene["id"] in seen_ids:
            scene["id"] = f"{base_id}-{suffix}"
            suffix += 1
        seen_ids.add(scene["id"])
        normalized_scenes.append(scene)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "courseTitle": str(
            payload.get("courseTitle")
            or payload.get("course_title")
            or default_title
        ).strip(),
        "courseSummary": str(
            payload.get("courseSummary")
            or payload.get("course_summary")
            or ""
        ).strip(),
        "scenes": normalized_scenes,
    }


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ContractError(f"missing file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ContractError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ContractError(f"expected an object in {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
