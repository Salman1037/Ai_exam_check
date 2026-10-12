import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from google import genai
from google.genai import errors, types

from app.config import Settings
from app.grading import check_paper


def config():
    return Settings(
        supabase_url="https://example.test",
        supabase_service_role_key="test",
        gemini_api_key="test",
    )


def valid_result():
    return json.dumps(
        {
            "subject": "Math",
            "results": [
                {
                    "q": 1,
                    "question": "2+2?",
                    "student_answer": "4",
                    "correct_answer": "4",
                    "marks": 1,
                    "out_of": 1,
                    "reason": "Correct",
                    "confidence": "high",
                }
            ],
        }
    )


def mock_client(responses):
    generate = AsyncMock(side_effect=responses)
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    context = AsyncMock()
    context.__aenter__.return_value = client
    return SimpleNamespace(aio=context), generate


async def test_invalid_json_retries_twice():
    client, generate = mock_client([SimpleNamespace(text="bad JSON")] * 3)
    with (
        patch("app.grading.genai.Client", return_value=client),
        pytest.raises(ValueError, match="complete results"),
    ):
        await check_paper(b"image", "image/jpeg", config())
    assert generate.await_count == 3


async def test_rate_limit_backoff_then_success():
    client, generate = mock_client(
        [
            errors.ClientError(429, {"error": {"message": "quota"}}),
            SimpleNamespace(text=valid_result()),
        ]
    )
    with (
        patch("app.grading.genai.Client", return_value=client),
        patch("app.grading.asyncio.sleep", new_callable=AsyncMock) as sleep,
    ):
        result = await check_paper(b"image", "image/jpeg", config())
    assert generate.await_count == 2
    assert sleep.await_args.args[0] >= 2
    assert result["total"] == 1


async def test_cancellation_propagates():
    client, _ = mock_client([asyncio.CancelledError()])
    with (
        patch("app.grading.genai.Client", return_value=client),
        pytest.raises(asyncio.CancelledError),
    ):
        await check_paper(b"image", "image/jpeg", config())


async def test_real_sdk_serializes_grading_schema():
    # Mock only HTTP so the SDK's schema conversion still executes. Mocking
    # generate_content itself would miss unsupported Pydantic constraints.
    client = genai.Client(api_key="test-only", vertexai=False)
    response = types.HttpResponse(
        headers={"content-type": "application/json"},
        body=json.dumps(
            {
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [{"text": valid_result()}],
                        },
                        "finishReason": "STOP",
                    }
                ]
            }
        ),
    )
    with (
        patch("app.grading.genai.Client", return_value=client),
        patch.object(
            client._api_client,
            "async_request",
            new_callable=AsyncMock,
            return_value=response,
        ) as request,
    ):
        result = await check_paper(b"image", "image/jpeg", config())
    assert result["total"] == 1
    request.assert_awaited_once()
    assert "exclusiveMinimum" not in str(request.call_args)
