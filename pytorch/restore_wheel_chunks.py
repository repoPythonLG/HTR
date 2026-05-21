#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "chunk_manifest.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Missing chunk manifest: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
        raise ValueError(f"Invalid chunk manifest: {path}")
    return data


def restore_entry(entry: dict[str, Any], *, force: bool) -> bool:
    output = ROOT / str(entry["file"])
    expected_sha = str(entry["sha256"])
    expected_bytes = int(entry["bytes"])

    if output.exists() and not force:
        if output.stat().st_size == expected_bytes and sha256_file(output) == expected_sha:
            print(f"ok: {output.name}")
            return False
        raise RuntimeError(
            f"{output.name} exists but does not match chunk_manifest.json. "
            "Run with --force to rebuild it."
        )

    tmp_output = output.with_suffix(output.suffix + ".tmp")
    with tmp_output.open("wb") as target:
        for part in entry["parts"]:
            part_path = ROOT / str(part["file"])
            if not part_path.exists():
                raise FileNotFoundError(f"Missing chunk: {part_path}")
            if part_path.stat().st_size != int(part["bytes"]):
                raise RuntimeError(f"Chunk has wrong size: {part_path}")
            if sha256_file(part_path) != str(part["sha256"]):
                raise RuntimeError(f"Chunk checksum failed: {part_path}")
            with part_path.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    target.write(chunk)

    if tmp_output.stat().st_size != expected_bytes:
        tmp_output.unlink(missing_ok=True)
        raise RuntimeError(f"Restored wheel has wrong size: {output.name}")
    if sha256_file(tmp_output) != expected_sha:
        tmp_output.unlink(missing_ok=True)
        raise RuntimeError(f"Restored wheel checksum failed: {output.name}")
    tmp_output.replace(output)
    print(f"restored: {output.name}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore large vLLM wheelhouse files.")
    parser.add_argument("--force", action="store_true", help="Rebuild wheels even if present.")
    args = parser.parse_args()

    manifest = load_manifest(MANIFEST)
    restored = 0
    for entry in manifest["entries"]:
        if restore_entry(entry, force=args.force):
            restored += 1
    print(f"Large wheel restore complete. Rebuilt {restored} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
