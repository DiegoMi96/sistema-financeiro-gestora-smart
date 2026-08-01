from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models import User, UserRole, AuditLog
from app.core.security import verify_password, hash_password, create_access_token, decode_token
from app.core.permissions import (
    ROLE_PERMISSIONS, ROLE_LABELS, get_permission,
    get_manager_scope, target_in_scope,
)

router = APIRouter(prefix="/auth", tags=["Autenticação"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.CONTAS_RECEBER
    custom_role_key: Optional[str]        = None
    can_edit_billing: Optional[bool]      = None
    can_approve_billing: Optional[bool]   = None
    can_view_dashboard: Optional[bool]    = None
    can_manage_users: Optional[bool]      = None
    can_view_contestacao: Optional[bool]  = None
    can_view_comissao: Optional[bool]     = None
    can_view_smt: Optional[bool]          = None


class UserUpdate(BaseModel):
    name: Optional[str]        = None
    role: Optional[UserRole]   = None
    custom_role_key: Optional[str]        = None
    is_active: Optional[bool]  = None
    can_edit_billing: Optional[bool]      = None
    can_approve_billing: Optional[bool]   = None
    can_view_dashboard: Optional[bool]    = None
    can_manage_users: Optional[bool]      = None
    can_view_contestacao: Optional[bool]  = None
    can_view_comissao: Optional[bool]     = None
    can_view_smt: Optional[bool]          = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


def user_to_dict(user: User, db=None) -> dict:
    custom_role_key = getattr(user, "custom_role_key", None)

    # Resolve label do perfil personalizado se houver
    role_label = ROLE_LABELS.get(user.role, str(user.role))
    if custom_role_key and db is not None:
        try:
            from app.routers.settings import SystemSetting
            row = db.query(SystemSetting).filter(SystemSetting.key == "custom_roles").first()
            if row and row.value:
                import json as _json
                for cr in _json.loads(row.value):
                    if cr.get("slug") == custom_role_key:
                        role_label = cr.get("label", custom_role_key)
                        break
        except Exception:
            pass

    return {
        "id":              user.id,
        "name":            user.name,
        "email":           user.email,
        "role":            user.role,
        "role_label":      role_label,
        "custom_role_key": custom_role_key,
        "is_active":       user.is_active,
        "permissions": {
            perm: get_permission(user, perm, db)
            for perm in ROLE_PERMISSIONS[UserRole.ADMIN].keys()
        },
        # Área de gestão restrita (None = irrestrito/Admin) — usada pelo
        # frontend pra saber se o usuário logado é um "gestor de área" e
        # deve enxergar só uma fatia da tela de Gestão de Acessos.
        "manager_scope": get_manager_scope(user, db) if db is not None else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ─────────────────────────────────────────────
# DEPENDÊNCIA — usuário atual
# ─────────────────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if not payload:
        raise credentials_exception

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
    if not user:
        raise credentials_exception

    return user


# ─────────────────────────────────────────────
# ROTAS
# ─────────────────────────────────────────────

@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Usuário inativo")

    token = create_access_token({"sub": str(user.id), "role": user.role})

    # Auditoria
    db.add(AuditLog(user_id=user.id, action="auth.login", entity="user", entity_id=user.id))
    db.commit()

    return {"access_token": token, "token_type": "bearer", "user": user_to_dict(user, db)}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_to_dict(current_user, db)


@router.post("/change-password")
def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")

    current_user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"message": "Senha alterada com sucesso"}


# ─── Gestão de Usuários (Admin only) ──────────────────────────

@router.get("/users")
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_manage_users", db):
        raise HTTPException(status_code=403, detail="Sem permissão")
    scope = get_manager_scope(current_user, db)
    users = db.query(User).order_by(User.name).all()
    if scope is not None:
        # Gestor de área: só enxerga usuários de perfis Analista da própria área.
        users = [u for u in users if target_in_scope(scope, u.role, u.custom_role_key, db)]
    return [user_to_dict(u, db) for u in users]


@router.post("/users", status_code=201)
def create_user(
    data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_manage_users", db):
        raise HTTPException(status_code=403, detail="Sem permissão")

    scope = get_manager_scope(current_user, db)
    if scope is not None and not target_in_scope(scope, data.role, data.custom_role_key, db):
        raise HTTPException(status_code=403, detail="Você só pode criar usuários dentro da sua área de gestão")

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    user = User(
        name=data.name,
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role,
        custom_role_key=data.custom_role_key,
        can_edit_billing=data.can_edit_billing,
        can_approve_billing=data.can_approve_billing,
        can_view_dashboard=data.can_view_dashboard,
        can_manage_users=data.can_manage_users,
        can_view_contestacao=data.can_view_contestacao,
        can_view_comissao=data.can_view_comissao,
    )
    db.add(user)
    db.add(AuditLog(
        user_id=current_user.id, action="user.create",
        entity="user", details={"email": data.email, "role": data.role}
    ))
    db.commit()
    db.refresh(user)
    return user_to_dict(user, db)


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_manage_users", db):
        raise HTTPException(status_code=403, detail="Sem permissão")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    scope = get_manager_scope(current_user, db)
    if scope is not None:
        if not target_in_scope(scope, user.role, user.custom_role_key, db):
            raise HTTPException(status_code=403, detail="Usuário fora da sua área de gestão")
        new_role = data.role if data.role is not None else user.role
        new_custom_role_key = data.custom_role_key if data.custom_role_key is not None else user.custom_role_key
        if not target_in_scope(scope, new_role, new_custom_role_key, db):
            raise HTTPException(status_code=403, detail="Você não pode atribuir esse perfil")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)

    db.add(AuditLog(
        user_id=current_user.id, action="user.update",
        entity="user", entity_id=user_id
    ))
    db.commit()
    db.refresh(user)
    return user_to_dict(user, db)


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_manage_users", db):
        raise HTTPException(status_code=403, detail="Sem permissão")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Não é possível desativar seu próprio usuário")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    scope = get_manager_scope(current_user, db)
    if scope is not None and not target_in_scope(scope, user.role, user.custom_role_key, db):
        raise HTTPException(status_code=403, detail="Usuário fora da sua área de gestão")

    user.is_active = False
    db.commit()
    return {"message": "Usuário desativado"}


@router.get("/smt-url")
def smt_url(current_user: User = Depends(get_current_user)):
    """Retorna a URL do dashboard SMT externo."""
    from app.config import settings
    return {"url": settings.SMT_URL}


@router.get("/controladoria-url")
def controladoria_sso_url(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Gera URL SSO para o dashboard externo incluindo quais abas o usuário pode ver."""
    if not get_permission(current_user, "can_view_controladoria", db):
        raise HTTPException(status_code=403, detail="Sem permissão para Controladoria")
    import os
    sso_key = os.getenv("CONTROLADORIA_SSO_KEY", "")
    if not sso_key:
        raise HTTPException(status_code=503, detail="SSO não configurado")

    tab_map = {
        "dre":         "can_view_ctrl_dre",
        "fluxo_caixa": "can_view_ctrl_fluxo_caixa",
        "balanco":     "can_view_ctrl_balanco",
        "indicadores": "can_view_ctrl_indicadores",
    }
    allowed_tabs = [tab for tab, perm in tab_map.items() if get_permission(current_user, perm, db)]

    url = f"https://dashboard.gestorasmart.com.br/sso?key={sso_key}"
    if allowed_tabs:
        url += f"&tabs={','.join(allowed_tabs)}"
    return {"url": url}
