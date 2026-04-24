# AI Receipt-to-Claim Discrepancy Detection Platform

Enterprise-style implementation based on:
`/Users/tomman/Desktop/AI_Receipt_to_Claim_Local_LLMHub_Complete_Specification.docx`

## Architecture
- Frontend: React + TypeScript + React Router
- Backend: FastAPI + SQLAlchemy
- Auth: JWT token login with role-based authorization
- Intake: Excel/CSV bulk hotel claims + manual document upload
- Analysis: deterministic policy engine + explainable detections + decomposable risk score

## Roles
- `employee`: own-claim visibility and upload
- `reviewer`: claims workbench, analyze, review decisions, executive dashboard
- `administrator`: reviewer access + policy rule management + user registry

## Default users (seeded on startup)
- `administrator@sabic.local` / `Admin#2026`
- `reviewer@sabic.local` / `Reviewer#2026`
- `employee@sabic.local` / `Employee#2026`

## Core features implemented
- Login screen and role-aware navigation shell
- Multi-view UI:
  - Executive Dashboard
  - Claims Workbench (suspicious claim highlighting)
  - Claim Analysis Window (findings/evidence/recommendations)
  - Employee View
  - Administrator Console
- Bulk Excel/CSV import endpoint for hotel claims
- Analyze button per claim that opens dedicated analysis view
- Statistics on suspicious/wrong claims and detection trends
- Policy engine + configurable thresholds/weights
- Full evidence-backed detection payloads and reviewer disposition flow

## Key APIs
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/claims/upload`
- `POST /api/v1/claims/import-excel`
- `GET /api/v1/claims`
- `POST /api/v1/claims/{id}/analyze`
- `GET /api/v1/claims/{id}/analysis`
- `POST /api/v1/claims/{id}/review-action`
- `GET /api/v1/dashboards/executive`
- `GET /api/v1/dashboards/employee`
- `GET /api/v1/admin/policy-rules`
- `POST /api/v1/admin/policy-rules`
- `GET /api/v1/admin/users`

## Run backend
```bash
cd /Users/tomman/TIDY/SABIC/HR/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Run frontend
```bash
cd /Users/tomman/TIDY/SABIC/HR/frontend
npm install --cache /tmp/npm-cache-hr
npm run dev
```

Frontend base URL for API defaults to: `http://localhost:8000/api/v1`

## Test
```bash
cd /Users/tomman/TIDY/SABIC/HR/backend
source .venv/bin/activate
pytest
```
