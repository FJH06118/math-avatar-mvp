from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

from backend.contracts import (
    ContractError,
    normalize_scene_payload,
    read_json,
    write_json,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Approve an edited scenes.generated.json for rendering."
    )
    parser.add_argument("--job-dir", required=True)
    args = parser.parse_args()

    job_dir = Path(args.job_dir).expanduser().resolve()
    deck = read_json(job_dir / "parsed-deck.json")
    generated = read_json(job_dir / "scenes.generated.json")
    normalized = normalize_scene_payload(
        generated,
        slide_count=int(deck["slideCount"]),
        default_title=str(deck["courseTitle"]),
    )
    for key in (
        "sourceFile",
        "planner",
        "plannerError",
        "generatedAt",
        "sourceSlideCoverage",
    ):
        if key in generated:
            normalized[key] = generated[key]
    normalized["approval"] = {
        "status": "approved",
        "method": "manual",
        "approvedAt": datetime.now(timezone.utc).isoformat(),
    }
    for scene in normalized["scenes"]:
        scene["reviewStatus"] = "approved"
    reviewed_path = job_dir / "scenes.reviewed.json"
    write_json(reviewed_path, normalized)
    print(reviewed_path)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractError as error:
        print(f"ERROR: {error}")
        raise SystemExit(2)
