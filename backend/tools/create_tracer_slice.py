"""Create a private, Git-ignored leading-page tracer PPTX without editing the source."""

from __future__ import annotations

import argparse
from pathlib import Path

from pptx import Presentation


def create_leading_slice(source: Path, output: Path, page_count: int = 3) -> int:
    source = source.resolve()
    output = output.resolve()
    if source == output:
        raise ValueError("Output must not overwrite the source presentation.")
    if source.suffix.lower() != ".pptx" or output.suffix.lower() != ".pptx":
        raise ValueError("Source and output must both be .pptx files.")
    if page_count < 1:
        raise ValueError("page_count must be positive.")

    presentation = Presentation(str(source))
    if len(presentation.slides) < page_count:
        raise ValueError(
            f"Source contains {len(presentation.slides)} pages, fewer than {page_count}."
        )

    slide_ids = presentation.slides._sldIdLst  # pylint: disable=protected-access
    for slide_id in list(slide_ids)[page_count:]:
        presentation.part.drop_rel(slide_id.rId)
        slide_ids.remove(slide_id)

    output.parent.mkdir(parents=True, exist_ok=True)
    presentation.save(str(output))
    written = Presentation(str(output))
    if len(written.slides) != page_count:
        raise RuntimeError("Tracer slice page-count verification failed.")
    return len(written.slides)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--pages", type=int, default=3)
    args = parser.parse_args()
    pages = create_leading_slice(args.input, args.output, args.pages)
    print(f"Created private tracer slice with {pages} pages.")


if __name__ == "__main__":
    main()
