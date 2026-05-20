# Offline Deployment Notes

This application can run with all document extraction assets local. The only expected remote dependency is the configured OpenAI-compatible vLLM/Qwen endpoint used by the chat tab.

## Self-contained model archive

The repository includes a split archive under:

```text
offline_models/
```

Each archive part is kept below GitHub's 100 MB normal-file limit. The manifest records the expected file sizes and SHA-256 hashes.

On startup, `start_app.py` checks whether `backend/data/models` contains the required Docling and EasyOCR files. If they are missing, it automatically runs:

```bash
python scripts/restore_offline_models.py
```

You can also restore manually:

```bash
python scripts/restore_offline_models.py --force
```

To verify the bundled chunks and restored model folder:

```bash
python scripts/restore_offline_models.py --verify-only
```

## Download extraction artifacts before disconnecting

If the bundled archive ever needs to be regenerated, run this while internet is still available:

```bash
python scripts/download_offline_models.py
```

This downloads Docling layout/tableformer artifacts and EasyOCR models into:

```text
backend/data/models/docling
backend/data/models/docling/EasyOcr
```

The downloader also writes:

```text
backend/data/models/offline_models_manifest.json
```

## Runtime environment

`start_app.py` sets these defaults for the backend automatically:

```bash
OFFLINE_MODEL_ROOT=<repo>/backend/data/models
DOCLING_ARTIFACTS_PATH=<repo>/backend/data/models/docling
EASYOCR_MODEL_DIR=<repo>/backend/data/models/docling/EasyOcr
EXTRACTION_DOWNLOAD_ENABLED=false
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
```

If you run FastAPI manually, set the same variables before starting `uvicorn`.

## Chat model

The chat LLM can remain remote through vLLM or any OpenAI-compatible endpoint. Configure it separately:

```bash
CHAT_VLLM_BASE_URL=https://your-vllm-or-qwen-endpoint/v1
CHAT_VLLM_MODEL=qwen3-coder-next
CHAT_VLLM_API_KEY=<key>
```

No local LLM weights are required unless you choose to run vLLM locally.
