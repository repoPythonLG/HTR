#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tarfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_DIR = ROOT / "offline_models"
MANIFEST_PATH = ARCHIVE_DIR / "MANIFEST.json"
DEFAULT_TARGET = ROOT / "backend" / "data" / "models"

REQUIRED_RELATIVE_FILES = [
    "docling/ds4sd--docling-models/model_artifacts/layout/model.safetensors",
    "docling/ds4sd--docling-models/model_artifacts/tableformer/accurate/tableformer_accurate.safetensors",
    "docling/ds4sd--docling-models/model_artifacts/tableformer/fast/tableformer_fast.safetensors",
    "docling/EasyOcr/craft_mlt_25k.pth",
    "docling/EasyOcr/english_g2.pth",
    "docling/EasyOcr/latin_g2.pth",
]


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"Offline model manifest not found: {MANIFEST_PATH}")
    with MANIFEST_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict) or not isinstance(data.get("parts"), list):
        raise ValueError(f"Invalid offline model manifest: {MANIFEST_PATH}")
    return data


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_parts(manifest: dict[str, Any]) -> list[Path]:
    parts: list[Path] = []
    for part in manifest["parts"]:
        part_name = str(part["file"])
        part_path = ARCHIVE_DIR / part_name
        if not part_path.exists():
            raise FileNotFoundError(f"Offline model archive part is missing: {part_path}")
        expected_size = int(part["bytes"])
        actual_size = part_path.stat().st_size
        if actual_size != expected_size:
            raise RuntimeError(f"Size mismatch for {part_path.name}: expected {expected_size}, got {actual_size}")
        expected_hash = str(part["sha256"])
        actual_hash = sha256_file(part_path)
        if actual_hash != expected_hash:
            raise RuntimeError(f"SHA-256 mismatch for {part_path.name}: expected {expected_hash}, got {actual_hash}")
        parts.append(part_path)
    return parts


def models_ready(target: Path) -> bool:
    return all((target / relative_path).exists() for relative_path in REQUIRED_RELATIVE_FILES)


def safe_extract(archive_path: Path, destination: Path) -> None:
    destination = destination.resolve()
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            member_path = (destination / member.name).resolve()
            if destination != member_path and destination not in member_path.parents:
                raise RuntimeError(f"Unsafe archive path blocked: {member.name}")
        archive.extractall(destination)


def restore(target: Path, force: bool = False) -> None:
    target = target.resolve()
    if models_ready(target) and not force:
        print(f"Offline extraction models already available at {target}", flush=True)
        return

    manifest = load_manifest()
    parts = verify_parts(manifest)
    target.parent.mkdir(parents=True, exist_ok=True)

    temp_archive = ARCHIVE_DIR / str(manifest.get("archive", "travel_expenses_guard_offline_models.tar.gz"))
    print(f"Reassembling offline model archive from {len(parts)} parts...", flush=True)
    with temp_archive.open("wb") as output:
        for part_path in parts:
            with part_path.open("rb") as part:
                shutil.copyfileobj(part, output, length=1024 * 1024)

    try:
        if force and target.exists():
            shutil.rmtree(target)
        print(f"Extracting offline models to {target.parent}...", flush=True)
        safe_extract(temp_archive, target.parent)
        if not models_ready(target):
            missing = [relative for relative in REQUIRED_RELATIVE_FILES if not (target / relative).exists()]
            raise RuntimeError("Offline model restore completed but required files are missing: " + ", ".join(missing))
    finally:
        temp_archive.unlink(missing_ok=True)

    print(f"Offline extraction models restored to {target}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore bundled offline Docling and EasyOCR model artifacts.")
    parser.add_argument("--target", default=str(DEFAULT_TARGET), help="Target model directory. Defaults to backend/data/models.")
    parser.add_argument("--force", action="store_true", help="Replace the existing target model directory.")
    parser.add_argument("--verify-only", action="store_true", help="Verify archive chunks and restored model files without extracting.")
    args = parser.parse_args()

    target = Path(args.target).expanduser()
    if not target.is_absolute():
        target = ROOT / target

    manifest = load_manifest()
    verify_parts(manifest)
    if args.verify_only:
        if not models_ready(target):
            raise RuntimeError(f"Archive parts are valid, but restored models are not present at {target}")
        print(f"Offline archive chunks and restored model files are valid at {target}", flush=True)
        return 0

    restore(target, force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
