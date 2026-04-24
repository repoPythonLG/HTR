from __future__ import annotations


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_auth_me_endpoint(client, auth_headers):
    response = client.get("/api/v1/auth/me", headers=auth_headers["administrator"])
    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "administrator"
