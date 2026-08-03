from __future__ import annotations

import argparse
import json
import os
import time
from collections.abc import Callable
from typing import Any, TypeVar

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError

from backend.env import load_local_env


Result = TypeVar("Result")


class ProviderPreflightError(RuntimeError):
    pass


def classify_error(error: Exception) -> str:
    if isinstance(error, (APITimeoutError, TimeoutError)):
        return "timeout"
    if isinstance(error, APIConnectionError):
        return "connection"
    if isinstance(error, RateLimitError):
        return "rate_limit"
    status_code = getattr(error, "status_code", None)
    if status_code in {401, 403}:
        return "authentication"
    if status_code == 404:
        return "model_not_found"
    if isinstance(status_code, int) and 500 <= status_code <= 599:
        return "provider_server"
    if isinstance(error, APIStatusError):
        return "provider_request"
    return "unknown"


def is_retryable(error: Exception) -> bool:
    return classify_error(error) in {"timeout", "connection", "rate_limit", "provider_server"}


def request_with_retry(
    request: Callable[[], Result],
    *,
    max_attempts: int,
    sleep: Callable[[float], None] = time.sleep,
) -> tuple[Result, int]:
    for attempt in range(1, max_attempts + 1):
        try:
            return request(), attempt
        except Exception as error:
            if attempt >= max_attempts or not is_retryable(error):
                raise ProviderPreflightError(
                    f"{classify_error(error)} after {attempt} attempt(s)"
                ) from error
            sleep(0.5 * attempt)
    raise AssertionError("unreachable")


def require_config(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ProviderPreflightError(f"missing_config:{name}")
    return value


def validate_structured_response(response: Any) -> None:
    choices = getattr(response, "choices", None) or []
    content = getattr(getattr(choices[0], "message", None), "content", None) if choices else None
    if not isinstance(content, str):
        raise ProviderPreflightError("invalid_response:missing_content")
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as error:
        raise ProviderPreflightError("invalid_response:not_json") from error
    if payload != {"status": "ok", "value": 42}:
        raise ProviderPreflightError("invalid_response:unexpected_payload")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify the configured OpenAI-compatible LLM provider without sending courseware."
    )
    parser.add_argument("--timeout-seconds", type=float, default=30)
    parser.add_argument("--max-attempts", type=int, default=2)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.timeout_seconds <= 0 or args.max_attempts < 1:
        raise ValueError("timeout-seconds must be positive and max-attempts must be at least 1")

    load_local_env()
    api_key = os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise ProviderPreflightError("missing_config:LLM_API_KEY")
    base_url = require_config("LLM_BASE_URL")
    model = require_config("LLM_MODEL")
    client = OpenAI(api_key=api_key, base_url=base_url, timeout=args.timeout_seconds)

    response, attempts = request_with_retry(
        lambda: client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Return exactly the JSON object requested. Do not add prose.",
                },
                {
                    "role": "user",
                    "content": "Return exactly: {\"status\":\"ok\",\"value\":42}",
                },
            ],
            response_format={"type": "json_object"},
            extra_body={"thinking": {"type": "disabled"}},
        ),
        max_attempts=args.max_attempts,
    )
    validate_structured_response(response)
    print(
        json.dumps(
            {
                "status": "passed",
                "model": model,
                "baseUrl": base_url,
                "attempts": attempts,
                "structuredResponse": True,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ProviderPreflightError, ValueError) as error:
        print(json.dumps({"status": "failed", "error": str(error)}), file=os.sys.stderr)
        raise SystemExit(2)
