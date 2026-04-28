from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


SYSTEM_PROMPT = (
    "You are a compliance explanation assistant. Use only provided facts. "
    "Separate facts from inference. Return concise JSON with keys: reason, reviewer_guidance."
)


def _fallback_reason(detection: dict[str, Any]) -> tuple[str, str]:
    reason = detection["human_readable_reason"]
    guidance = f"Recommended action: {detection['recommended_action']}. Validate source evidence before decision."
    return reason, guidance


def generate_grounded_explanation(detection: dict[str, Any]) -> dict[str, Any]:
    if not settings.llmhub_url:
        reason, guidance = _fallback_reason(detection)
        return {
            "reason": reason,
            "reviewer_guidance": guidance,
            "mode": "deterministic",
        }

    payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": {
                    "detection_type": detection["detection_type"],
                    "facts": detection["supporting_facts"],
                    "policy_reference": detection.get("policy_reference"),
                },
            },
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    headers = {"Content-Type": "application/json"}
    if settings.llmhub_api_key:
        headers["Authorization"] = f"Bearer {settings.llmhub_api_key}"

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(settings.llmhub_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            message = data.get("choices", [{}])[0].get("message", {}).get("content")
            if isinstance(message, dict):
                return {
                    "reason": message.get("reason") or detection["human_readable_reason"],
                    "reviewer_guidance": message.get("reviewer_guidance") or detection["recommended_action"],
                    "mode": "llmhub",
                }
    except Exception:
        pass

    reason, guidance = _fallback_reason(detection)
    return {
        "reason": reason,
        "reviewer_guidance": guidance,
        "mode": "deterministic_fallback",
    }
