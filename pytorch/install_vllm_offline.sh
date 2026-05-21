#!/usr/bin/env bash
set -euo pipefail

WHEELHOUSE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIREMENTS="${WHEELHOUSE}/requirements-vllm-cu124.txt"
PYTHON_BIN="${PYTHON_BIN:-python3.10}"
VENV_DIR=""
REQUIRE_GPU="${REQUIRE_GPU:-0}"

usage() {
  cat <<'EOF'
Install vLLM from the local CUDA 12.4 wheelhouse.

Usage:
  ./install_vllm_offline.sh [--venv /path/to/venv] [--python /path/to/python]

Environment:
  PYTHON_BIN=python3.10   Python executable to use when --python is not passed.
  REQUIRE_GPU=1           Fail the final check if torch cannot see a CUDA GPU.

Examples:
  ./install_vllm_offline.sh --venv ./vllm-venv
  PYTHON_BIN=/usr/bin/python3.10 ./install_vllm_offline.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --venv)
      VENV_DIR="${2:-}"
      [[ -n "$VENV_DIR" ]] || { echo "--venv requires a path" >&2; exit 2; }
      shift 2
      ;;
    --python)
      PYTHON_BIN="${2:-}"
      [[ -n "$PYTHON_BIN" ]] || { echo "--python requires a Python executable" >&2; exit 2; }
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This wheelhouse is for Linux x86_64. Current OS: $(uname -s)" >&2
  exit 1
fi

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "This wheelhouse is for Linux x86_64. Current architecture: $(uname -m)" >&2
  exit 1
fi

if [[ ! -f "$REQUIREMENTS" ]]; then
  echo "Missing requirements file: $REQUIREMENTS" >&2
  exit 1
fi

if [[ -n "$VENV_DIR" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  PYTHON_BIN="${VENV_DIR%/}/bin/python"
fi

if [[ -f "${WHEELHOUSE}/chunk_manifest.json" ]]; then
  echo "Restoring any large wheels split for GitHub storage..."
  "$PYTHON_BIN" "${WHEELHOUSE}/restore_wheel_chunks.py"
fi

"$PYTHON_BIN" - <<'PY'
import platform
import sys

if sys.version_info < (3, 10):
    raise SystemExit("Python 3.10 or newer is required for this wheelhouse.")

libc_name, libc_version = platform.libc_ver()
if libc_name == "glibc" and libc_version:
    parts = tuple(int(part) for part in libc_version.split(".")[:2])
    if parts < (2, 28):
        raise SystemExit(
            f"glibc {libc_version} detected. xformers requires glibc 2.28 or newer."
        )
else:
    print(f"Warning: could not verify glibc version ({libc_name} {libc_version}).")
PY

echo "Using Python: $("$PYTHON_BIN" -c 'import sys; print(sys.executable)')"
echo "Installing pip tooling from local wheelhouse..."
"$PYTHON_BIN" -m pip install --no-index --find-links "$WHEELHOUSE" --upgrade pip setuptools wheel

echo "Installing vLLM CUDA 12.4 stack from local wheelhouse..."
"$PYTHON_BIN" -m pip install --no-index --find-links "$WHEELHOUSE" -r "$REQUIREMENTS"

echo "Running import and CUDA sanity check..."
"$PYTHON_BIN" - <<'PY'
import os
import torch
import vllm

print(f"torch: {torch.__version__}")
print(f"torch CUDA runtime: {torch.version.cuda}")
print(f"torch CUDA available: {torch.cuda.is_available()}")
print(f"vLLM: {getattr(vllm, '__version__', 'unknown')}")

if torch.version.cuda and not torch.version.cuda.startswith("12.4"):
    raise SystemExit(f"Expected CUDA 12.4 runtime, got {torch.version.cuda}")

if os.getenv("REQUIRE_GPU") == "1" and not torch.cuda.is_available():
    raise SystemExit("REQUIRE_GPU=1 but torch cannot see a CUDA GPU.")
PY

echo "Offline vLLM installation complete."
