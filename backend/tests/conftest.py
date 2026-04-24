from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.services.auth import seed_default_users
from app.services.policy import seed_default_policies


@pytest.fixture()
def client(tmp_path: Path):
    db_path = tmp_path / "test.db"
    upload_path = tmp_path / "uploads"
    upload_path.mkdir(parents=True, exist_ok=True)

    settings.storage_root = upload_path

    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False}, future=True)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        seed_default_policies(db)
        seed_default_users(db)
    finally:
        db.close()

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    def login(username: str, password: str) -> dict[str, str]:
        response = client.post(
            "/api/v1/auth/login",
            data={"username": username, "password": password},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert response.status_code == 200, response.text
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return {
        "administrator": login("administrator@sabic.local", "Admin#2026"),
        "reviewer": login("reviewer@sabic.local", "Reviewer#2026"),
        "employee": login("employee@sabic.local", "Employee#2026"),
    }
