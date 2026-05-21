# Offline vLLM CUDA 12.4 wheelhouse

This directory is an offline wheelhouse for installing vLLM with a CUDA 12.4
PyTorch stack on Linux x86_64.

Target runtime:

```text
Python: 3.10
OS: Linux x86_64
CUDA runtime wheels: 12.4
vLLM: 0.8.5
PyTorch: 2.6.0 / 2.6.0+cu124
```

Why vLLM `0.8.5`?

`vllm==0.8.5` pins `torch==2.6.0`, and PyTorch 2.6.0 is the CUDA 12.4
compatible torch line available for this stack. The user originally requested
PyTorch `2.11`; the official PyTorch CUDA 12.4 wheel index does not publish
`torch 2.11` or `torch 2.1.1` wheels.

The wheelhouse includes:

- `vllm==0.8.5`
- `torch==2.6.0` and the official `torch==2.6.0+cu124` wheel
- CUDA 12.4 NVIDIA runtime wheels
- `triton==3.2.0`
- `xformers==0.0.29.post2`
- pinned Hugging Face dependencies for vLLM-era compatibility
- pip, setuptools, and wheel for offline bootstrapping

Large wheels are stored in `pytorch/chunks/` as sub-100 MB files so the bundle
can be pushed to GitHub. `install_vllm_offline.sh` restores them automatically.

## Install offline

Copy the complete `pytorch/` directory to the target Linux machine, then run:

```bash
cd /path/to/project/pytorch
./install_vllm_offline.sh --venv /path/to/vllm-venv
```

Or install into the current Python environment:

```bash
cd /path/to/project/pytorch
PYTHON_BIN=python3.10 ./install_vllm_offline.sh
```

The installer uses only local wheels:

```bash
python -m pip install --no-index --find-links ./pytorch -r requirements-vllm-cu124.txt
```

If you want to restore the large wheels manually first:

```bash
cd /path/to/project/pytorch
python3.10 restore_wheel_chunks.py
```

## Important compatibility note

The `xformers==0.0.29.post2` wheel is tagged `manylinux_2_28_x86_64`, so the
target Linux environment should have glibc 2.28 or newer. The installer checks
this and warns clearly before installation.

## Files

- `requirements-vllm-cu124.txt` - pinned package list for the offline install.
- `install_vllm_offline.sh` - offline installation script.
- `restore_wheel_chunks.py` - rebuilds large wheels from `chunks/`.
- `chunk_manifest.json` - checksum map for large wheel chunks.
- `MANIFEST.json` - summary of the wheelhouse and original PyTorch request.
