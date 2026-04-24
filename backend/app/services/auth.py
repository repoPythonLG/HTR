from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/login")

DEFAULT_USERS = [
    {
        "username": "administrator@sabic.local",
        "full_name": "Platform Administrator",
        "role": "administrator",
        "employee_code": None,
        "password": "Admin#2026",
    },
    {
        "username": "reviewer@sabic.local",
        "full_name": "Corporate Reviewer",
        "role": "reviewer",
        "employee_code": None,
        "password": "Reviewer#2026",
    },
    {
        "username": "employee@sabic.local",
        "full_name": "Employee User",
        "role": "employee",
        "employee_code": "EMP-1001",
        "password": "Employee#2026",
    },
]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    user = db.execute(select(User).where(User.username == username)).scalars().first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.execute(select(User).where(User.username == username)).scalars().first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
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
                hashed_password=get_password_hash(seed["password"]),
                is_active=True,
            )
        )
    db.commit()
