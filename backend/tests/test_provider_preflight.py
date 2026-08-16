from __future__ import annotations

import unittest

from backend.provider_preflight import ProviderPreflightError, request_with_retry


class ProviderPreflightTests(unittest.TestCase):
    def test_retries_a_timeout_then_returns_response(self) -> None:
        calls = 0
        delays: list[float] = []

        def request() -> str:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise TimeoutError("temporary")
            return "ok"

        result, attempts = request_with_retry(
            request,
            max_attempts=2,
            sleep=delays.append,
        )

        self.assertEqual(result, "ok")
        self.assertEqual(attempts, 2)
        self.assertEqual(delays, [0.5])

    def test_does_not_retry_non_retryable_error(self) -> None:
        calls = 0

        def request() -> str:
            nonlocal calls
            calls += 1
            raise ValueError("bad input")

        with self.assertRaisesRegex(ProviderPreflightError, "unknown after 1 attempt"):
            request_with_retry(request, max_attempts=2, sleep=lambda _: None)
        self.assertEqual(calls, 1)
