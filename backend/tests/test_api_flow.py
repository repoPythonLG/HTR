from __future__ import annotations

import io


def _upload_claim(
    client,
    headers,
    *,
    employee_id: str,
    claim_total: float,
    city: str,
    start_date: str,
    end_date: str,
    docs: list[tuple[str, str]],
):
    files = []
    for filename, content in docs:
        files.append(("files", (filename, io.BytesIO(content.encode("utf-8")), "text/plain")))

    response = client.post(
        "/api/v1/claims/upload",
        headers=headers,
        data={
            "employee_id": employee_id,
            "employee_name": "Test Employee",
            "department": "HR",
            "start_date": start_date,
            "end_date": end_date,
            "destination_city": city,
            "claim_total": str(claim_total),
            "currency": "SAR",
        },
        files=files,
    )
    assert response.status_code == 200, response.text
    return response.json()["claim_id"]


def test_upload_analyze_and_review_flow(client, auth_headers):
    reviewer_headers = auth_headers["reviewer"]

    claim_id = _upload_claim(
        client,
        reviewer_headers,
        employee_id="EMP-001",
        claim_total=4950,
        city="Riyadh",
        start_date="2026-03-01",
        end_date="2026-03-12",
        docs=[
            (
                "hotel_receipt.txt",
                "Grand Hotel Riyadh\nReceipt no: H12345\nRoom rate: 1300\nNights: 4\nBreakfast included\nTotal: 5200",
            ),
            (
                "meal_receipt.txt",
                "Restaurant bill\nReceipt no: M45678\nTotal: 120\nDate: 2026-03-05",
            ),
        ],
    )

    analyze_response = client.post(f"/api/v1/claims/{claim_id}/analyze", headers=reviewer_headers)
    assert analyze_response.status_code == 200, analyze_response.text
    payload = analyze_response.json()
    assert payload["risk_score"] > 0

    claim_response = client.get(f"/api/v1/claims/{claim_id}", headers=reviewer_headers)
    assert claim_response.status_code == 200
    claim = claim_response.json()
    detection_types = {item["detection_type"] for item in claim["detections"]}

    assert "hotel_above_benchmark" in detection_types
    assert "near_approval_threshold" in detection_types
    assert "extended_stay" in detection_types
    assert "meal_double_claim" in detection_types
    assert claim["suspicious_flag"] is True

    contributions = claim["risk_assessment"]["contributions"]
    expected_score = sum(item["weight"] for item in contributions)
    assert claim["risk_assessment"]["risk_score"] == expected_score

    review_response = client.post(
        f"/api/v1/claims/{claim_id}/review-action",
        headers=reviewer_headers,
        json={
            "reviewer_id": "REV-9",
            "status": "escalated",
            "notes": "Needs deeper audit",
            "disposition_reason": "high_risk",
        },
    )
    assert review_response.status_code == 200
    assert review_response.json()["claim_status"] == "escalated"


def test_duplicate_receipt_detection(client, auth_headers):
    reviewer_headers = auth_headers["reviewer"]

    first_claim = _upload_claim(
        client,
        reviewer_headers,
        employee_id="EMP-002",
        claim_total=1200,
        city="Jeddah",
        start_date="2026-01-01",
        end_date="2026-01-03",
        docs=[("receipt_a.txt", "Taxi receipt\nReceipt no: DUPL111\nTotal: 90")],
    )
    assert client.post(f"/api/v1/claims/{first_claim}/analyze", headers=reviewer_headers).status_code == 200

    second_claim = _upload_claim(
        client,
        reviewer_headers,
        employee_id="EMP-003",
        claim_total=900,
        city="Jeddah",
        start_date="2026-02-01",
        end_date="2026-02-02",
        docs=[("receipt_b.txt", "Taxi receipt\nReceipt no: DUPL111\nTotal: 90")],
    )
    assert client.post(f"/api/v1/claims/{second_claim}/analyze", headers=reviewer_headers).status_code == 200

    claim_response = client.get(f"/api/v1/claims/{second_claim}", headers=reviewer_headers)
    claim = claim_response.json()
    detection_types = {item["detection_type"] for item in claim["detections"]}
    assert "duplicate_receipt" in detection_types


def test_excel_import_and_analysis(client, auth_headers):
    reviewer_headers = auth_headers["reviewer"]

    csv_content = """employee_id,employee_name,department,start_date,end_date,destination_city,claim_total,currency,hotel_rate,nights,receipt_number,merchant,booking_channel,meal_included\nEMP-9001,Ada Analyst,Finance,2026-04-01,2026-04-11,Riyadh,4900,SAR,1350,4,RX-001,Grand Hotel,non compliant,yes\n"""

    response = client.post(
        "/api/v1/claims/import-excel",
        headers=reviewer_headers,
        files={"file": ("claims.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
        data={"auto_analyze": "true"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["imported_claims"] == 1
    assert payload["analyzed_claims"] == 1

    claim_id = payload["claim_ids"][0]
    analysis = client.get(f"/api/v1/claims/{claim_id}/analysis", headers=reviewer_headers)
    assert analysis.status_code == 200, analysis.text
    analysis_payload = analysis.json()
    assert analysis_payload["risk_score"] > 0
    assert len(analysis_payload["findings"]) >= 1

    active = client.get("/api/v1/imports/active", headers=reviewer_headers)
    assert active.status_code == 200, active.text
    active_payload = active.json()
    assert active_payload["row_count"] == 1

    preview = client.get("/api/v1/imports/active/preview", headers=reviewer_headers)
    assert preview.status_code == 200, preview.text
    preview_payload = preview.json()
    assert "employee_id" in preview_payload["columns"]


def test_sabic_register_import_and_mean_threshold_mode(client, auth_headers):
    admin_headers = auth_headers["administrator"]
    reviewer_headers = auth_headers["reviewer"]

    settings_response = client.put(
        "/api/v1/admin/risk-settings",
        headers=admin_headers,
        json={
            "detection_mode": "mean_threshold",
            "mean_threshold_pct": 10,
            "outlier_min_sample_size": 5,
        },
    )
    assert settings_response.status_code == 200, settings_response.text

    csv_content = """TRIP NUMBER,From Region,From Country,From City,To Region,To Country,To City,Trip Activity,Trip Start Date,Trip End Date,Trip Boundary,Trip Settlement Date,Expense Type,Masked ID,Trip Duration,Expense Amount in SAR
13854,Riyadh Region,Saudi Arabia,Riyadh,Eastern Region,Saudi Arabia,Jubail,Business Trip,2025-02-18,2025-02-19,Domestic,2025-04-15,Bus. Housing Claim,12024,2,500.00
13863,Riyadh Region,Saudi Arabia,Riyadh,Western Region,Saudi Arabia,Jeddah,Business Trip,2025-02-15,2025-02-16,Domestic,2025-03-16,Bus. Housing Claim,12024,2,520.00
13882,Riyadh Region,Saudi Arabia,Riyadh,Western Region,Saudi Arabia,Jeddah,Business Trip,2025-02-16,2025-02-16,Domestic,2025-03-11,Bus. Housing Claim,149646,1,510.00
13883,Riyadh Region,Saudi Arabia,Riyadh,Eastern Region,Saudi Arabia,Khobar,Business Trip,2025-02-19,2025-02-20,Domestic,2025-03-11,Bus. Housing Claim,149646,2,495.00
13963,Riyadh Region,Saudi Arabia,Riyadh,Eastern Region,Saudi Arabia,Jubail,Business Trip,2025-05-19,2025-05-21,Domestic,2025-06-05,Bus. Housing Claim,253290,3,505.00
14023,Riyadh Region,Saudi Arabia,Riyadh,London,United Kingdom,London,Business Trip,2025-08-04,2025-08-08,Domestic,2025-08-23,Bus. Housing Claim,149646,5,900.00
"""

    import_response = client.post(
        "/api/v1/claims/import-excel",
        headers=reviewer_headers,
        files={"file": ("sabic_claims.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
        data={"auto_analyze": "true"},
    )
    assert import_response.status_code == 200, import_response.text
    payload = import_response.json()
    assert payload["imported_claims"] == 6
    assert payload["analyzed_claims"] == 6

    high_value_claim_id = payload["claim_ids"][-1]
    analysis_response = client.get(f"/api/v1/claims/{high_value_claim_id}/analysis", headers=reviewer_headers)
    assert analysis_response.status_code == 200, analysis_response.text
    findings = analysis_response.json()["findings"]
    detection_types = {item["detection_type"] for item in findings}
    assert "amount_above_peer_mean_threshold" in detection_types


def test_employee_risk_dashboard(client, auth_headers):
    reviewer_headers = auth_headers["reviewer"]

    claim_a = _upload_claim(
        client,
        reviewer_headers,
        employee_id="EMP-101",
        claim_total=4200,
        city="London",
        start_date="2026-01-05",
        end_date="2026-01-10",
        docs=[
            (
                "hotel_a.txt",
                "Hotel Alpha\nReceipt no: ER-1001\nRoom rate: 1350\nNights: 4\nTotal: 5400",
            )
        ],
    )
    assert client.post(f"/api/v1/claims/{claim_a}/analyze", headers=reviewer_headers).status_code == 200

    claim_b = _upload_claim(
        client,
        reviewer_headers,
        employee_id="EMP-202",
        claim_total=820,
        city="Jeddah",
        start_date="2026-02-01",
        end_date="2026-02-03",
        docs=[
            (
                "hotel_b.txt",
                "Hotel Beta\nReceipt no: ER-2001\nRoom rate: 350\nNights: 2\nTotal: 700",
            )
        ],
    )
    assert client.post(f"/api/v1/claims/{claim_b}/analyze", headers=reviewer_headers).status_code == 200

    dashboard_response = client.get("/api/v1/dashboards/employee-risk", headers=reviewer_headers)
    assert dashboard_response.status_code == 200, dashboard_response.text
    payload = dashboard_response.json()

    assert payload["total_employees"] == 2
    assert payload["total_claims"] == 2
    assert payload["total_spend"] > 0
    assert "employees" in payload and len(payload["employees"]) == 2

    first = payload["employees"][0]
    assert "employee_id" in first
    assert "risk_index" in first
    assert "violation_rate_pct" in first
    assert "top_detection_type" in first
