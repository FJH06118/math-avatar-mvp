from __future__ import annotations

import unittest

from backend.prepare import spoken_formula_hint


class PrepareTests(unittest.TestCase):
    def test_spoken_formula_hint_expands_common_calculus_symbols(self) -> None:
        spoken = spoken_formula_hint("lim x→x₀, Δy/Δx=|x|")
        self.assertIn("极限", spoken)
        self.assertIn("埃克斯趋于埃克斯零", spoken)
        self.assertIn("德尔塔歪除以德尔塔埃克斯", spoken)
        self.assertIn("埃克斯的绝对值", spoken)
        self.assertEqual(spoken_formula_hint("f\uf0a2(0)"), "函数 f撇(0)")


if __name__ == "__main__":
    unittest.main()
