from __future__ import annotations

from typing import Callable

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import User

DEFAULT_USERS = [
    {
        "username": "administrator@sabic.local",
        "full_name": "Platform Administrator",
        "role": "administrator",
        "employee_code": None,
    },
    {
        "username": "reviewer@sabic.local",
        "full_name": "Corporate Reviewer",
        "role": "reviewer",
        "employee_code": None,
    },
    {
        "username": "employee@sabic.local",
        "full_name": "Employee User",
        "role": "employee",
        "employee_code": "EMP-1001",
    },
]


def get_current_user(
    x_demo_role: str = Header("reviewer", alias="X-Demo-Role"),
    db: Session = Depends(get_db),
) -> User:
    """Open demo access: map the selected UI role to a seeded user.

    The frontend sends a non-secret X-Demo-Role header so role-specific demo
    workflows still behave consistently without a credential gate.
    """

    role = (x_demo_role or "reviewer").strip().lower()
    if role not in {"employee", "reviewer", "administrator"}:
        role = "reviewer"

    user = (
        db.execute(
            select(User)
            .where(User.role == role, User.is_active.is_(True))
            .order_by(User.username.asc())
        )
        .scalars()
        .first()
    )
    if user is None:
        seed_default_users(db)
        user = (
            db.execute(
                select(User)
                .where(User.role == role, User.is_active.is_(True))
                .order_by(User.username.asc())
            )
            .scalars()
            .first()
        )
    if user is None:
        raise HTTPException(status_code=500, detail="Demo user configuration is missing")
    return user


def require_roles(*roles: str) -> Callable[[User], User]:
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return role_checker


def seed_default_users(db: Session) -> None:
    existing_usernames = {row[0] for row in db.execute(select(User.username)).all()}
    for seed in DEFAULT_USERS:
        if seed["username"] in existing_usernames:
            continue
        db.add(
            User(
                username=seed["username"],
                full_name=seed["full_name"],
                role=seed["role"],
                employee_code=seed["employee_code"],
                hashed_password="open-demo-access",
                is_active=True,
            )
        )
    db.commit()
