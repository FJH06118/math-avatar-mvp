import tempfile
import unittest
from pathlib import Path

from pptx import Presentation

from backend.tools.create_tracer_slice import create_leading_slice


class TracerSliceTests(unittest.TestCase):
    def test_creates_three_page_copy_without_changing_source(self):
        source = Path("backend/tests/fixtures/tracer-3.pptx").resolve()
        original_pages = len(Presentation(str(source)).slides)
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "slice.pptx"
            self.assertEqual(create_leading_slice(source, output, 2), 2)
            self.assertEqual(len(Presentation(str(output)).slides), 2)
        self.assertEqual(len(Presentation(str(source)).slides), original_pages)


if __name__ == "__main__":
    unittest.main()
