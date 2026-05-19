# Offline Deployment Notes

This application can run with all document extraction assets local. The only expected remote dependency is the configured OpenAI-compatible vLLM/Qwen endpoint used by the chat tab.

## Download extraction artifacts before disconnecting

Run this while internet is still available:

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
