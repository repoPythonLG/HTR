from __future__ import annotations

import hashlib
import json
import mimetypes
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from fastapi import UploadFile

from app.core.config import settings


def ensure_storage_root() -> None:
    settings.storage_root.mkdir(parents=True, exist_ok=True)


def _imports_dir() -> Path:
    ensure_storage_root()
    target = settings.storage_root / "_imports"
    target.mkdir(parents=True, exist_ok=True)
    return target


def _active_import_metadata_path() -> Path:
    return _imports_dir() / "active_import.json"


def _sha256_bytes(content: bytes) -> str:
    digest = hashlib.sha256()
    digest.update(content)
    return digest.hexdigest()


def save_bytes(claim_id: str, file_name: str, content: bytes, mime_type: Optional[str] = None) -> Tuple[str, str, str]:
    ensure_storage_root()
    claim_dir = settings.storage_root / claim_id
    claim_dir.mkdir(parents=True, exist_ok=True)

    image_hash = _sha256_bytes(content)
    suffix = Path(file_name or "document").suffix
    safe_name = f"{image_hash[:12]}{suffix or '.bin'}"
    file_path = claim_dir / safe_name
    file_path.write_bytes(content)

    resolved_mime = mime_type or mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return str(file_path.resolve()), resolved_mime, image_hash


def save_upload(claim_id: str, upload: UploadFile) -> Tuple[str, str, str]:
    content = upload.file.read()
    return save_bytes(
        claim_id=claim_id,
        file_name=upload.filename or "document",
        content=content,
        mime_type=upload.content_type,
    )


def save_text_artifact(claim_id: str, file_name: str, text: str, mime_type: str = "text/plain") -> Tuple[str, str, str]:
    return save_bytes(claim_id=claim_id, file_name=file_name, content=text.encode("utf-8"), mime_type=mime_type)


def read_file_text(file_path: str) -> str:
    path = Path(file_path)
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def save_import_source(file_name: str, content: bytes, mime_type: Optional[str] = None) -> Tuple[str, str, str]:
    imports_dir = _imports_dir()
    image_hash = _sha256_bytes(content)
    suffix = Path(file_name or "claims_upload").suffix or ".bin"
    safe_name = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{image_hash[:12]}{suffix}"
    file_path = imports_dir / safe_name
    file_path.write_bytes(content)
    resolved_mime = mime_type or mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return str(file_path.resolve()), resolved_mime, image_hash


def set_active_import_metadata(metadata: Dict[str, Any]) -> None:
    path = _active_import_metadata_path()
    path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")


def get_active_import_metadata() -> Optional[Dict[str, Any]]:
    path = _active_import_metadata_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def delete_claim_storage(claim_id: str) -> None:
    ensure_storage_root()
    claim_dir = settings.storage_root / claim_id
    if claim_dir.exists() and claim_dir.is_dir():
        shutil.rmtree(claim_dir, ignore_errors=True)
