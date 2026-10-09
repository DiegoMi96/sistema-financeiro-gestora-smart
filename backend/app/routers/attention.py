"""
Aba "Atenção" do Faturamento — CRUD dos clientes que exigem atenção extra.

O motor (billing.py → _run_billing_engine) lê esta tabela a cada ciclo; ver
app/services/attention.py. Permissão: a mesma de editar faturamento (can_edit_billing).
"""
import io
import re
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.permissions import require_permission
from app.database import get_db
from app.models import AuditLog, ClientAttention, ClientProfile, User
from app.services.attention import DESCONTO_TIPOS, MOTIVOS, norm_id

router = APIRouter(prefix="/attention", tags=["Atenção"])

_perm = require_permission("can_edit_billing")


class AttentionIn(BaseModel):
    id_smart: Optional[str] = None
    cnpj: Optional[str] = None
    nome: Optional[str] = None
    proporcional: bool = False
    motivo: str
    desconto_tipo: Optional[str] = None
    desconto_valor: Optional[float] = None
    obs: Optional[str] = None


def _out(a: ClientAttention) -> dict:
    return {
        "id": a.id,
        "id_smart": a.id_smart,
        "cnpj": a.cnpj,
        "nome": a.nome,
        "proporcional": bool(a.proporcional),
        "motivo": a.motivo,
        "desconto_tipo": a.desconto_tipo,
        "desconto_valor": a.desconto_valor,
        "obs": a.obs,
        "updated_at": a.updated_at.isoformat() if a.updated_at else (a.created_at.isoformat() if a.created_at else None),
        "updated_by": a.updated_by,
    }


def _validar(data: AttentionIn) -> dict:
    """Normaliza e valida; devolve os campos prontos pra gravar."""
    motivo = (data.motivo or "").strip().lower()
    if motivo not in MOTIVOS:
        raise HTTPException(status_code=422, detail="Motivo inválido — use Ativação, Cancelamento ou Desconto.")
    cid = norm_id(data.id_smart) or norm_id(data.cnpj)
    if not cid:
        raise HTTPException(status_code=422, detail="Informe o CNPJ/CPF ou o ID Smart do cliente.")
    digits = re.sub(r"\D", "", cid)
    out = {
        "id_smart": cid,
        "cnpj": re.sub(r"\D", "", data.cnpj or "") or digits,
        "nome": (data.nome or "").strip() or None,
        "motivo": motivo,
        "obs": (data.obs or "").strip() or None,
        "proporcional": False,
        "desconto_tipo": None,
        "desconto_valor": None,
    }
    if motivo == "desconto":
        tipo = (data.desconto_tipo or "").strip().lower()
        valor = data.desconto_valor
        if tipo not in DESCONTO_TIPOS:
            raise HTTPException(status_code=422, detail="Desconto: escolha o tipo (percentual ou valor em R$).")
        if valor is None or valor <= 0:
            raise HTTPException(status_code=422, detail="Desconto: informe um valor maior que zero.")
        if tipo == "percentual" and valor > 100:
            raise HTTPException(status_code=422, detail="Desconto percentual não pode passar de 100%.")
        out["desconto_tipo"], out["desconto_valor"] = tipo, float(valor)
    else:
        out["proporcional"] = bool(data.proporcional)
    return out


def _preencher_nome(db: Session, campos: dict) -> None:
    """Se o nome não veio, tenta achar pelo cadastro de clientes (client_profiles)."""
    if campos.get("nome"):
        return
    p = db.query(ClientProfile).filter(ClientProfile.id_smart == campos["id_smart"]).first()
    if p and p.nome:
        campos["nome"] = p.nome


@router.get("")
def listar(search: str = "", motivo: str = "", db: Session = Depends(get_db), _=Depends(_perm)):
    q = db.query(ClientAttention)
    if motivo in MOTIVOS:
        q = q.filter(ClientAttention.motivo == motivo)
    if search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            ClientAttention.nome.ilike(like) | ClientAttention.cnpj.ilike(like)
            | ClientAttention.id_smart.ilike(like) | ClientAttention.obs.ilike(like)
        )
    rows = q.order_by(ClientAttention.nome.asc().nullslast(), ClientAttention.id_smart.asc(), ClientAttention.motivo.asc()).all()
    return [_out(a) for a in rows]


@router.get("/lookup")
def buscar_cliente(q: str = "", db: Session = Depends(get_db), _=Depends(_perm)):
    """Autocompletar: acha o cliente por nome, CNPJ/CPF ou ID Smart pra preencher a linha sozinha."""
    q = q.strip()
    if len(q) < 3:
        return []
    like = f"%{q}%"
    digits = re.sub(r"\D", "", q)
    cond = ClientProfile.nome.ilike(like) | ClientProfile.id_smart.ilike(like)
    if digits:
        cond = cond | ClientProfile.cnpj.ilike(f"%{digits}%") | ClientProfile.id_smart.ilike(f"%{digits}%")
    rows = db.query(ClientProfile).filter(cond).order_by(ClientProfile.nome.asc()).limit(12).all()
    return [{"id_smart": r.id_smart, "cnpj": r.cnpj, "nome": r.nome} for r in rows]


@router.post("", status_code=201)
def criar(data: AttentionIn, db: Session = Depends(get_db), user: User = Depends(_perm)):
    campos = _validar(data)
    if db.query(ClientAttention).filter(
        ClientAttention.id_smart == campos["id_smart"], ClientAttention.motivo == campos["motivo"]
    ).first():
        raise HTTPException(status_code=409, detail="Esse cliente já está na lista com esse motivo — edite a linha existente.")
    _preencher_nome(db, campos)
    a = ClientAttention(**campos, updated_by=user.name)
    db.add(a)
    db.add(AuditLog(user_id=user.id, action="attention.create", entity="client_attention", details={"id_smart": a.id_smart, "motivo": a.motivo}))
    db.commit()
    db.refresh(a)
    return _out(a)


@router.put("/{item_id}")
def editar(item_id: int, data: AttentionIn, db: Session = Depends(get_db), user: User = Depends(_perm)):
    a = db.query(ClientAttention).filter(ClientAttention.id == item_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    campos = _validar(data)
    dup = db.query(ClientAttention).filter(
        ClientAttention.id_smart == campos["id_smart"], ClientAttention.motivo == campos["motivo"],
        ClientAttention.id != item_id,
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Já existe outra linha desse cliente com esse motivo.")
    _preencher_nome(db, campos)
    for k, v in campos.items():
        setattr(a, k, v)
    a.updated_by = user.name
    db.add(AuditLog(user_id=user.id, action="attention.update", entity="client_attention", entity_id=item_id,
                    details={"id_smart": a.id_smart, "motivo": a.motivo}))
    db.commit()
    db.refresh(a)
    return _out(a)


@router.delete("/{item_id}", status_code=204)
def excluir(item_id: int, db: Session = Depends(get_db), user: User = Depends(_perm)):
    a = db.query(ClientAttention).filter(ClientAttention.id == item_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    db.add(AuditLog(user_id=user.id, action="attention.delete", entity="client_attention", entity_id=item_id,
                    details={"id_smart": a.id_smart, "motivo": a.motivo}))
    db.delete(a)
    db.commit()


@router.post("/import")
async def importar_planilha(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(_perm)):
    """
    Importa a planilha antiga "Atencao_com_esses_clientes.xlsx" (aba "Cancelamento e Suspenção":
    colunas CNPJ, ID, Status). Status com "Cancelamento" → cancelamento proporcional; com "Ativa…" →
    ativação proporcional. Linhas já existentes (mesmo cliente + motivo) são ignoradas, não duplicam.
    """
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content), sheet_name="Cancelamento e Suspenção", engine="openpyxl", header=0)
    except Exception:
        raise HTTPException(status_code=422, detail='Não achei a aba "Cancelamento e Suspenção" nessa planilha.')
    while len(df.columns) < 3:
        df[f"_c{len(df.columns)}"] = None
    df.columns = ["cnpj", "id", "status"] + [f"_c{i}" for i in range(len(df.columns) - 3)]
    df = df.dropna(subset=["id"])
    criados = ignorados = invalidos = 0
    vistos: set = set()
    for _, r in df.iterrows():
        cid = norm_id(r["id"])
        status = str(r["status"] if pd.notna(r["status"]) else "")
        if "cancelamento" in status.lower():
            motivo = "cancelamento"
        elif "ativa" in status.lower():
            motivo = "ativacao"
        else:
            invalidos += 1
            continue
        if not cid:
            invalidos += 1
            continue
        chave = (cid, motivo)
        if chave in vistos or db.query(ClientAttention).filter(
            ClientAttention.id_smart == cid, ClientAttention.motivo == motivo).first():
            ignorados += 1
            continue
        vistos.add(chave)
        campos = {"id_smart": cid, "cnpj": re.sub(r"\D", "", str(r["cnpj"] if pd.notna(r["cnpj"]) else "")) or re.sub(r"\D", "", cid),
                  "nome": None, "motivo": motivo, "proporcional": True, "obs": "Importado da planilha de atenção"}
        _preencher_nome(db, campos)
        db.add(ClientAttention(**campos, updated_by=user.name))
        criados += 1
    db.add(AuditLog(user_id=user.id, action="attention.import", entity="client_attention",
                    details={"arquivo": file.filename, "criados": criados, "ignorados": ignorados, "invalidos": invalidos}))
    db.commit()
    return {"criados": criados, "ignorados": ignorados, "invalidos": invalidos}
