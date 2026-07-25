"""
Clientes — cadastro, perfis de contato, bancos e sincronização com Asaas.
"""
import io
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.core.permissions import require_permission
from app.routers.auth import get_current_user
from app.models import Bank, ClientProfile, BillingLine, BillingCycle
from app.config import settings
from app.services.asaas_client import get_asaas_client

# Segurança: todos os endpoints de clientes exigem login (o frontend já envia o
# token via api.js). Fecha o acesso anônimo à base de clientes (dados LGPD).
router = APIRouter(prefix="/clients", tags=["clients"], dependencies=[Depends(get_current_user)])


# ── Schemas ───────────────────────────────────────────────────────────────────

class BankCreate(BaseModel):
    nome:           str
    agencia:        Optional[str] = None
    conta:          Optional[str] = None
    digito:         Optional[str] = None
    tipo_chave_pix: Optional[str] = None
    chave_pix:      Optional[str] = None

class BankUpdate(BaseModel):
    nome:           Optional[str] = None
    agencia:        Optional[str] = None
    conta:          Optional[str] = None
    digito:         Optional[str] = None
    tipo_chave_pix: Optional[str] = None
    chave_pix:      Optional[str] = None

class ProfileUpdate(BaseModel):
    telefone:    Optional[str] = None
    email:       Optional[str] = None
    logradouro:  Optional[str] = None
    numero:      Optional[str] = None
    complemento: Optional[str] = None
    bairro:      Optional[str] = None
    cep:         Optional[str] = None
    cidade:      Optional[str] = None
    estado:      Optional[str] = None
    banco_id:    Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _bank_out(b: Bank) -> dict:
    return {
        "id": b.id, "nome": b.nome, "agencia": b.agencia,
        "conta": b.conta, "digito": b.digito,
        "tipo_chave_pix": b.tipo_chave_pix, "chave_pix": b.chave_pix,
    }

def _profile_out(p: ClientProfile, bank_nome: str | None = None) -> dict:
    return {
        "id_smart": p.id_smart, "nome": p.nome, "cnpj": p.cnpj,
        "telefone": p.telefone, "email": p.email,
        "logradouro": p.logradouro, "numero": p.numero,
        "complemento": p.complemento, "bairro": p.bairro,
        "cep": p.cep, "cidade": p.cidade, "estado": p.estado,
        "banco_id": p.banco_id, "banco_nome": bank_nome or (p.bank.nome if p.bank else None),
        "asaas_id": p.asaas_id,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# BANCOS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/banks")
def list_banks(db: Session = Depends(get_db)):
    return [_bank_out(b) for b in db.query(Bank).order_by(Bank.nome).all()]


@router.post("/banks", status_code=201)
def create_bank(data: BankCreate, db: Session = Depends(get_db)):
    if db.query(Bank).filter(Bank.nome == data.nome).first():
        raise HTTPException(400, "Já existe um banco com esse nome")
    b = Bank(**data.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return _bank_out(b)


@router.patch("/banks/{bank_id}")
def update_bank(bank_id: int, data: BankUpdate, db: Session = Depends(get_db)):
    b = db.get(Bank, bank_id)
    if not b:
        raise HTTPException(404, "Banco não encontrado")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return _bank_out(b)


@router.delete("/banks/{bank_id}", status_code=204)
def delete_bank(bank_id: int, db: Session = Depends(get_db)):
    b = db.get(Bank, bank_id)
    if not b:
        raise HTTPException(404, "Banco não encontrado")
    if b.profiles:
        raise HTTPException(400, "Banco em uso — remova a associação dos clientes antes")
    db.delete(b)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# PERFIS DE CLIENTES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("")
def list_profiles(
    page: int = 1,
    limit: int = 50,
    search: str = "",
    banco_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ClientProfile)
    if search:
        like = f"%{search}%"
        q = q.filter(
            ClientProfile.nome.ilike(like) |
            ClientProfile.cnpj.ilike(like) |
            ClientProfile.id_smart.ilike(like)
        )
    if banco_id is not None:
        q = q.filter(ClientProfile.banco_id == banco_id)
    total = q.count()
    profiles = q.order_by(
        text("CASE WHEN nome IS NULL OR nome = '' THEN 1 ELSE 0 END, nome ASC")
    ).offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit)),
        "items": [_profile_out(p) for p in profiles],
    }


@router.get("/export")
def export_clients(db: Session = Depends(get_db)):
    """Exporta todos os perfis de clientes como planilha Excel."""
    profiles = db.query(ClientProfile).order_by(
        text("CASE WHEN nome IS NULL OR nome = '' THEN 1 ELSE 0 END, nome ASC")
    ).all()

    rows = [{
        "id_smart":    p.id_smart    or "",
        "nome":        p.nome        or "",
        "cnpj":        p.cnpj        or "",
        "telefone":    p.telefone    or "",
        "email":       p.email       or "",
        "logradouro":  p.logradouro  or "",
        "numero":      p.numero      or "",
        "complemento": p.complemento or "",
        "bairro":      p.bairro      or "",
        "cep":         p.cep         or "",
        "cidade":      p.cidade      or "",
        "estado":      p.estado      or "",
        "banco":       p.bank.nome   if p.bank else "",
        "agencia":     p.bank.agencia if p.bank else "",
        "conta":       p.bank.conta   if p.bank else "",
        "digito":      p.bank.digito  if p.bank else "",
        "tipo_chave_pix": p.bank.tipo_chave_pix if p.bank else "",
        "chave_pix":   p.bank.chave_pix if p.bank else "",
    } for p in profiles]

    df = pd.DataFrame(rows, columns=[
        "id_smart", "nome", "cnpj", "telefone", "email",
        "logradouro", "numero", "complemento", "bairro", "cep", "cidade", "estado",
        "banco", "agencia", "conta", "digito", "tipo_chave_pix", "chave_pix",
    ])
    buf = io.BytesIO()
    df.to_excel(buf, index=False, sheet_name="Clientes")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=clientes.xlsx"},
    )


@router.get("/{id_smart}")
def get_profile(id_smart: str, db: Session = Depends(get_db)):
    p = db.get(ClientProfile, id_smart)
    if not p:
        raise HTTPException(404, "Cliente não encontrado")
    return _profile_out(p)


@router.patch("/{id_smart}")
def update_profile(id_smart: str, data: ProfileUpdate, db: Session = Depends(get_db)):
    p = db.get(ClientProfile, id_smart)
    if not p:
        raise HTTPException(404, "Cliente não encontrado")
    if data.banco_id is not None:
        if data.banco_id == 0:
            p.banco_id = None
        else:
            if not db.get(Bank, data.banco_id):
                raise HTTPException(400, "Banco não encontrado")
            p.banco_id = data.banco_id
    for k, v in data.model_dump(exclude_none=True, exclude={"banco_id"}).items():
        setattr(p, k, v)
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return _profile_out(p)


# ══════════════════════════════════════════════════════════════════════════════
# SINCRONIZAÇÃO ASAAS
# ══════════════════════════════════════════════════════════════════════════════

def _build_ym_cutoff():
    now = datetime.now(timezone.utc)
    m3 = now.month - 3
    y3 = now.year + (m3 - 1) // 12
    m3 = ((m3 - 1) % 12) + 1
    return y3 * 100 + m3


async def _run_sync(rows: list):
    """Executa a sincronização em background — uma sessão por commit."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        asaas = get_asaas_client(db)
        synced = 0
        for id_smart, cpf_cnpj, nome_billing in rows:
            cpf_cnpj_clean = re.sub(r"\D", "", str(cpf_cnpj or ""))
            if not cpf_cnpj_clean:
                continue
            try:
                asaas_customer = await asaas.get_customer(cpf_cnpj_clean)

                p = db.get(ClientProfile, id_smart)
                if p is None:
                    p = ClientProfile(id_smart=id_smart)
                    db.add(p)

                p.cnpj = cpf_cnpj_clean
                # Nome: Asaas > billing_client_summaries > valor existente
                p.nome = (asaas_customer or {}).get("name") or nome_billing or p.nome or ""

                if asaas_customer:
                    p.asaas_id = asaas_customer.get("id")
                    if not p.email:
                        p.email = asaas_customer.get("email")
                    if not p.telefone:
                        p.telefone = asaas_customer.get("mobilePhone") or asaas_customer.get("phone")
                    if not p.logradouro:
                        p.logradouro  = asaas_customer.get("address")
                        p.numero      = asaas_customer.get("addressNumber")
                        p.complemento = asaas_customer.get("complement")
                        p.bairro      = asaas_customer.get("province")
                        p.cep         = re.sub(r"\D", "", asaas_customer.get("postalCode") or "")
                        p.cidade      = asaas_customer.get("cityName")   # nome da cidade, não código IBGE
                        p.estado      = asaas_customer.get("state")
                elif nome_billing and not p.nome:
                    # Sem Asaas: usa nome do billing mesmo assim
                    p.nome = nome_billing

                p.updated_at = datetime.now(timezone.utc)
                db.commit()
                synced += 1
            except Exception:
                db.rollback()
        print(f"[sync-asaas] concluído: {synced}/{len(rows)} clientes", flush=True)
    finally:
        db.close()


@router.post("/sync-asaas")
async def sync_from_asaas(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Inicia sincronização em background: busca CNPJs dos últimos 3 meses no billing,
    consulta o Asaas e faz upsert nos client_profiles.
    """
    ym_cutoff = _build_ym_cutoff()
    rows = db.execute(text("""
        SELECT bl.id_smart,
               SUBSTRING(bl.id_smart FROM 4)   AS cnpj,
               MAX(bcs.nome_cliente)            AS nome_billing
        FROM billing_lines bl
        JOIN billing_cycles bc  ON bc.id = bl.cycle_id
        LEFT JOIN billing_client_summaries bcs
               ON bcs.id_smart = bl.id_smart
        WHERE (bc.year * 100 + bc.month) >= :ym_cutoff
          AND bl.id_smart IS NOT NULL
          AND LEFT(bl.id_smart, 3) = 'ss_'
        GROUP BY bl.id_smart
        ORDER BY bl.id_smart
    """), {"ym_cutoff": ym_cutoff}).fetchall()

    if not rows:
        return {"status": "ok", "total": 0, "message": "Nenhum cliente nos últimos 3 meses"}

    background_tasks.add_task(_run_sync, list(rows))
    return {"status": "started", "total": len(rows), "message": f"Sincronizando {len(rows)} clientes em background. Atualize a lista em alguns minutos."}


# ══════════════════════════════════════════════════════════════════════════════
# IMPORTAÇÃO VIA PLANILHA
# ══════════════════════════════════════════════════════════════════════════════

_COL_MAP = {
    # possíveis nomes de colunas na planilha → campo no ClientProfile
    "id_smart":    "id_smart",
    "cnpj":        "cnpj",
    "cpf_cnpj":    "cnpj",
    "cpf/cnpj":    "cnpj",
    "nome":        "nome",
    "razao_social":"nome",
    "razão social":"nome",
    "telefone":    "telefone",
    "celular":     "telefone",
    "fone":        "telefone",
    "email":       "email",
    "e-mail":      "email",
    "logradouro":  "logradouro",
    "rua":         "logradouro",
    "endereco":    "logradouro",
    "endereço":    "logradouro",
    "numero":      "numero",
    "número":      "numero",
    "complemento": "complemento",
    "bairro":      "bairro",
    "cep":         "cep",
    "cidade":      "cidade",
    "estado":      "estado",
    "uf":          "estado",
    "banco":       "_banco_nome",  # nome do banco — lookup no DB
}

EDITABLE = {"telefone","email","logradouro","numero","complemento","bairro","cep","cidade","estado"}


@router.post("/import")
async def import_clients(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content))
    except Exception:
        raise HTTPException(400, "Arquivo inválido — envie um .xlsx")

    # Normalizar cabeçalhos
    df.columns = [str(c).strip().lower() for c in df.columns]
    col_map = {c: _COL_MAP[c] for c in df.columns if c in _COL_MAP}
    if not col_map:
        raise HTTPException(400, "Nenhuma coluna reconhecida. Verifique os cabeçalhos da planilha.")

    df = df.rename(columns=col_map)
    if "id_smart" not in df.columns and "cnpj" not in df.columns:
        raise HTTPException(400, "Planilha precisa ter coluna id_smart ou cnpj")

    # Cache de bancos por nome
    banks_by_name = {b.nome.lower(): b.id for b in db.query(Bank).all()}

    updated = created = skipped = 0
    for _, row in df.iterrows():
        id_smart = str(row.get("id_smart", "")).strip() if "id_smart" in df.columns else None
        cnpj_raw = re.sub(r"\D", "", str(row.get("cnpj", ""))) if "cnpj" in df.columns else None

        # Resolver id_smart a partir do cnpj se necessário
        if not id_smart and cnpj_raw:
            id_smart = f"ss_{cnpj_raw}"
        if not id_smart:
            skipped += 1
            continue

        p = db.get(ClientProfile, id_smart)
        if p is None:
            p = ClientProfile(id_smart=id_smart)
            if cnpj_raw:
                p.cnpj = cnpj_raw
            if "nome" in df.columns:
                p.nome = str(row.get("nome", "")).strip() or None
            db.add(p)
            created += 1
        else:
            updated += 1

        for field in EDITABLE:
            if field in df.columns:
                val = row.get(field)
                if pd.notna(val) and str(val).strip():
                    setattr(p, field, str(val).strip())

        if "_banco_nome" in df.columns:
            bn = str(row.get("_banco_nome", "")).strip().lower()
            if bn and bn in banks_by_name:
                p.banco_id = banks_by_name[bn]

        p.updated_at = datetime.now(timezone.utc)

    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}
