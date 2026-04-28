from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "AI Travel Expense Governance Platform"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./claims.db"
    storage_root: Path = Path("./data/uploads")
    model_version: str = "local-rules-1.0"
    llmhub_url: Optional[str] = None
    llmhub_api_key: Optional[str] = None

    model_config = {"protected_namespaces": ()}


settings = Settings()
