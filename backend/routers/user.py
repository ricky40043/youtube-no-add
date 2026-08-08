import hashlib
import os
import re
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database.connection import get_db
from database.models import AccountToken, User
from services.email_service import email_service
from services.cache_service import cache_service

router = APIRouter(tags=["user"])
settings = get_settings()
password_context = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/user/login", auto_error=False)


def load_jwt_secret() -> str:
    if settings.jwt_secret:
        return settings.jwt_secret

    secret_file = Path(os.getenv("JWT_SECRET_FILE", Path(__file__).resolve().parents[1] / ".jwt_secret"))
    if secret_file.exists():
        return secret_file.read_text(encoding="utf-8").strip()

    generated_secret = secrets.token_urlsafe(48)
    secret_file.write_text(generated_secret, encoding="utf-8")
    secret_file.chmod(0o600)
    print(f"[DEBUG] Generated persistent JWT secret at {secret_file}")
    return generated_secret


JWT_SECRET = load_jwt_secret()


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    username: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    email_verified: bool = False

    class Config:
        from_attributes = True


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class RecoveryEmailRequest(BaseModel):
    current_password: str
    email: str


class TokenRequest(BaseModel):
    token: str


class ForgotPasswordRequest(BaseModel):
    account: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=128)


def legacy_hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    if re.fullmatch(r"[a-f0-9]{64}", password_hash or ""):
        return secrets.compare_digest(legacy_hash_password(password), password_hash)
    try:
        return password_context.verify(password, password_hash)
    except ValueError:
        return False


def create_access_token(user: User) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: Dict[str, Any] = {
        "sub": str(user.id),
        "username": user.username,
        "pwdv": user.password_version,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=settings.jwt_algorithm)


def hash_account_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_account_token(
    db: AsyncSession,
    user_id: int,
    purpose: str,
    pending_value: Optional[str] = None,
) -> str:
    raw_token = secrets.token_urlsafe(32)
    db.add(AccountToken(
        user_id=user_id,
        token_hash=hash_account_token(raw_token),
        purpose=purpose,
        pending_value=pending_value,
        expires_at=datetime.utcnow() + timedelta(minutes=30),
    ))
    await db.commit()
    return raw_token


async def enforce_reset_rate_limit(account: str) -> None:
    """Allow at most five reset attempts per account identifier every 15 minutes."""
    account_digest = hashlib.sha256(account.strip().lower().encode()).hexdigest()
    try:
        redis = await cache_service.get_redis()
        key = f"auth:password-reset:{account_digest}"
        attempts = await redis.incr(key)
        if attempts == 1:
            await redis.expire(key, 900)
        if attempts > 5:
            raise HTTPException(status_code=429, detail="要求次數過多，請稍後再試")
    except HTTPException:
        raise
    except Exception as error:
        print(f"[ERROR] Password reset rate limit unavailable: {error}")


async def consume_account_token(
    db: AsyncSession,
    raw_token: str,
    purpose: str,
) -> AccountToken:
    result = await db.execute(select(AccountToken).where(
        AccountToken.token_hash == hash_account_token(raw_token),
        AccountToken.purpose == purpose,
        AccountToken.used_at.is_(None),
    ))
    account_token = result.scalars().first()
    if not account_token or account_token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="連結無效或已經過期")
    account_token.used_at = datetime.utcnow()
    return account_token


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    username = user.username.strip()
    result = await db.execute(select(User).where(User.username == username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="此使用者名稱已被註冊")

    new_user = User(username=username, password_hash=hash_password(user.password))
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/login", response_model=LoginResponse)
async def login(user: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == user.username.strip()))
    db_user = result.scalars().first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="使用者名稱或密碼錯誤")

    if re.fullmatch(r"[a-f0-9]{64}", db_user.password_hash or ""):
        db_user.password_hash = hash_password(user.password)
        await db.commit()

    return {
        "access_token": create_access_token(db_user),
        "token_type": "bearer",
        "user_id": db_user.id,
        "username": db_user.username,
    }


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[settings.jwt_algorithm])
        user_id = int(payload.get("sub", ""))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user or payload.get("pwdv") != user.password_version:
        raise HTTPException(status_code=401, detail="Authentication session expired")
    return user


async def get_optional_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    return await get_current_user(token, db)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/password/change")
async def change_password(
    request: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="目前密碼不正確")
    if verify_password(request.new_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="新密碼不可與目前密碼相同")

    current_user.password_hash = hash_password(request.new_password)
    current_user.password_version += 1
    await db.execute(update(AccountToken).where(
        AccountToken.user_id == current_user.id,
        AccountToken.used_at.is_(None),
    ).values(used_at=datetime.utcnow()))
    await db.commit()
    return {"message": "密碼已更新，請重新登入"}


@router.post("/recovery-email/request")
async def request_recovery_email(
    request: RecoveryEmailRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    email = request.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Email 格式不正確")
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="目前密碼不正確")
    if not email_service.is_configured:
        raise HTTPException(status_code=503, detail="Email 服務尚未設定")

    existing = await db.execute(select(User).where(User.email == email, User.id != current_user.id))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="此 Email 已由其他帳戶使用")

    token = await create_account_token(db, current_user.id, "verify_email", email)
    url = f"{settings.frontend_url}/auth?mode=verify-email&token={quote(token)}"
    await email_service.send_account_link(email, "驗證恢復信箱", "請點擊下方連結驗證恢復信箱：", url)
    return {"message": "驗證信已寄出"}


@router.post("/recovery-email/verify")
async def verify_recovery_email(request: TokenRequest, db: AsyncSession = Depends(get_db)):
    account_token = await consume_account_token(db, request.token, "verify_email")
    result = await db.execute(select(User).where(User.id == account_token.user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="帳戶不存在")
    user.email = account_token.pending_value
    user.email_verified = True
    await db.commit()
    return {"message": "恢復信箱驗證完成"}


@router.post("/password/forgot", status_code=202)
async def forgot_password(request: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    if not email_service.is_configured:
        raise HTTPException(status_code=503, detail="Email 服務尚未設定，請聯絡管理員")
    await enforce_reset_rate_limit(request.account)
    account = request.account.strip().lower()
    result = await db.execute(select(User).where(
        (User.username == request.account.strip()) | (User.email == account)
    ))
    user = result.scalars().first()
    if user and user.email and user.email_verified:
        token = await create_account_token(db, user.id, "reset_password")
        url = f"{settings.frontend_url}/auth?mode=reset-password&token={quote(token)}"
        try:
            await email_service.send_account_link(
                user.email,
                "重設密碼",
                "我們收到重設密碼的要求，連結將在 30 分鐘後失效：",
                url,
            )
        except (OSError, smtplib.SMTPException) as error:
            print(f"[ERROR] Failed to send password reset email: {error}")
    return {"message": "若帳戶已設定恢復信箱，我們會寄出重設連結"}


@router.post("/password/reset")
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    account_token = await consume_account_token(db, request.token, "reset_password")
    result = await db.execute(select(User).where(User.id == account_token.user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="帳戶不存在")
    user.password_hash = hash_password(request.new_password)
    user.password_version += 1
    await db.execute(update(AccountToken).where(
        AccountToken.user_id == user.id,
        AccountToken.used_at.is_(None),
    ).values(used_at=datetime.utcnow()))
    await db.commit()
    return {"message": "密碼已重設，請使用新密碼登入"}
