from __future__ import annotations

import html
import math
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.database import get_db
from app.models import Claim, Detection, ExtractedField, PolicyRule, ReceiptDocument, ReviewerDecision, RiskAssessment, User
from app.schemas import (
    AnalyzeResponse,
    ClaimAnalysisOut,
    ClaimDetailOut,
    ClaimSummaryOut,
    EmployeeDashboardOut,
    EmployeeRiskDashboardOut,
    EmployeeRiskProfileOut,
    ExcelImportResponse,
    ExecutiveDashboardOut,
    ActiveImportOut,
    OutlierClusterSummaryOut,
    OutlierMapDashboardOut,
    OutlierMapPointOut,
    OutlierMetricOptionOut,
    PolicyExtractionResponse,
    PolicyRuleIn,
    PolicyRuleOut,
    RiskSettingsIn,
    RiskSettingsOut,
    ReviewActionIn,
    SpreadsheetPreviewOut,
    TokenOut,
    UploadResponse,
    UserOut,
)
from app.services.analysis import analyze_claim
from app.services.auth import authenticate_user, create_access_token, get_current_user, require_roles
from app.services.excel_import import parse_claim_rows, parse_spreadsheet_preview
from app.services.policy import (
    extract_rules_from_policy_text,
    get_location_cost_factor,
    get_risk_detection_mode,
    get_rule_threshold,
    risk_detection_mode_to_code,
)
from app.services.storage import (
    delete_claim_storage,
    get_active_import_metadata,
    save_import_source,
    save_text_artifact,
    save_upload,
    set_active_import_metadata,
)

router = APIRouter()


def _enforce_employee_claim_scope(current_user: User, claim: Claim) -> None:
    if current_user.role != "employee":
        return
    if not current_user.employee_code or claim.employee_id != current_user.employee_code:
        raise HTTPException(status_code=403, detail="You can only access your own claims")


def _sample_file_path() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "templates" / "sabic_claims_example_1000.xlsx"


def _active_import_out_or_404() -> ActiveImportOut:
    metadata = get_active_import_metadata()
    if not metadata:
        raise HTTPException(status_code=404, detail="No active imported spreadsheet found")
    try:
        uploaded_at = datetime.fromisoformat(str(metadata["uploaded_at"]))
    except Exception:
        uploaded_at = datetime.utcnow()
    return ActiveImportOut(
        file_name=str(metadata.get("file_name") or "uploaded_file"),
        uploaded_at=uploaded_at,
        uploaded_by=metadata.get("uploaded_by"),
        row_count=int(metadata.get("row_count") or 0),
        analyzed_count=int(metadata.get("analyzed_count") or 0),
        error_count=int(metadata.get("error_count") or 0),
        file_path=metadata.get("file_path"),
    )


def _build_summary_rows(db: Session, claims: List[Claim]) -> List[ClaimSummaryOut]:
    if not claims:
        return []

    claim_ids = [claim.claim_id for claim in claims]
    risk_rows = db.execute(select(RiskAssessment).where(RiskAssessment.claim_id.in_(claim_ids))).scalars().all()
    risk_map = {item.claim_id: item for item in risk_rows}

    detection_counts = {
        row[0]: row[1]
        for row in db.execute(
            select(Detection.claim_id, func.count())
            .where(Detection.claim_id.in_(claim_ids))
            .group_by(Detection.claim_id)
        ).all()
    }

    output: List[ClaimSummaryOut] = []
    for claim in claims:
        risk = risk_map.get(claim.claim_id)
        output.append(
            ClaimSummaryOut(
                claim_id=claim.claim_id,
                employee_id=claim.employee_id,
                employee_name=claim.employee_name,
                department=claim.department,
                trip_number=claim.trip_number,
                trip_activity=claim.trip_activity,
                trip_boundary=claim.trip_boundary,
                expense_type=claim.expense_type,
                to_country=claim.to_country,
                masked_id=claim.masked_id,
                trip_duration_days=claim.trip_duration_days,
                destination_city=claim.destination_city,
                claim_total=claim.claim_total,
                currency=claim.currency,
                status=claim.status,
                created_at=claim.created_at,
                source_type=claim.source_type,
                suspicious_flag=claim.suspicious_flag,
                incorrect_flag=claim.incorrect_flag,
                risk_level=risk.risk_level if risk else None,
                risk_score=risk.risk_score if risk else claim.risk_score_cached,
                primary_red_flag=risk.primary_red_flag if risk else None,
                detection_count=int(detection_counts.get(claim.claim_id, 0)),
            )
        )
    return output


@router.post("/auth/login", response_model=TokenOut)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": user.username, "role": user.role})
    return TokenOut(
        access_token=token,
        token_type="bearer",
        username=user.username,
        role=user.role,
    )


@router.get("/auth/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/claims/upload", response_model=UploadResponse)
def upload_claim(
    employee_id: str = Form(...),
    employee_name: str = Form(...),
    department: str = Form("Unknown"),
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
    destination_city: Optional[str] = Form(None),
    claim_total: float = Form(0.0),
    currency: str = Form("SAR"),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    if current_user.role == "employee" and current_user.employee_code and employee_id != current_user.employee_code:
        raise HTTPException(status_code=403, detail="Employees can upload only their own claims")

    claim = Claim(
        employee_id=employee_id,
        employee_name=employee_name,
        department=department,
        start_date=date.fromisoformat(start_date) if start_date else None,
        end_date=date.fromisoformat(end_date) if end_date else None,
        destination_city=destination_city,
        claim_total=claim_total,
        currency=currency,
        status="uploaded",
        source_type="document_upload",
        submitted_by_user_id=current_user.user_id,
    )
    db.add(claim)
    db.flush()

    uploaded_count = 0
    for file in files:
        file_path, mime_type, image_hash = save_upload(claim.claim_id, file)
        db.add(
            ReceiptDocument(
                claim_id=claim.claim_id,
                file_name=file.filename or "document",
                file_path=file_path,
                mime_type=mime_type,
                image_hash=image_hash,
            )
        )
        uploaded_count += 1

    db.commit()
    return UploadResponse(claim_id=claim.claim_id, status=claim.status, document_count=uploaded_count)


@router.post("/claims/import-excel", response_model=ExcelImportResponse)
def import_excel_claims(
    file: UploadFile = File(...),
    auto_analyze: bool = Form(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer", "administrator")),
):
    content = file.file.read()
    source_name = file.filename or "claims.xlsx"
    records, errors = parse_claim_rows(source_name, content)
    if not records:
        return ExcelImportResponse(
            imported_claims=0,
            analyzed_claims=0,
            skipped_rows=max(0, len(errors)),
            errors=errors or ["No valid rows found in uploaded spreadsheet."],
            claim_ids=[],
        )

    source_file_path, source_mime_type, source_hash = save_import_source(
        file_name=source_name,
        content=content,
        mime_type=file.content_type,
    )

    existing_excel_claims = db.execute(select(Claim).where(Claim.source_type == "excel_import")).scalars().all()
    stale_claim_ids = [item.claim_id for item in existing_excel_claims]
    for old_claim in existing_excel_claims:
        db.delete(old_claim)
    db.commit()
    for claim_id in stale_claim_ids:
        delete_claim_storage(claim_id)

    imported = 0
    analyzed = 0
    claim_ids: List[str] = []

    for record in records:
        claim_payload = record["claim"]
        document_payload = record["document"]

        try:
            claim = Claim(
                employee_id=claim_payload["employee_id"],
                employee_name=claim_payload["employee_name"],
                department=claim_payload["department"],
                start_date=date.fromisoformat(claim_payload["start_date"]) if claim_payload.get("start_date") else None,
                end_date=date.fromisoformat(claim_payload["end_date"]) if claim_payload.get("end_date") else None,
                trip_settlement_date=date.fromisoformat(claim_payload["trip_settlement_date"]) if claim_payload.get("trip_settlement_date") else None,
                trip_number=claim_payload.get("trip_number"),
                from_region=claim_payload.get("from_region"),
                from_country=claim_payload.get("from_country"),
                from_city=claim_payload.get("from_city"),
                to_region=claim_payload.get("to_region"),
                to_country=claim_payload.get("to_country"),
                to_city=claim_payload.get("to_city"),
                trip_activity=claim_payload.get("trip_activity"),
                trip_boundary=claim_payload.get("trip_boundary"),
                expense_type=claim_payload.get("expense_type"),
                masked_id=claim_payload.get("masked_id"),
                trip_duration_days=claim_payload.get("trip_duration_days"),
                destination_city=claim_payload.get("destination_city"),
                claim_total=claim_payload.get("claim_total", 0.0),
                currency=claim_payload.get("currency", "SAR"),
                status="uploaded",
                source_type="excel_import",
                source_reference=claim_payload.get("source_reference"),
                submitted_by_user_id=current_user.user_id,
            )
            db.add(claim)
            db.flush()

            file_path, mime_type, image_hash = save_text_artifact(
                claim_id=claim.claim_id,
                file_name=document_payload["file_name"],
                text=document_payload["text"],
                mime_type=document_payload["mime_type"],
            )

            document = ReceiptDocument(
                claim_id=claim.claim_id,
                file_name=document_payload["file_name"],
                file_path=file_path,
                mime_type=mime_type,
                image_hash=image_hash,
                extracted_text=document_payload["text"],
                document_type=document_payload["document_type"],
                page_count=1,
            )
            db.add(document)
            db.flush()

            for field in document_payload["fields"]:
                db.add(
                    ExtractedField(
                        document_id=document.document_id,
                        name=field["name"],
                        value=field["value"],
                        normalized_value=field["normalized_value"],
                        confidence=field["confidence"],
                        page_no=1,
                        bbox=None,
                    )
                )

            db.commit()
            imported += 1
            claim_ids.append(claim.claim_id)

            if auto_analyze:
                analyze_claim(db, claim.claim_id)
                analyzed += 1

        except Exception as exc:
            db.rollback()
            errors.append(f"{claim_payload.get('source_reference', 'unknown row')}: {exc}")

    set_active_import_metadata(
        {
            "file_name": source_name,
            "file_path": source_file_path,
            "mime_type": source_mime_type,
            "file_hash": source_hash,
            "uploaded_at": datetime.utcnow().isoformat(),
            "uploaded_by": current_user.username,
            "row_count": imported,
            "analyzed_count": analyzed,
            "error_count": len(errors),
            "claim_ids": claim_ids,
        }
    )

    return ExcelImportResponse(
        imported_claims=imported,
        analyzed_claims=analyzed,
        skipped_rows=max(0, len(errors)),
        errors=errors,
        claim_ids=claim_ids,
    )


def _load_active_spreadsheet_preview(max_rows: int = 5000) -> SpreadsheetPreviewOut:
    active_import = _active_import_out_or_404()
    if not active_import.file_path:
        raise HTTPException(status_code=404, detail="Active spreadsheet file path is missing")
    source_path = Path(active_import.file_path)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Active spreadsheet file is missing")

    content = source_path.read_bytes()
    columns, rows = parse_spreadsheet_preview(active_import.file_name, content, max_rows=max_rows)
    return SpreadsheetPreviewOut(
        file_name=active_import.file_name,
        columns=columns,
        rows=rows,
        total_rows=len(rows),
    )


@router.get("/imports/active", response_model=ActiveImportOut)
def active_import_info(
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    return _active_import_out_or_404()


@router.get("/imports/active/preview", response_model=SpreadsheetPreviewOut)
def active_import_preview(
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    return _load_active_spreadsheet_preview()


@router.get("/imports/active/view", response_class=HTMLResponse)
def active_import_view_html(
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    preview = _load_active_spreadsheet_preview()
    if not preview.columns:
        return HTMLResponse("<h2>No spreadsheet rows to display.</h2>", status_code=200)

    header_html = "".join(f"<th>{html.escape(col)}</th>" for col in preview.columns)
    body_rows = []
    for row in preview.rows:
        cells = "".join(f"<td>{html.escape(cell)}</td>" for cell in row)
        body_rows.append(f"<tr>{cells}</tr>")
    body_html = "".join(body_rows)

    page = f"""
<!doctype html>
<html lang='en'>
<head>
  <meta charset='UTF-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>{html.escape(preview.file_name)} - Spreadsheet Preview</title>
  <style>
    body {{ font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 0; background: #f3f7fe; color: #1a2b44; }}
    .wrap {{ padding: 20px; }}
    .meta {{ background: white; border: 1px solid #d4e0f2; border-radius: 12px; padding: 14px; margin-bottom: 14px; }}
    .table-wrap {{ overflow: auto; max-height: calc(100vh - 130px); border: 1px solid #d4e0f2; border-radius: 12px; background: white; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
    th, td {{ border-bottom: 1px solid #e8eef8; padding: 8px; text-align: left; white-space: nowrap; }}
    th {{ position: sticky; top: 0; background: #ebf2ff; z-index: 1; }}
    tr:nth-child(even) td {{ background: #fcfdff; }}
  </style>
</head>
<body>
  <div class='wrap'>
    <div class='meta'>
      <strong>{html.escape(preview.file_name)}</strong><br/>
      Rows shown: {preview.total_rows}
    </div>
    <div class='table-wrap'>
      <table>
        <thead><tr>{header_html}</tr></thead>
        <tbody>{body_html}</tbody>
      </table>
    </div>
  </div>
</body>
</html>
"""
    return HTMLResponse(content=page, status_code=200)


@router.get("/imports/sample-file")
def download_sample_file(
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    path = _sample_file_path()
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sample file not found")
    return FileResponse(
        path=path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=path.name,
    )


@router.post("/claims/{claim_id}/analyze", response_model=AnalyzeResponse)
def analyze(
    claim_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    claim_ref = db.execute(select(Claim).where(Claim.claim_id == claim_id)).scalars().first()
    if not claim_ref:
        raise HTTPException(status_code=404, detail="Claim not found")
    _enforce_employee_claim_scope(current_user, claim_ref)

    try:
        claim, detection_count, risk_score, risk_level = analyze_claim(db, claim_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Claim not found")

    return AnalyzeResponse(
        claim_id=claim.claim_id,
        status=claim.status,
        detection_count=detection_count,
        risk_score=risk_score,
        risk_level=risk_level,
    )


@router.get("/claims", response_model=List[ClaimSummaryOut])
def list_claims(
    status: Optional[str] = None,
    suspicious_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    stmt = select(Claim).order_by(Claim.created_at.desc())
    if status:
        stmt = stmt.where(Claim.status == status)
    if suspicious_only:
        stmt = stmt.where(Claim.suspicious_flag.is_(True))

    if current_user.role == "employee" and current_user.employee_code:
        stmt = stmt.where(Claim.employee_id == current_user.employee_code)

    claims = db.execute(stmt).scalars().all()
    return _build_summary_rows(db, claims)


@router.get("/claims/{claim_id}", response_model=ClaimDetailOut)
def get_claim(
    claim_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    claim = (
        db.execute(
            select(Claim)
            .options(
                joinedload(Claim.documents).joinedload(ReceiptDocument.extracted_fields),
                joinedload(Claim.detections),
                joinedload(Claim.risk_assessment),
                joinedload(Claim.reviewer_decisions),
            )
            .where(Claim.claim_id == claim_id)
        )
        .unique()
        .scalars()
        .first()
    )
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    _enforce_employee_claim_scope(current_user, claim)
    return claim


@router.get("/claims/{claim_id}/analysis", response_model=ClaimAnalysisOut)
def claim_analysis_view(
    claim_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    claim = (
        db.execute(
            select(Claim)
            .options(joinedload(Claim.detections), joinedload(Claim.risk_assessment))
            .where(Claim.claim_id == claim_id)
        )
        .unique()
        .scalars()
        .first()
    )

    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    _enforce_employee_claim_scope(current_user, claim)

    if not claim.risk_assessment:
        raise HTTPException(status_code=409, detail="Claim has not been analyzed yet")

    findings = [
        {
            "detection_type": item.detection_type,
            "severity": item.severity,
            "reason": item.human_readable_reason,
            "policy_reference": item.policy_reference,
            "recommended_action": item.recommended_action,
            "risk_weight": item.risk_weight,
        }
        for item in claim.detections
    ]

    evidence_summary = [
        {
            "detection_type": item.detection_type,
            "supporting_facts": item.supporting_facts,
            "source_references": item.source_references,
        }
        for item in claim.detections
    ]

    recommendations = sorted({item.recommended_action for item in claim.detections})

    return ClaimAnalysisOut(
        claim_id=claim.claim_id,
        employee_name=claim.employee_name,
        risk_level=claim.risk_assessment.risk_level,
        risk_score=claim.risk_assessment.risk_score,
        suspicious_flag=claim.suspicious_flag,
        incorrect_flag=claim.incorrect_flag,
        primary_red_flag=claim.risk_assessment.primary_red_flag,
        findings=findings,
        evidence_summary=evidence_summary,
        recommendations=recommendations,
    )


@router.get("/claims/{claim_id}/documents/{document_id}")
def get_document(
    claim_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    claim = db.execute(select(Claim).where(Claim.claim_id == claim_id)).scalars().first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    _enforce_employee_claim_scope(current_user, claim)

    document = (
        db.execute(
            select(ReceiptDocument).where(
                ReceiptDocument.claim_id == claim_id,
                ReceiptDocument.document_id == document_id,
            )
        )
        .scalars()
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    path = Path(document.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Document file missing")
    return FileResponse(path=path, media_type=document.mime_type, filename=document.file_name)


@router.post("/claims/{claim_id}/review-action")
def review_action(
    claim_id: str,
    payload: ReviewActionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer", "administrator")),
):
    claim = db.execute(select(Claim).where(Claim.claim_id == claim_id)).scalars().first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    decision = ReviewerDecision(
        claim_id=claim_id,
        reviewer_id=payload.reviewer_id,
        status=payload.status,
        notes=payload.notes,
        disposition_reason=payload.disposition_reason,
    )
    db.add(decision)

    status_text = payload.status.lower()
    if status_text in {"escalated", "escalate"}:
        claim.status = "escalated"
        claim.suspicious_flag = True
    elif status_text in {"approved", "dismissed", "completed"}:
        claim.status = "reviewed"
    else:
        claim.status = "under_review"

    db.commit()
    db.refresh(decision)
    return {
        "decision_id": decision.decision_id,
        "claim_id": claim_id,
        "claim_status": claim.status,
        "status": decision.status,
    }


@router.get("/dashboards/executive", response_model=ExecutiveDashboardOut)
def executive_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer", "administrator")),
):
    total_claims = db.execute(select(func.count()).select_from(Claim)).scalar_one()
    analyzed_claims = db.execute(
        select(func.count()).select_from(Claim).where(Claim.status.in_(["analyzed", "under_review", "reviewed", "escalated"]))
    ).scalar_one()
    suspicious_claims = db.execute(select(func.count()).select_from(Claim).where(Claim.suspicious_flag.is_(True))).scalar_one()
    wrong_claims = db.execute(select(func.count()).select_from(Claim).where(Claim.incorrect_flag.is_(True))).scalar_one()

    risk_rows = db.execute(
        select(RiskAssessment.risk_level, func.count()).group_by(RiskAssessment.risk_level)
    ).all()
    by_risk_level = {row[0]: row[1] for row in risk_rows}

    dept_rows = db.execute(select(Claim.department, func.count()).group_by(Claim.department)).all()
    by_department = {row[0]: row[1] for row in dept_rows}

    detection_rows = db.execute(
        select(Detection.detection_type, func.count())
        .group_by(Detection.detection_type)
        .order_by(func.count().desc())
        .limit(10)
    ).all()
    top_detection_types = [{"detection_type": row[0], "count": row[1]} for row in detection_rows]

    suspicious_rate = (suspicious_claims / total_claims * 100.0) if total_claims else 0.0
    wrong_rate = (wrong_claims / total_claims * 100.0) if total_claims else 0.0

    return ExecutiveDashboardOut(
        total_claims=total_claims,
        analyzed_claims=analyzed_claims,
        suspicious_claims=suspicious_claims,
        wrong_claims=wrong_claims,
        suspicious_rate_pct=round(suspicious_rate, 2),
        wrong_claim_rate_pct=round(wrong_rate, 2),
        by_risk_level=by_risk_level,
        by_department=by_department,
        top_detection_types=top_detection_types,
    )


@router.get("/dashboards/employee", response_model=EmployeeDashboardOut)
def employee_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("employee", "reviewer", "administrator")),
):
    employee_id = current_user.employee_code
    if not employee_id:
        raise HTTPException(status_code=400, detail="Current user has no employee code assigned")

    base = select(Claim).where(Claim.employee_id == employee_id)
    claims = db.execute(base.order_by(Claim.created_at.desc())).scalars().all()

    total_claims = len(claims)
    pending_claims = len([item for item in claims if item.status in {"uploaded", "under_review"}])
    analyzed_claims = len([item for item in claims if item.status in {"analyzed", "reviewed", "escalated"}])
    suspicious_claims = len([item for item in claims if item.suspicious_flag])

    return EmployeeDashboardOut(
        employee_id=employee_id,
        total_claims=total_claims,
        pending_claims=pending_claims,
        analyzed_claims=analyzed_claims,
        suspicious_claims=suspicious_claims,
        recent_claims=_build_summary_rows(db, claims[:5]),
    )


def _safe_pct(part: int, total: int) -> float:
    if not total:
        return 0.0
    return round((part / total) * 100.0, 2)


def _employee_risk_level(
    *,
    avg_risk_score: float,
    max_risk_score: float,
    suspicious_rate_pct: float,
    incorrect_claims: int,
    flagged_claims: int,
) -> str:
    if incorrect_claims > 0 or max_risk_score >= 60:
        return "Critical"
    if max_risk_score >= 40 or suspicious_rate_pct >= 45:
        return "High"
    if flagged_claims > 0 or avg_risk_score >= 12:
        return "Medium"
    return "Low"


def _employee_risk_index(
    *,
    avg_risk_score: float,
    suspicious_rate_pct: float,
    incorrect_rate_pct: float,
    violation_rate_pct: float,
) -> float:
    raw_score = (
        avg_risk_score * 1.35
        + suspicious_rate_pct * 0.45
        + incorrect_rate_pct * 0.75
        + violation_rate_pct * 0.35
    )
    return round(min(100.0, raw_score), 2)


OUTLIER_METRIC_OPTIONS: Dict[str, str] = {
    "claim_total": "Claim Amount (SAR)",
    "location_adjusted_claim_total": "Location-Adjusted Claim Amount (SAR)",
    "trip_duration_days": "Trip Duration (Days)",
    "risk_score": "Risk Score",
    "detection_count": "Detection Count",
    "settlement_lag_days": "Settlement Lag (Days)",
    "submission_lag_days": "Submission Lag (Days)",
}


def _safe_mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _safe_std(values: List[float], mean_value: float) -> float:
    if not values:
        return 0.0
    variance = sum((item - mean_value) ** 2 for item in values) / len(values)
    return math.sqrt(variance) if variance > 1e-12 else 0.0


def _zscore(value: float, mean_value: float, std_value: float) -> float:
    if std_value <= 1e-12:
        return 0.0
    return (value - mean_value) / std_value


def _metric_value_for_claim(
    *,
    metric_key: str,
    claim: Claim,
    risk_score: Optional[float],
    detection_count: int,
    location_cost_factor: float,
) -> Optional[float]:
    if metric_key == "claim_total":
        return float(claim.claim_total or 0.0)

    if metric_key == "location_adjusted_claim_total":
        safe_factor = location_cost_factor if location_cost_factor > 0 else 1.0
        return float(claim.claim_total or 0.0) / safe_factor

    if metric_key == "trip_duration_days":
        if claim.trip_duration_days is None:
            return None
        return float(claim.trip_duration_days)

    if metric_key == "risk_score":
        return float(risk_score) if risk_score is not None else None

    if metric_key == "detection_count":
        return float(detection_count)

    if metric_key == "settlement_lag_days":
        if not claim.end_date or not claim.trip_settlement_date:
            return None
        return float((claim.trip_settlement_date - claim.end_date).days)

    if metric_key == "submission_lag_days":
        if not claim.end_date or not claim.created_at:
            return None
        return float((claim.created_at.date() - claim.end_date).days)

    return None


def _kmeans_2d(coords: List[tuple[float, float]], cluster_count: int, max_iterations: int = 30) -> tuple[List[int], List[tuple[float, float]]]:
    point_count = len(coords)
    if point_count == 0:
        return [], []

    k = max(1, min(cluster_count, point_count))
    if k == 1:
        centroid_x = _safe_mean([point[0] for point in coords])
        centroid_y = _safe_mean([point[1] for point in coords])
        return [0] * point_count, [(centroid_x, centroid_y)]

    sorted_indexes = sorted(range(point_count), key=lambda idx: (coords[idx][0], coords[idx][1]))
    initial_centroids: List[tuple[float, float]] = []
    for bucket in range(k):
        position = round(bucket * (point_count - 1) / (k - 1))
        initial_centroids.append(coords[sorted_indexes[position]])

    assignments = [-1] * point_count
    centroids = initial_centroids

    for _ in range(max_iterations):
        next_assignments: List[int] = []
        for x_value, y_value in coords:
            best_cluster = 0
            best_distance = float("inf")
            for cluster_id, (center_x, center_y) in enumerate(centroids):
                distance = (x_value - center_x) ** 2 + (y_value - center_y) ** 2
                if distance < best_distance:
                    best_distance = distance
                    best_cluster = cluster_id
            next_assignments.append(best_cluster)

        if next_assignments == assignments:
            break
        assignments = next_assignments

        sum_x = [0.0] * k
        sum_y = [0.0] * k
        counts = [0] * k
        for idx, cluster_id in enumerate(assignments):
            x_value, y_value = coords[idx]
            sum_x[cluster_id] += x_value
            sum_y[cluster_id] += y_value
            counts[cluster_id] += 1

        next_centroids: List[tuple[float, float]] = []
        for cluster_id in range(k):
            if counts[cluster_id] == 0:
                next_centroids.append(centroids[cluster_id])
            else:
                next_centroids.append((sum_x[cluster_id] / counts[cluster_id], sum_y[cluster_id] / counts[cluster_id]))
        centroids = next_centroids

    if assignments[0] == -1:
        assignments = [0] * point_count

    return assignments, centroids


@router.get("/dashboards/outlier-map", response_model=OutlierMapDashboardOut)
def outlier_map_dashboard(
    x_metric: str = "claim_total",
    y_metric: str = "trip_duration_days",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer", "administrator")),
):
    metric_options = [
        OutlierMetricOptionOut(key=key, label=label)
        for key, label in OUTLIER_METRIC_OPTIONS.items()
    ]

    if x_metric not in OUTLIER_METRIC_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported x_metric: {x_metric}")
    if y_metric not in OUTLIER_METRIC_OPTIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported y_metric: {y_metric}")
    if x_metric == y_metric:
        raise HTTPException(status_code=400, detail="x_metric and y_metric must be different")

    claims = (
        db.execute(
            select(Claim)
            .options(joinedload(Claim.risk_assessment), joinedload(Claim.detections))
            .order_by(Claim.created_at.desc())
        )
        .unique()
        .scalars()
        .all()
    )

    x_label = OUTLIER_METRIC_OPTIONS[x_metric]
    y_label = OUTLIER_METRIC_OPTIONS[y_metric]

    raw_points: List[Dict[str, object]] = []
    for claim in claims:
        risk_score: Optional[float] = None
        risk_level: Optional[str] = None
        if claim.risk_assessment:
            risk_score = float(claim.risk_assessment.risk_score or 0.0)
            risk_level = claim.risk_assessment.risk_level
        elif claim.risk_score_cached > 0:
            risk_score = float(claim.risk_score_cached)

        detection_count = len(claim.detections)
        destination_city = claim.to_city or claim.destination_city
        location_cost_factor = get_location_cost_factor(
            country=claim.to_country,
            city=destination_city,
            trip_boundary=claim.trip_boundary,
        )
        x_value = _metric_value_for_claim(
            metric_key=x_metric,
            claim=claim,
            risk_score=risk_score,
            detection_count=detection_count,
            location_cost_factor=location_cost_factor,
        )
        y_value = _metric_value_for_claim(
            metric_key=y_metric,
            claim=claim,
            risk_score=risk_score,
            detection_count=detection_count,
            location_cost_factor=location_cost_factor,
        )

        if x_value is None or y_value is None:
            continue
        if not (math.isfinite(x_value) and math.isfinite(y_value)):
            continue

        raw_points.append(
            {
                "claim_id": claim.claim_id,
                "employee_id": claim.employee_id,
                "employee_name": claim.employee_name,
                "department": claim.department,
                "to_country": claim.to_country,
                "to_city": destination_city,
                "location_cost_factor": location_cost_factor,
                "x_value": float(x_value),
                "y_value": float(y_value),
                "suspicious_flag": bool(claim.suspicious_flag),
                "incorrect_flag": bool(claim.incorrect_flag),
                "risk_level": risk_level,
                "risk_score": risk_score,
                "detection_count": detection_count,
            }
        )

    if not raw_points:
        return OutlierMapDashboardOut(
            x_metric=x_metric,
            y_metric=y_metric,
            x_label=x_label,
            y_label=y_label,
            total_points=0,
            outlier_points=0,
            metric_options=metric_options,
            clusters=[],
            points=[],
        )

    x_values = [float(point["x_value"]) for point in raw_points]
    y_values = [float(point["y_value"]) for point in raw_points]

    x_mean = _safe_mean(x_values)
    y_mean = _safe_mean(y_values)
    x_std = _safe_std(x_values, x_mean)
    y_std = _safe_std(y_values, y_mean)

    z_axis_threshold = 2.35
    z_distance_threshold = 3.0

    for point in raw_points:
        x_zscore = _zscore(float(point["x_value"]), x_mean, x_std)
        y_zscore = _zscore(float(point["y_value"]), y_mean, y_std)
        distance_score = math.sqrt((x_zscore ** 2) + (y_zscore ** 2))

        reasons: List[str] = []
        if abs(x_zscore) >= z_axis_threshold:
            reasons.append(f"Extreme {x_label.lower()}")
        if abs(y_zscore) >= z_axis_threshold:
            reasons.append(f"Extreme {y_label.lower()}")
        if distance_score >= z_distance_threshold:
            reasons.append("Distant from peer cluster center")

        point["x_zscore"] = round(x_zscore, 4)
        point["y_zscore"] = round(y_zscore, 4)
        point["distance_score"] = round(distance_score, 4)
        point["outlier_reasons"] = reasons
        point["outlier_flag"] = len(reasons) > 0
        point["cluster_id"] = -1

    non_outlier_indexes = [idx for idx, item in enumerate(raw_points) if not bool(item["outlier_flag"])]
    if non_outlier_indexes:
        non_outlier_points = [
            (float(raw_points[idx]["x_zscore"]), float(raw_points[idx]["y_zscore"]))
            for idx in non_outlier_indexes
        ]
        non_outlier_count = len(non_outlier_points)
        if non_outlier_count < 14:
            cluster_count = 1
        elif non_outlier_count < 60:
            cluster_count = 2
        elif non_outlier_count < 160:
            cluster_count = 3
        else:
            cluster_count = 4

        assignments, _ = _kmeans_2d(non_outlier_points, cluster_count=cluster_count)
        for local_index, point_index in enumerate(non_outlier_indexes):
            raw_points[point_index]["cluster_id"] = int(assignments[local_index])

    cluster_rows: List[OutlierClusterSummaryOut] = []
    non_outlier_cluster_ids = sorted({int(point["cluster_id"]) for point in raw_points if int(point["cluster_id"]) >= 0})
    for cluster_id in non_outlier_cluster_ids:
        members = [point for point in raw_points if int(point["cluster_id"]) == cluster_id]
        if not members:
            continue
        centroid_x = _safe_mean([float(member["x_value"]) for member in members])
        centroid_y = _safe_mean([float(member["y_value"]) for member in members])
        cluster_rows.append(
            OutlierClusterSummaryOut(
                cluster_id=cluster_id,
                label=f"Cluster {cluster_id + 1}",
                point_count=len(members),
                centroid_x=round(centroid_x, 4),
                centroid_y=round(centroid_y, 4),
            )
        )

    outlier_members = [point for point in raw_points if bool(point["outlier_flag"])]
    if outlier_members:
        cluster_rows.append(
            OutlierClusterSummaryOut(
                cluster_id=-1,
                label="Outliers",
                point_count=len(outlier_members),
                centroid_x=round(_safe_mean([float(member["x_value"]) for member in outlier_members]), 4),
                centroid_y=round(_safe_mean([float(member["y_value"]) for member in outlier_members]), 4),
            )
        )

    points = [
        OutlierMapPointOut(
            claim_id=str(point["claim_id"]),
            employee_id=str(point["employee_id"]),
            employee_name=str(point["employee_name"]),
            department=str(point["department"]),
            to_country=str(point["to_country"]) if point["to_country"] else None,
            to_city=str(point["to_city"]) if point["to_city"] else None,
            location_cost_factor=float(point["location_cost_factor"]),
            x_value=float(point["x_value"]),
            y_value=float(point["y_value"]),
            x_zscore=float(point["x_zscore"]),
            y_zscore=float(point["y_zscore"]),
            distance_score=float(point["distance_score"]),
            cluster_id=int(point["cluster_id"]),
            outlier_flag=bool(point["outlier_flag"]),
            outlier_reasons=list(point["outlier_reasons"]),
            suspicious_flag=bool(point["suspicious_flag"]),
            incorrect_flag=bool(point["incorrect_flag"]),
            risk_level=str(point["risk_level"]) if point["risk_level"] else None,
            risk_score=round(float(point["risk_score"]), 2) if point["risk_score"] is not None else None,
            detection_count=int(point["detection_count"]),
        )
        for point in raw_points
    ]

    return OutlierMapDashboardOut(
        x_metric=x_metric,
        y_metric=y_metric,
        x_label=x_label,
        y_label=y_label,
        total_points=len(points),
        outlier_points=len(outlier_members),
        metric_options=metric_options,
        clusters=cluster_rows,
        points=points,
    )


@router.get("/dashboards/employee-risk", response_model=EmployeeRiskDashboardOut)
def employee_risk_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer", "administrator")),
):
    claims = (
        db.execute(
            select(Claim)
            .options(joinedload(Claim.risk_assessment), joinedload(Claim.detections))
            .order_by(Claim.created_at.desc())
        )
        .unique()
        .scalars()
        .all()
    )
    if not claims:
        return EmployeeRiskDashboardOut(
            total_employees=0,
            total_claims=0,
            analyzed_claims=0,
            suspicious_claims=0,
            incorrect_claims=0,
            flagged_claims=0,
            total_spend=0.0,
            avg_claim_amount=0.0,
            avg_claims_per_employee=0.0,
            avg_trip_duration_days=0.0,
            high_risk_employees=0,
            risk_band_distribution={},
            employees=[],
        )

    buckets: Dict[str, Dict] = {}
    overall_trip_days = 0
    overall_trip_day_claims = 0

    analyzed_status = {"analyzed", "under_review", "reviewed", "escalated"}

    for claim in claims:
        employee_id = claim.employee_id or "UNASSIGNED"
        if employee_id not in buckets:
            buckets[employee_id] = {
                "employee_id": employee_id,
                "employee_name": claim.employee_name or employee_id,
                "department": claim.department or "Unknown",
                "total_claims": 0,
                "analyzed_claims": 0,
                "suspicious_claims": 0,
                "incorrect_claims": 0,
                "flagged_claims": 0,
                "total_spend": 0.0,
                "total_trip_days": 0,
                "trip_day_claim_count": 0,
                "risk_score_total": 0.0,
                "risk_score_count": 0,
                "max_risk_score": 0.0,
                "total_detections": 0,
                "domestic_trips": 0,
                "international_trips": 0,
                "detection_counter": Counter(),
                "destination_counter": Counter(),
                "last_claim_at": claim.created_at,
            }

        bucket = buckets[employee_id]
        bucket["total_claims"] += 1
        bucket["total_spend"] += float(claim.claim_total or 0.0)

        if claim.created_at and (not bucket["last_claim_at"] or claim.created_at > bucket["last_claim_at"]):
            bucket["last_claim_at"] = claim.created_at

        if claim.status in analyzed_status or claim.risk_assessment:
            bucket["analyzed_claims"] += 1
        if claim.suspicious_flag:
            bucket["suspicious_claims"] += 1
        if claim.incorrect_flag:
            bucket["incorrect_claims"] += 1
        if claim.suspicious_flag or claim.incorrect_flag:
            bucket["flagged_claims"] += 1

        trip_days = int(claim.trip_duration_days or 0)
        if trip_days > 0:
            bucket["total_trip_days"] += trip_days
            bucket["trip_day_claim_count"] += 1
            overall_trip_days += trip_days
            overall_trip_day_claims += 1

        trip_boundary = (claim.trip_boundary or "").strip().lower()
        if "domestic" in trip_boundary:
            bucket["domestic_trips"] += 1
        elif "international" in trip_boundary:
            bucket["international_trips"] += 1

        risk_score = None
        if claim.risk_assessment:
            risk_score = float(claim.risk_assessment.risk_score or 0.0)
        elif claim.risk_score_cached > 0:
            risk_score = float(claim.risk_score_cached)

        if risk_score is not None:
            bucket["risk_score_total"] += risk_score
            bucket["risk_score_count"] += 1
            bucket["max_risk_score"] = max(float(bucket["max_risk_score"]), risk_score)

        if claim.destination_city:
            bucket["destination_counter"][claim.destination_city] += 1

        for detection in claim.detections:
            bucket["total_detections"] += 1
            bucket["detection_counter"][detection.detection_type] += 1

    profiles: List[EmployeeRiskProfileOut] = []
    for item in buckets.values():
        total_claims = int(item["total_claims"])
        suspicious_claims = int(item["suspicious_claims"])
        incorrect_claims = int(item["incorrect_claims"])
        flagged_claims = int(item["flagged_claims"])

        total_spend = float(item["total_spend"])
        total_trip_days = int(item["total_trip_days"])
        trip_day_claim_count = int(item["trip_day_claim_count"])

        risk_score_count = int(item["risk_score_count"])
        risk_score_total = float(item["risk_score_total"])
        avg_risk_score = round(risk_score_total / risk_score_count, 2) if risk_score_count else 0.0
        max_risk_score = round(float(item["max_risk_score"]), 2)

        suspicious_rate_pct = _safe_pct(suspicious_claims, total_claims)
        incorrect_rate_pct = _safe_pct(incorrect_claims, total_claims)
        violation_rate_pct = _safe_pct(flagged_claims, total_claims)
        avg_claim_amount = round(total_spend / total_claims, 2) if total_claims else 0.0
        avg_trip_duration_days = round(total_trip_days / trip_day_claim_count, 2) if trip_day_claim_count else 0.0
        avg_cost_per_trip_day = round(total_spend / total_trip_days, 2) if total_trip_days else 0.0

        employee_risk_level = _employee_risk_level(
            avg_risk_score=avg_risk_score,
            max_risk_score=max_risk_score,
            suspicious_rate_pct=suspicious_rate_pct,
            incorrect_claims=incorrect_claims,
            flagged_claims=flagged_claims,
        )
        risk_index = _employee_risk_index(
            avg_risk_score=avg_risk_score,
            suspicious_rate_pct=suspicious_rate_pct,
            incorrect_rate_pct=incorrect_rate_pct,
            violation_rate_pct=violation_rate_pct,
        )

        detection_counter: Counter = item["detection_counter"]
        top_detection_type, top_detection_count = (None, 0)
        if detection_counter:
            top_detection_type, top_detection_count = detection_counter.most_common(1)[0]

        destination_counter: Counter = item["destination_counter"]
        top_destination_city = destination_counter.most_common(1)[0][0] if destination_counter else None

        profiles.append(
            EmployeeRiskProfileOut(
                employee_id=str(item["employee_id"]),
                employee_name=str(item["employee_name"]),
                department=str(item["department"] or "Unknown"),
                total_claims=total_claims,
                analyzed_claims=int(item["analyzed_claims"]),
                suspicious_claims=suspicious_claims,
                incorrect_claims=incorrect_claims,
                flagged_claims=flagged_claims,
                suspicious_rate_pct=suspicious_rate_pct,
                incorrect_rate_pct=incorrect_rate_pct,
                violation_rate_pct=violation_rate_pct,
                total_spend=round(total_spend, 2),
                avg_claim_amount=avg_claim_amount,
                total_trip_days=total_trip_days,
                avg_trip_duration_days=avg_trip_duration_days,
                avg_cost_per_trip_day=avg_cost_per_trip_day,
                avg_risk_score=avg_risk_score,
                max_risk_score=max_risk_score,
                risk_index=risk_index,
                employee_risk_level=employee_risk_level,
                total_detections=int(item["total_detections"]),
                top_detection_type=top_detection_type,
                top_detection_count=int(top_detection_count),
                domestic_trips=int(item["domestic_trips"]),
                international_trips=int(item["international_trips"]),
                top_destination_city=top_destination_city,
                last_claim_at=item["last_claim_at"],
            )
        )

    profiles.sort(
        key=lambda row: (
            -row.risk_index,
            -row.flagged_claims,
            -row.total_spend,
            -row.total_claims,
        )
    )

    risk_band_distribution = dict(Counter(profile.employee_risk_level for profile in profiles))
    total_claims = len(claims)
    total_employees = len(profiles)
    analyzed_claims = sum(profile.analyzed_claims for profile in profiles)
    suspicious_claims = sum(profile.suspicious_claims for profile in profiles)
    incorrect_claims = sum(profile.incorrect_claims for profile in profiles)
    flagged_claims = sum(profile.flagged_claims for profile in profiles)
    total_spend = round(sum(profile.total_spend for profile in profiles), 2)
    avg_claim_amount = round(total_spend / total_claims, 2) if total_claims else 0.0
    avg_claims_per_employee = round(total_claims / total_employees, 2) if total_employees else 0.0
    avg_trip_duration_days = round(overall_trip_days / overall_trip_day_claims, 2) if overall_trip_day_claims else 0.0
    high_risk_employees = len([profile for profile in profiles if profile.employee_risk_level in {"Critical", "High"}])

    return EmployeeRiskDashboardOut(
        total_employees=total_employees,
        total_claims=total_claims,
        analyzed_claims=analyzed_claims,
        suspicious_claims=suspicious_claims,
        incorrect_claims=incorrect_claims,
        flagged_claims=flagged_claims,
        total_spend=total_spend,
        avg_claim_amount=avg_claim_amount,
        avg_claims_per_employee=avg_claims_per_employee,
        avg_trip_duration_days=avg_trip_duration_days,
        high_risk_employees=high_risk_employees,
        risk_band_distribution=risk_band_distribution,
        employees=profiles,
    )


@router.get("/dashboards/risk-summary", response_model=ExecutiveDashboardOut)
def risk_summary_compat(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("reviewer", "administrator")),
):
    return executive_dashboard(db=db, current_user=current_user)


def _get_or_create_policy_rule(
    db: Session,
    *,
    key: str,
    name: str,
    category: str,
    threshold: float,
    unit: str,
) -> PolicyRule:
    rule = db.execute(select(PolicyRule).where(PolicyRule.key == key)).scalars().first()
    if rule:
        rule.name = name
        rule.category = category
        rule.threshold = threshold
        rule.unit = unit
        rule.enabled = True
        rule.source = "manual"
        return rule

    rule = PolicyRule(
        key=key,
        name=name,
        category=category,
        threshold=threshold,
        unit=unit,
        enabled=True,
        source="manual",
    )
    db.add(rule)
    return rule


def _current_risk_settings(db: Session) -> RiskSettingsOut:
    policy_rows = db.execute(select(PolicyRule).where(PolicyRule.enabled.is_(True))).scalars().all()
    policy_map = {row.key: row for row in policy_rows}
    return RiskSettingsOut(
        detection_mode=get_risk_detection_mode(policy_map),
        mean_threshold_pct=round(get_rule_threshold(policy_map, "mean_threshold_pct", 10.0), 2),
        outlier_min_sample_size=int(max(3.0, get_rule_threshold(policy_map, "outlier_min_sample_size", 8.0))),
        location_adjusted_threshold_pct=round(
            get_rule_threshold(policy_map, "location_adjusted_threshold_pct", 12.0),
            2,
        ),
    )


@router.get("/admin/risk-settings", response_model=RiskSettingsOut)
def get_risk_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("administrator")),
):
    return _current_risk_settings(db)


@router.put("/admin/risk-settings", response_model=RiskSettingsOut)
def update_risk_settings(
    payload: RiskSettingsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("administrator")),
):
    _get_or_create_policy_rule(
        db,
        key="risk_detection_mode_code",
        name="Risk Detection Mode Code",
        category="system",
        threshold=float(risk_detection_mode_to_code(payload.detection_mode)),
        unit="enum",
    )
    _get_or_create_policy_rule(
        db,
        key="mean_threshold_pct",
        name="Peer Mean Threshold Percentage",
        category="threshold",
        threshold=float(payload.mean_threshold_pct),
        unit="pct",
    )
    _get_or_create_policy_rule(
        db,
        key="outlier_min_sample_size",
        name="Outlier Minimum Sample Size",
        category="system",
        threshold=float(payload.outlier_min_sample_size),
        unit="count",
    )
    _get_or_create_policy_rule(
        db,
        key="location_adjusted_threshold_pct",
        name="Location-Adjusted Mean Threshold Percentage",
        category="threshold",
        threshold=float(payload.location_adjusted_threshold_pct),
        unit="pct",
    )
    db.commit()
    return _current_risk_settings(db)


@router.get("/admin/policy-rules", response_model=List[PolicyRuleOut])
def list_policy_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("administrator")),
):
    return db.execute(select(PolicyRule).order_by(PolicyRule.category, PolicyRule.key)).scalars().all()


@router.post("/admin/policy-rules", response_model=PolicyRuleOut)
def upsert_policy_rule(
    payload: PolicyRuleIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("administrator")),
):
    existing = db.execute(select(PolicyRule).where(PolicyRule.key == payload.key)).scalars().first()
    if existing:
        existing.name = payload.name
        existing.category = payload.category
        existing.threshold = payload.threshold
        existing.unit = payload.unit
        existing.weight = payload.weight
        existing.enabled = payload.enabled
        existing.source = payload.source
        db.commit()
        db.refresh(existing)
        return existing

    rule = PolicyRule(
        key=payload.key,
        name=payload.name,
        category=payload.category,
        threshold=payload.threshold,
        unit=payload.unit,
        weight=payload.weight,
        enabled=payload.enabled,
        source=payload.source,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.post("/admin/policy-rules/extract", response_model=PolicyExtractionResponse)
def extract_policy_rules(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles("administrator")),
):
    content = file.file.read()
    text = content.decode("utf-8", errors="ignore")
    suggestions = extract_rules_from_policy_text(text)
    return PolicyExtractionResponse(
        suggestions=[
            {
                "key": item.key,
                "value": item.value,
                "unit": item.unit,
                "confidence": item.confidence,
                "source_excerpt": item.source_excerpt,
            }
            for item in suggestions
        ]
    )


@router.get("/admin/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("administrator")),
):
    return db.execute(select(User).order_by(User.role, User.username)).scalars().all()
