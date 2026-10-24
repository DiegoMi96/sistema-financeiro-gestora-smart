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
from app.models import AuditLog, Bank, ClientProfile, BillingLine, BillingCycle
from app.config import settings
from app.services.asaas_client import get_asaas_client

# Segurança: todos os endpoints de clientes exigem login, acesso ao módulo Faturamento (`can_view_faturamento` — a aba mora lá) E a
# habilitação própria `can_view_fat_clientes` (por usuário/perfil na Gestão de Acessos) — o cadastro tem CNPJ, e-mail, telefone,
# endereço e contas bancárias (LGPD). Uma sem a outra não basta.
router = APIRouter(prefix="/clients", tags=["clients"], dependencies=[Depends(require_permission("can_view_faturamento")), Depends(require_permission("can_view_fat_clientes"))])

# Escrita (criar/editar/importar/sincronizar) exige can_edit_billing.
# Leitura = qualquer usuário logado (igual à tela /clientes no app).
_require_edit_client = Depends(require_permission("can_edit_billing"))


# ── Schemas ───────────────────────────────────────────────────────────────────

class BankCreate(BaseModel):
    nome:           str

class BankUpdate(BaseModel):
    nome:           Optional[str] = None

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

_LIMITES = {"telefone": 30, "email": 150, "logradouro": 200, "numero": 20, "complemento": 100, "bairro": 100, "cep": 10, "cidade": 100, "estado": 2}
_UFS = {"AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"}


def _campo_limpo(campo: str, valor):
    """Normaliza e valida UM campo do cadastro. Devolve o valor limpo ou levanta ValueError com a mensagem para o usuário.
    Vazio/'nan'/'none' vira None (não apaga nem grava lixo)."""
    if valor is None:
        return None
    v = str(valor).strip()
    if v.lower() in ("", "nan", "none", "null"):
        return None
    if campo == "email":
        from app.services.cobranca import emails_validos
        lista = emails_validos(v)
        if not lista:
            raise ValueError("e-mail inválido")
        v = ", ".join(lista)
    elif campo == "estado":
        v = v.upper()
        if v not in _UFS:
            raise ValueError("UF inválida")
    elif campo == "cep":
        d = re.sub(r"\D", "", v)
        if len(d) != 8:
            raise ValueError("CEP deve ter 8 dígitos")
        v = d
    elif campo == "telefone":
        if not re.fullmatch(r"[0-9 ()+\-]{8,30}", v):
            raise ValueError("telefone inválido")
    if len(v) > _LIMITES.get(campo, 255):
        raise ValueError(f"texto muito longo (máx. {_LIMITES.get(campo, 255)})")
    return v


def _audit(db: Session, user, acao: str, detalhes: dict):
    db.add(AuditLog(user_id=getattr(user, "id", None), action=acao, entity="client", details=detalhes))

def _bank_out(b: Bank) -> dict:
    # só o nome: agência/conta/PIX saíram da tela e da API (24/10/2026, pedido do Diego); as colunas seguem no banco, intactas
    return {"id": b.id, "nome": b.nome}

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

@router.get("/banks", dependencies=[_require_edit_client])
def list_banks(db: Session = Depends(get_db)):
    return [_bank_out(b) for b in db.query(Bank).order_by(Bank.nome).all()]


@router.post("/banks", status_code=201, dependencies=[_require_edit_client])
def create_bank(data: BankCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if db.query(Bank).filter(Bank.nome == data.nome).first():
        raise HTTPException(400, "Já existe um banco com esse nome")
    b = Bank(**data.model_dump())
    db.add(b)
    _audit(db, current_user, "clients.banco_criar", {"nome": data.nome})
    db.commit()
    db.refresh(b)
    return _bank_out(b)


@router.patch("/banks/{bank_id}", dependencies=[_require_edit_client])
def update_bank(bank_id: int, data: BankUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    b = db.get(Bank, bank_id)
    if not b:
        raise HTTPException(404, "Banco não encontrado")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(b, k, v)
    _audit(db, current_user, "clients.banco_editar", {"id": bank_id, "campos": list(data.model_dump(exclude_none=True).keys())})
    db.commit()
    db.refresh(b)
    return _bank_out(b)


@router.delete("/banks/{bank_id}", status_code=204, dependencies=[_require_edit_client])
def delete_bank(bank_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    b = db.get(Bank, bank_id)
    if not b:
        raise HTTPException(404, "Banco não encontrado")
    if b.profiles:
        raise HTTPException(400, "Banco em uso — remova a associação dos clientes antes")
    _audit(db, current_user, "clients.banco_remover", {"id": bank_id, "nome": b.nome})
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


@router.get("/export", dependencies=[_require_edit_client])
def export_clients(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
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
    } for p in profiles]

    df = pd.DataFrame(rows, columns=[
        "id_smart", "nome", "cnpj", "telefone", "email",
        "logradouro", "numero", "complemento", "bairro", "cep", "cidade", "estado",
        "banco",
    ])
    # texto que começa com = + - @ viraria fórmula no Excel (injeção): neutraliza
    _neutro = lambda x: ("'" + x) if isinstance(x, str) and x[:1] in ("=", "+", "-", "@") else x
    df = df.map(_neutro) if hasattr(df, "map") else df.applymap(_neutro)
    _audit(db, current_user, "clients.export", {"linhas": len(rows)}); db.commit()
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


@router.patch("/{id_smart}", dependencies=[_require_edit_client])
def update_profile(id_smart: str, data: ProfileUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
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
    alterados = {}
    for k, v in data.model_dump(exclude_none=True, exclude={"banco_id"}).items():
        try:
            limpo = _campo_limpo(k, v)
        except ValueError as ex:
            raise HTTPException(400, f"Campo '{k}': {ex}")
        if str(v).strip() == "":                  # o usuário apagou o campo de propósito
            limpo = None
        if getattr(p, k) != limpo:
            alterados[k] = [getattr(p, k), limpo] if k in ("email", "telefone") else "alterado"
            setattr(p, k, limpo)
    p.updated_at = datetime.now(timezone.utc)
    if alterados or data.banco_id is not None:
        _audit(db, current_user, "clients.editar", {"id_smart": id_smart, "campos": alterados, "banco_id": data.banco_id})
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


@router.post("/sync-asaas", dependencies=[_require_edit_client])
async def sync_from_asaas(background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Inicia sincronização em background: busca CNPJs dos últimos 3 meses no billing,
    consulta o Asaas e faz upsert nos client_profiles.
    """
    ult = db.execute(text("SELECT value FROM system_settings WHERE key = 'clients_sync_ultima'")).scalar()
    try:
        if ult and (datetime.now(timezone.utc) - datetime.fromisoformat(ult)).total_seconds() < 300:
            raise HTTPException(429, "Já há uma sincronização recente. Aguarde 5 minutos.")
    except ValueError:
        pass
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

    agora = datetime.now(timezone.utc).isoformat()
    if not db.execute(text("UPDATE system_settings SET value = :v, updated_at = now() WHERE key = 'clients_sync_ultima'"), {"v": agora}).rowcount:
        db.execute(text("INSERT INTO system_settings (key, value) VALUES ('clients_sync_ultima', :v)"), {"v": agora})
    _audit(db, current_user, "clients.sync_asaas", {"total": len(rows)})
    db.commit()
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


@router.post("/import", dependencies=[_require_edit_client])
async def import_clients(file: UploadFile = File(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Arquivo muito grande (máx. 5 MB).")
    try:
        df = pd.read_excel(io.BytesIO(content), dtype=str)
    except Exception:
        raise HTTPException(400, "Arquivo inválido — envie um .xlsx")
    if len(df) > 20000:
        raise HTTPException(400, "Planilha com linhas demais (máx. 20.000).")

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
    erros = []
    for n, (_, row) in enumerate(df.iterrows(), start=2):
        id_smart = _campo_limpo("id_smart", row.get("id_smart")) if "id_smart" in df.columns else None
        cnpj_raw = re.sub(r"\D", "", str(row.get("cnpj", "") or "")) if "cnpj" in df.columns else None

        # Resolver id_smart a partir do cnpj se necessário
        if not id_smart and cnpj_raw:
            id_smart = f"ss_{cnpj_raw}"
        if not id_smart or not re.fullmatch(r"ss_\d{6,20}", id_smart):
            skipped += 1
            continue

        novos, invalido = {}, None
        for field in EDITABLE:
            if field in df.columns:
                try:
                    limpo = _campo_limpo(field, row.get(field))
                except ValueError as ex:
                    invalido = f"linha {n}: {field} — {ex}"
                    break
                if limpo is not None:
                    novos[field] = limpo
        if invalido:                                   # linha com dado ruim é pulada inteira (nada pela metade) e relatada
            erros.append(invalido)
            skipped += 1
            continue

        p = db.get(ClientProfile, id_smart)
        if p is None:
            p = ClientProfile(id_smart=id_smart)
            if cnpj_raw:
                p.cnpj = cnpj_raw[:20]
            if "nome" in df.columns:
                nome = _campo_limpo("nome", row.get("nome"))
                p.nome = nome[:255] if nome else None
            db.add(p)
            created += 1
        else:
            updated += 1
        for k, v in novos.items():
            setattr(p, k, v)

        if "_banco_nome" in df.columns:
            bn = str(row.get("_banco_nome", "") or "").strip().lower()
            if bn and bn in banks_by_name:
                p.banco_id = banks_by_name[bn]

        p.updated_at = datetime.now(timezone.utc)

    _audit(db, current_user, "clients.import", {"criados": created, "atualizados": updated, "ignorados": skipped, "arquivo": (file.filename or "")[:80]})
    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "erros": erros[:20]}
