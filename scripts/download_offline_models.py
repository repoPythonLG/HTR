#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOCLING_DIR = ROOT / "backend" / "data" / "models" / "docling"


def backend_python() -> Path:
    venv_python = ROOT / "backend" / ".venv" / "bin" / "python"
    return venv_python if venv_python.exists() else Path(sys.executable)


def run(command: list[str], cwd: Path | None = None) -> None:
    print("$ " + " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd or ROOT, check=True)


def validate(docling_dir: Path) -> dict[str, object]:
    easyocr_dir = docling_dir / "EasyOcr"
    docling_models_dir = docling_dir / "ds4sd--docling-models"
    required_paths = {
        "docling_artifacts": docling_dir,
        "docling_models": docling_models_dir,
        "easyocr_models": easyocr_dir,
    }
    missing = [name for name, path in required_paths.items() if not path.exists()]
    if missing:
        raise RuntimeError("Missing downloaded artifact directories: " + ", ".join(missing))

    model_files = sorted(path.relative_to(docling_dir).as_posix() for path in docling_dir.rglob("*.pth"))
    if not model_files:
        raise RuntimeError(f"No EasyOCR .pth model files found under {easyocr_dir}")

    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "docling_artifacts_path": str(docling_dir.resolve()),
        "easyocr_model_dir": str(easyocr_dir.resolve()),
        "runtime_env": {
            "DOCLING_ARTIFACTS_PATH": str(docling_dir.resolve()),
            "EASYOCR_MODEL_DIR": str(easyocr_dir.resolve()),
            "EXTRACTION_DOWNLOAD_ENABLED": "false",
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
        },
        "easyocr_model_files": model_files,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download Docling and EasyOCR artifacts needed for offline receipt extraction."
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_DOCLING_DIR),
        help="Where Docling artifacts should be stored. Defaults to backend/data/models/docling.",
    )
    parser.add_argument("--force", action="store_true", help="Force re-download of artifacts.")
    args = parser.parse_args()

    docling_dir = Path(args.output_dir).expanduser()
    if not docling_dir.is_absolute():
        docling_dir = ROOT / docling_dir
    docling_dir.mkdir(parents=True, exist_ok=True)

    command = [
        str(backend_python()),
        "-m",
        "docling.cli.models",
        "-o",
        str(docling_dir),
    ]
    if args.force:
        command.append("--force")
    command.extend(["layout", "tableformer", "easyocr"])
    run(command)

    manifest = validate(docling_dir)
    manifest_path = docling_dir.parent / "offline_models_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Offline model manifest written to {manifest_path}", flush=True)
    print("Offline extraction artifacts are ready.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
