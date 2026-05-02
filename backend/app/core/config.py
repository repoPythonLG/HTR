from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional local runtime helper
    load_dotenv = None


if load_dotenv:
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class Settings(BaseModel):
    app_name: str = "AI Travel Expense Governance Platform"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./claims.db"
    storage_root: Path = Path("./data/uploads")
    model_version: str = "local-rules-1.0"
    llmhub_url: Optional[str] = None
    llmhub_api_key: Optional[str] = None
    chat_vllm_base_url: Optional[str] = (
        os.getenv("CHAT_VLLM_BASE_URL")
        or os.getenv("VLLM_BASE_URL")
        or os.getenv("QWEN_BASE_URL")
        or os.getenv("DASHSCOPE_BASE_URL")
        or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    )
    chat_vllm_api_key: Optional[str] = (
        os.getenv("CHAT_VLLM_API_KEY")
        or os.getenv("VLLM_API_KEY")
        or os.getenv("QWEN_API_KEY")
        or os.getenv("DASHSCOPE_API_KEY")
    )
    chat_vllm_model: str = (
        os.getenv("CHAT_VLLM_MODEL")
        or os.getenv("QWEN_MODEL")
        or os.getenv("DASHSCOPE_MODEL")
        or "qwen3-coder-next"
    )
    chat_vllm_temperature: float = float(os.getenv("CHAT_VLLM_TEMPERATURE", "0.2"))
    chat_vllm_timeout_seconds: float = float(os.getenv("CHAT_VLLM_TIMEOUT_SECONDS", "45"))

    model_config = {"protected_namespaces": ()}


settings = Settings()
