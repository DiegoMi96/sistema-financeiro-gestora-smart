"""
Configurações do sistema — leitura e escrita de parâmetros operacionais.
Armazenados na tabela system_settings (chave-valor).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, Text, DateTime, func
from pydantic import BaseModel
from typing import Optional
import httpx
import json

from app.database import Base, get_db
from app.routers.auth import get_current_user
from app.models import User, UserRole
from app.config import settings as env_settings
from app.core.permissions import (
    ROLE_PERMISSIONS, ROLE_LABELS, ROLE_DESCRIPTIONS,
    ALL_PERMISSIONS, require_permission
)

router = APIRouter(prefix="/settings", tags=["Configurações"])


# ── Model ─────────────────────────────────────────────────────
class SystemSetting(Base):
    __tablename__ = "system_settings"
    key        = Column(String(100), primary_key=True)
    value      = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ── Helpers ───────────────────────────────────────────────────
SENSITIVE = {"asaas_api_key", "anthropic_api_key"}

def _get(db: Session, key: str, default: str = "") -> str:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return row.value if row and row.value is not None else default

def _set(db: Session, key: str, value: str):
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(SystemSetting(key=key, value=value))
    db.commit()

def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "••••••••"
    return value[:4] + "••••••••" + value[-4:]


# ── Schemas ───────────────────────────────────────────────────
class SettingsOut(BaseModel):
    asaas_api_key:       str
    asaas_base_url:      str
    anthropic_api_key:   str
    empresa_nome:        str
    empresa_cnpj:        str
    empresa_ie:          str
    empresa_endereco:    str
    empresa_email:       str
    empresa_telefone:    str
    empresa_logo:        str
    mensageria_valor:    str
    cnpj_excluidos:      str
    prefixos_excluidos:  str
    cnpj_categorias:     str
    parametros_calculo:  str
    asaas_configured:    bool
    anthropic_configured: bool

class SettingsIn(BaseModel):
    asaas_api_key:       Optional[str] = None
    asaas_base_url:      Optional[str] = None
    anthropic_api_key:   Optional[str] = None
    empresa_nome:        Optional[str] = None
    empresa_cnpj:        Optional[str] = None
    empresa_ie:          Optional[str] = None
    empresa_endereco:    Optional[str] = None
    empresa_email:       Optional[str] = None
    empresa_telefone:    Optional[str] = None
    empresa_logo:        Optional[str] = None
    mensageria_valor:    Optional[str] = None
    cnpj_excluidos:      Optional[str] = None
    prefixos_excluidos:  Optional[str] = None
    cnpj_categorias:     Optional[str] = None
    parametros_calculo:  Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────
@router.get("/public")
def get_public_settings(db: Session = Depends(get_db)):
    """Retorna apenas dados de branding — sem autenticação."""
    return {"empresa_logo": _get(db, "empresa_logo")}


@router.get("", response_model=SettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asaas_key      = _get(db, "asaas_api_key") or env_settings.ASAAS_API_KEY
    anthropic_key  = _get(db, "anthropic_api_key") or (env_settings.ANTHROPIC_API_KEY or "")
    return SettingsOut(
        asaas_api_key       = _mask(asaas_key),
        asaas_base_url      = _get(db, "asaas_base_url") or env_settings.ASAAS_BASE_URL,
        anthropic_api_key   = _mask(anthropic_key),
        empresa_nome        = _get(db, "empresa_nome")     or "Gestora Smart Sim Card, Hardware e Software Ltda",
        empresa_cnpj        = _get(db, "empresa_cnpj")     or "35.775.152/0001-40",
        empresa_ie          = _get(db, "empresa_ie")        or "",
        empresa_endereco    = _get(db, "empresa_endereco")  or "Rua das Bandeiras, 35 - 2º Andar - Jardim - Santo André/SP - CEP: 09090-780",
        empresa_email       = _get(db, "empresa_email")     or "financeiro@gestorasmart.com.br",
        empresa_telefone    = _get(db, "empresa_telefone")  or "(11) 8977-0913",
        empresa_logo        = _get(db, "empresa_logo"),
        mensageria_valor    = _get(db, "mensageria_valor") or "9.90",
        cnpj_excluidos      = _get(db, "cnpj_excluidos") or "22222222222\n24152616000146",
        prefixos_excluidos  = _get(db, "prefixos_excluidos") or "ANUIDADE",
        parametros_calculo  = _get(db, "parametros_calculo") or json.dumps([
            {"key": "mensageria_valor", "label": "Mensageria", "valor": _get(db, "mensageria_valor") or "9.90"},
        ]),
        cnpj_categorias     = _get(db, "cnpj_categorias") or json.dumps({
            "22222222222":    "Suporte",
            "24152616000146": "Estoque",
            "24283777000179": "Estoque",
            "10119014475":    "Anuidade",
            "42604215810":    "Anuidade",
            "56388853072":    "Anuidade",
            "60687193834":    "Anuidade",
            "77268784104":    "Anuidade",
        }),
        asaas_configured    = bool(asaas_key),
        anthropic_configured= bool(anthropic_key),
    )


@router.put("")
def update_settings(
    body: SettingsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem alterar configurações")

    for field, value in body.model_dump(exclude_none=True).items():
        # Ignora se o usuário não alterou campos mascarados (•••)
        if field in SENSITIVE and value and "•" in value:
            continue
        _set(db, field, value)

    return {"ok": True}


@router.get("/roles")
def get_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna todos os perfis (sistema + personalizados) com suas permissões."""
    result = []

    # ── Perfis de sistema ──────────────────────────────────────
    for role_enum in UserRole:
        role_str = role_enum.value
        key = f"role_perm_{role_str}"
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if row and row.value:
            try:
                perms = json.loads(row.value)
                description = perms.pop("__description__", ROLE_DESCRIPTIONS.get(role_str, ""))
            except Exception:
                perms = dict(ROLE_PERMISSIONS.get(role_enum, {}))
                description = ROLE_DESCRIPTIONS.get(role_str, "")
        else:
            perms = dict(ROLE_PERMISSIONS.get(role_enum, {}))
            description = ROLE_DESCRIPTIONS.get(role_str, "")

        for p in ALL_PERMISSIONS:
            if p not in perms:
                perms[p] = False

        total_enabled = sum(1 for v in perms.values() if v)
        result.append({
            "role":          role_str,
            "label":         ROLE_LABELS.get(role_enum, role_str),
            "description":   description,
            "permissions":   perms,
            "total_enabled": total_enabled,
            "total":         len(ALL_PERMISSIONS),
            "is_custom":     False,
        })

    # ── Perfis personalizados ──────────────────────────────────
    custom_roles_raw = _get(db, "custom_roles")
    if custom_roles_raw:
        try:
            custom_roles = json.loads(custom_roles_raw)
            for cr in custom_roles:
                perms = cr.get("permissions", {})
                for p in ALL_PERMISSIONS:
                    if p not in perms:
                        perms[p] = False
                total_enabled = sum(1 for v in perms.values() if v)
                result.append({
                    "role":          cr["slug"],
                    "label":         cr.get("label", cr["slug"]),
                    "description":   cr.get("description", ""),
                    "permissions":   perms,
                    "total_enabled": total_enabled,
                    "total":         len(ALL_PERMISSIONS),
                    "is_custom":     True,
                    "color":         cr.get("color", "gray"),
                })
        except Exception:
            pass

    return result


@router.post("/roles/custom")
def create_custom_role(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("can_manage_users")),
):
    """Cria um novo perfil personalizado."""
    label = (data.get("label") or "").strip()
    description = (data.get("description") or "").strip()
    color = data.get("color") or "gray"
    permissions = data.get("permissions") or {}

    if not label:
        raise HTTPException(status_code=400, detail="O nome do perfil é obrigatório")

    # Gera slug a partir do label
    import re as _re
    slug = _re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    if not slug:
        raise HTTPException(status_code=400, detail="Nome inválido para gerar slug")

    existing_list = json.loads(_get(db, "custom_roles") or "[]")
    if any(cr["slug"] == slug for cr in existing_list):
        raise HTTPException(status_code=400, detail=f"Já existe um perfil com o slug '{slug}'")

    existing_list.append({
        "slug": slug,
        "label": label,
        "description": description,
        "color": color,
        "permissions": permissions,
    })
    _set(db, "custom_roles", json.dumps(existing_list))
    return {"ok": True, "slug": slug}


@router.put("/roles/custom/{slug}")
def update_custom_role(
    slug: str,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("can_manage_users")),
):
    """Atualiza permissões/descrição de um perfil personalizado."""
    existing_list = json.loads(_get(db, "custom_roles") or "[]")
    updated = False
    for cr in existing_list:
        if cr["slug"] == slug:
            cr["label"]       = data.get("label", cr["label"])
            cr["description"] = data.get("description", cr.get("description", ""))
            cr["color"]       = data.get("color", cr.get("color", "gray"))
            cr["permissions"] = data.get("permissions", cr.get("permissions", {}))
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")

    _set(db, "custom_roles", json.dumps(existing_list))
    return {"ok": True}


@router.delete("/roles/custom/{slug}")
def delete_custom_role(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("can_manage_users")),
):
    """Remove um perfil personalizado."""
    existing_list = json.loads(_get(db, "custom_roles") or "[]")
    new_list = [cr for cr in existing_list if cr["slug"] != slug]
    if len(new_list) == len(existing_list):
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    _set(db, "custom_roles", json.dumps(new_list))
    return {"ok": True}


@router.put("/roles/{role}")
def update_role_permissions(
    role: str,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("can_manage_users")),
):
    """Atualiza permissões de um perfil. Armazena overrides em system_settings."""
    # Valida role
    valid_roles = [r.value for r in UserRole]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Perfil inválido: {role}")

    permissions = data.get("permissions", {})
    description = data.get("description", ROLE_DESCRIPTIONS.get(role, ""))

    # Armazena como JSON incluindo a descrição
    payload = dict(permissions)
    payload["__description__"] = description

    _set(db, f"role_perm_{role}", json.dumps(payload))
    return {"ok": True}


@router.post("/cnpj-lookup")
def cnpj_lookup(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve nomes de CPFs/CNPJs a partir das bases de cobrança (Asaas + Itaú)."""
    from sqlalchemy import text
    import re as _re

    raw = data.get("cnpjs", [])
    digits_order = [_re.sub(r"\D", "", c).strip() for c in raw if c.strip()]
    digits_set   = list(dict.fromkeys(d for d in digits_order if d))  # unique, order-preserved

    if not digits_set:
        return []

    asaas_map: dict = {}
    try:
        rows = db.execute(text("""
            SELECT DISTINCT ON (customer_cpf_cnpj)
                customer_cpf_cnpj, customer_name
            FROM asaas_payments_sync
            WHERE customer_cpf_cnpj = ANY(:cnpjs)
            ORDER BY customer_cpf_cnpj, due_date DESC NULLS LAST
        """), {"cnpjs": digits_set}).fetchall()
        asaas_map = {r.customer_cpf_cnpj: r.customer_name for r in rows}
    except Exception:
        pass

    itau_map: dict = {}
    remaining = [c for c in digits_set if c not in asaas_map]
    if remaining:
        try:
            rows2 = db.execute(text("""
                SELECT DISTINCT ON (cpf_cnpj) cpf_cnpj, pagador
                FROM itau_boletos
                WHERE cpf_cnpj = ANY(:cnpjs)
                ORDER BY cpf_cnpj
            """), {"cnpjs": remaining}).fetchall()
            itau_map = {r.cpf_cnpj: r.pagador for r in rows2}
        except Exception:
            pass

    # Fallback: base de faturamento (billing_client_summaries) — maior ciclo disponível
    billing_map: dict = {}
    remaining2 = [c for c in digits_set if c not in asaas_map and c not in itau_map]
    if remaining2:
        try:
            rows3 = db.execute(text("""
                SELECT DISTINCT ON (clean_id) clean_id, nome_cliente
                FROM (
                    SELECT
                        REGEXP_REPLACE(id_smart, '^(ss_|SS_)', '') AS clean_id,
                        nome_cliente,
                        cycle_id
                    FROM billing_client_summaries
                    WHERE REGEXP_REPLACE(id_smart, '^(ss_|SS_)', '') = ANY(:cnpjs)
                      AND nome_cliente IS NOT NULL AND nome_cliente <> ''
                ) t
                ORDER BY clean_id, cycle_id DESC NULLS LAST
            """), {"cnpjs": remaining2}).fetchall()
            billing_map = {r.clean_id: r.nome_cliente for r in rows3}
        except Exception:
            pass

    result = []
    for cnpj in digits_order:
        if cnpj in asaas_map:
            result.append({"cnpj": cnpj, "nome": asaas_map[cnpj], "fonte": "Asaas"})
        elif cnpj in itau_map:
            result.append({"cnpj": cnpj, "nome": itau_map[cnpj], "fonte": "Itaú"})
        elif cnpj in billing_map:
            result.append({"cnpj": cnpj, "nome": billing_map[cnpj], "fonte": "Faturamento"})
        else:
            result.append({"cnpj": cnpj, "nome": None, "fonte": None})

    return result


@router.post("/test-asaas")
async def test_asaas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Testa a conexão com a API do Asaas."""
    key = _get(db, "asaas_api_key") or env_settings.ASAAS_API_KEY
    base_url = _get(db, "asaas_base_url") or env_settings.ASAAS_BASE_URL

    if not key:
        raise HTTPException(status_code=400, detail="Chave da API Asaas não configurada")

    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{base_url}/myAccount",
                headers={"access_token": key, "Content-Type": "application/json"},
                timeout=8.0,
            )
        if r.status_code == 200:
            data = r.json()
            return {
                "ok": True,
                "account_name": data.get("name") or data.get("tradingName", ""),
                "environment": "sandbox" if "sandbox" in base_url else "production",
            }
        else:
            raise HTTPException(status_code=400, detail=f"Asaas retornou status {r.status_code}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Timeout ao conectar com o Asaas")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
