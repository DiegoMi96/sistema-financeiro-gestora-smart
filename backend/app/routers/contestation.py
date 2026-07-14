"""
Router do Módulo de Contestação — Gestora Smart
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

from app.database import get_db
from app.models import User, AuditLog
from app.models.contestation import (
    ContestationCycle, ContestationItem, ContestationCredit,
    ContestationCycleStatus, ContestationItemStatus, ContestationItemType
)
from app.routers.auth import get_current_user

router = APIRouter(prefix="/contestation", tags=["Contestação"])

# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────

class ItemReview(BaseModel):
    status:             ContestationItemStatus
    observacao_manual:  Optional[str] = None


class CreditCreate(BaseModel):
    ref_year:         int
    ref_month:        int
    valor_contestado: float
    valor_recebido:   float
    data_recebimento: date
    observacao:       Optional[str] = None
    comprovante:      Optional[str] = None


# ─────────────────────────────────────────────
# CICLOS
# ─────────────────────────────────────────────

@router.get("/cycles")
def list_cycles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cycles = db.query(ContestationCycle).order_by(
        ContestationCycle.year.desc(), ContestationCycle.month.desc()
    ).all()
    return [_cycle_dict(c) for c in cycles]


@router.get("/cycles/{cycle_id}")
def get_cycle(
    cycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(ContestationCycle).filter(ContestationCycle.id == cycle_id).first()
    if not c:
        raise HTTPException(404, "Ciclo não encontrado")
    return _cycle_dict(c)


@router.post("/cycles/process")
async def process_contestation(
    background_tasks: BackgroundTasks,
    year:  int = 2026,
    month: int = 5,
    faturamento_file: UploadFile = File(...),
    fornecedor_file:  UploadFile = File(...),
    contratos_file:   UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload dos 3 arquivos e inicia o processamento em background."""
    existing = db.query(ContestationCycle).filter(
        ContestationCycle.year == year, ContestationCycle.month == month
    ).first()
    if existing and existing.status not in (ContestationCycleStatus.RASCUNHO,):
        raise HTTPException(400, f"Já existe contestação para {month:02d}/{year} com status '{existing.status}'")

    if existing:
        # Remove ciclo e filhos para reprocessar
        for item in existing.items: db.delete(item)
        for cr in existing.credits: db.delete(cr)
        db.delete(existing); db.flush()

    cycle = ContestationCycle(
        year=year, month=month,
        status=ContestationCycleStatus.RASCUNHO,
        created_by=current_user.id,
        arquivo_faturamento=faturamento_file.filename,
        arquivo_fornecedor=fornecedor_file.filename,
        arquivo_contratos=contratos_file.filename,
    )
    db.add(cycle); db.commit(); db.refresh(cycle)

    files_bytes = {
        "faturamento": await faturamento_file.read(),
        "fornecedor":  await fornecedor_file.read(),
        "contratos":   await contratos_file.read(),
    }

    background_tasks.add_task(
        _run_engine, cycle_id=cycle.id, year=year, month=month,
        files_bytes=files_bytes, user_id=current_user.id
    )

    return {"message": "Processamento iniciado", "cycle_id": cycle.id}


def _run_engine(cycle_id: int, year: int, month: int, files_bytes: dict, user_id: int):
    from app.services.contestation_engine import ContestationEngine
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        engine = ContestationEngine(year=year, month=month)
        results = engine.run(files_bytes)

        cycle = db.query(ContestationCycle).filter(ContestationCycle.id == cycle_id).first()
        if not cycle: return

        TYPE_MAP = {
            "valor_acima_contrato":    ContestationItemType.VALOR_ACIMA_CONTRATO,
            "pcte_adicional_indevido": ContestationItemType.PCTE_ADICIONAL_INDEVIDO,
            "linha_nao_identificada":  ContestationItemType.LINHA_NAO_IDENTIFICADA,
            "transferencia":           ContestationItemType.TRANSFERENCIA,
        }

        total_itens = 0
        for key, tipo in TYPE_MAP.items():
            for item_data in results.get(key, []):
                db.add(ContestationItem(
                    cycle_id=cycle_id, type=tipo,
                    msisdn=item_data.get("msisdn"),
                    iccid=item_data.get("iccid"),
                    operadora=item_data.get("operadora"),
                    operadora_forn=item_data.get("operadora_forn"),
                    id_pedido=str(item_data.get("id_pedido") or ""),
                    nome_pedido=item_data.get("nome_pedido"),
                    pacote_forn=item_data.get("pacote_forn"),
                    status_forn=item_data.get("status_forn"),
                    dias_forn=item_data.get("dias_forn"),
                    valor_contrato=item_data.get("valor_contrato", 0),
                    valor_esperado=item_data.get("valor_esperado", 0),
                    valor_produto=item_data.get("valor_produto", 0),
                    valor_faturado=item_data.get("valor_faturado", 0),
                    valor_excedente=item_data.get("valor_excedente", 0),
                    valor_diferenca=item_data.get("valor_diferenca", item_data.get("valor_faturado", 0)),
                    observacao=item_data.get("observacao"),
                ))
                total_itens += 1

        totais = results.get("totais", {})
        cycle.valor_cs             = results.get("cs_valor", 0)
        cycle.total_itens_detectados = total_itens
        cycle.total_itens_contestar  = sum(len(results.get(k, [])) for k in ["valor_acima_contrato","pcte_adicional_indevido","linha_nao_identificada"])
        cycle.valor_total_contestado = totais.get("total_contestado", 0)
        cycle.status = ContestationCycleStatus.REVISAO
        db.commit()

    except Exception as e:
        import traceback
        print(f"[contestation_engine] ERRO no ciclo {cycle_id}: {e}")
        traceback.print_exc()
        db.rollback()
        cycle = db.query(ContestationCycle).filter(ContestationCycle.id == cycle_id).first()
        if cycle: cycle.status = ContestationCycleStatus.RASCUNHO; db.commit()
    finally:
        db.close()


# ─────────────────────────────────────────────
# ITENS — listagem e revisão
# ─────────────────────────────────────────────

@router.get("/cycles/{cycle_id}/items")
def list_items(
    cycle_id: int,
    type: Optional[str]   = None,
    status: Optional[str] = None,
    page: int = 1,
    per_page: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(ContestationItem).filter(ContestationItem.cycle_id == cycle_id)
    if type:   query = query.filter(ContestationItem.type   == type)
    if status: query = query.filter(ContestationItem.status == status)

    total = query.count()
    items = query.order_by(
        ContestationItem.valor_diferenca.desc()
    ).offset((page-1)*per_page).limit(per_page).all()

    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [_item_dict(i) for i in items],
        "summary": _get_summary(cycle_id, db),
    }


@router.put("/cycles/{cycle_id}/items/{item_id}/review")
def review_item(
    cycle_id: int, item_id: int,
    data: ItemReview,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Miranda aprova ou ignora um item detectado."""
    item = db.query(ContestationItem).filter(
        ContestationItem.id == item_id,
        ContestationItem.cycle_id == cycle_id
    ).first()
    if not item: raise HTTPException(404, "Item não encontrado")

    item.status             = data.status
    item.observacao_manual  = data.observacao_manual
    item.reviewed_at        = datetime.utcnow()
    item.reviewed_by        = current_user.id

    # Atualiza totais do ciclo
    _update_cycle_totals(cycle_id, db)
    db.commit()
    return _item_dict(item)


@router.put("/cycles/{cycle_id}/items/bulk-review")
def bulk_review(
    cycle_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Aprova ou ignora múltiplos itens de uma vez.
    body: {"item_ids": [1,2,3], "status": "contestar", "observacao_manual": "..."}
    """
    item_ids = body.get("item_ids", [])
    status   = body.get("status", "contestar")
    obs      = body.get("observacao_manual")

    items = db.query(ContestationItem).filter(
        ContestationItem.id.in_(item_ids),
        ContestationItem.cycle_id == cycle_id
    ).all()

    for item in items:
        item.status            = status
        item.observacao_manual = obs
        item.reviewed_at       = datetime.utcnow()
        item.reviewed_by       = current_user.id

    _update_cycle_totals(cycle_id, db)
    db.commit()
    return {"updated": len(items)}


@router.post("/cycles/{cycle_id}/approve")
def approve_cycle(
    cycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aprova o ciclo — transição Revisão → Aprovado."""
    cycle = db.query(ContestationCycle).filter(ContestationCycle.id == cycle_id).first()
    if not cycle: raise HTTPException(404)
    if cycle.status != ContestationCycleStatus.REVISAO:
        raise HTTPException(400, f"Status atual: {cycle.status}")

    cycle.status      = ContestationCycleStatus.APROVADO
    cycle.approved_at = datetime.utcnow()
    cycle.approved_by = current_user.id
    db.commit()
    return {"message": "Ciclo aprovado"}


@router.post("/cycles/{cycle_id}/mark-sent")
def mark_sent(
    cycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marca como enviado ao fornecedor."""
    cycle = db.query(ContestationCycle).filter(ContestationCycle.id == cycle_id).first()
    if not cycle: raise HTTPException(404)
    cycle.status   = ContestationCycleStatus.ENVIADO
    cycle.sent_at  = datetime.utcnow()

    # Marca todos os itens aprovados como enviados
    db.query(ContestationItem).filter(
        ContestationItem.cycle_id == cycle_id,
        ContestationItem.status == ContestationItemStatus.CONTESTAR
    ).update({"status": ContestationItemStatus.ENVIADO})

    db.commit()
    return {"message": "Marcado como enviado"}


# ─────────────────────────────────────────────
# EXPORTAÇÃO
# ─────────────────────────────────────────────

@router.get("/cycles/{cycle_id}/export")
def export_excel(
    cycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.contestation_excel import generate_contestation_excel

    cycle   = db.query(ContestationCycle).filter(ContestationCycle.id == cycle_id).first()
    if not cycle: raise HTTPException(404)
    items   = db.query(ContestationItem).filter(ContestationItem.cycle_id == cycle_id).all()
    credits = db.query(ContestationCredit).filter(ContestationCredit.cycle_id == cycle_id).all()

    buf = generate_contestation_excel(cycle, items, credits)
    filename = f"Contestacao_{cycle.month:02d}_{cycle.year}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ─────────────────────────────────────────────
# CRÉDITOS
# ─────────────────────────────────────────────

@router.get("/cycles/{cycle_id}/credits")
def list_credits(
    cycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    credits = db.query(ContestationCredit).filter(
        ContestationCredit.cycle_id == cycle_id
    ).order_by(ContestationCredit.data_recebimento.desc()).all()
    return [_credit_dict(c) for c in credits]


@router.post("/cycles/{cycle_id}/credits", status_code=201)
def register_credit(
    cycle_id: int,
    data: CreditCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Registra crédito recebido do fornecedor."""
    cycle = db.query(ContestationCycle).filter(ContestationCycle.id == cycle_id).first()
    if not cycle: raise HTTPException(404)

    credit = ContestationCredit(
        cycle_id=cycle_id,
        ref_year=data.ref_year, ref_month=data.ref_month,
        valor_contestado=data.valor_contestado,
        valor_recebido=data.valor_recebido,
        data_recebimento=data.data_recebimento,
        observacao=data.observacao,
        comprovante=data.comprovante,
        created_by=current_user.id,
    )
    db.add(credit)

    # Atualiza total de créditos do ciclo
    todos_creditos = db.query(ContestationCredit).filter(
        ContestationCredit.cycle_id == cycle_id
    ).all()
    cycle.valor_total_credito = sum(c.valor_recebido for c in todos_creditos) + data.valor_recebido

    # Atualiza status do ciclo
    if cycle.valor_total_credito >= cycle.valor_total_contestado * 0.99:
        cycle.status = ContestationCycleStatus.CREDITO_TOTAL
    elif cycle.valor_total_credito > 0:
        cycle.status = ContestationCycleStatus.CREDITO_PARCIAL

    db.commit(); db.refresh(credit)
    return _credit_dict(credit)


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _update_cycle_totals(cycle_id: int, db: Session):
    items = db.query(ContestationItem).filter(ContestationItem.cycle_id == cycle_id).all()
    cycle = db.query(ContestationCycle).filter(ContestationCycle.id == cycle_id).first()
    if not cycle: return

    contestar = [i for i in items if i.status == ContestationItemStatus.CONTESTAR]
    cycle.total_itens_contestar  = len(contestar)
    cycle.valor_total_contestado = round(
        sum(i.valor_diferenca or i.valor_faturado or 0 for i in contestar), 2
    )


def _get_summary(cycle_id: int, db: Session) -> dict:
    items = db.query(ContestationItem).filter(ContestationItem.cycle_id == cycle_id).all()
    summary = {}
    for tipo in ContestationItemType:
        grupo = [i for i in items if i.type == tipo]
        summary[tipo.value] = {
            "total":    len(grupo),
            "contestar": len([i for i in grupo if i.status == ContestationItemStatus.CONTESTAR]),
            "ignorar":  len([i for i in grupo if i.status == ContestationItemStatus.IGNORAR]),
            "valor":    round(sum(i.valor_diferenca or i.valor_faturado or 0 for i in grupo), 2),
        }
    return summary


def _cycle_dict(c: ContestationCycle) -> dict:
    return {
        "id":                    c.id,
        "year":                  c.year,
        "month":                 c.month,
        "period":                f"{c.month:02d}/{c.year}",
        "status":                c.status,
        "total_itens_detectados":c.total_itens_detectados,
        "total_itens_contestar": c.total_itens_contestar,
        "valor_total_contestado":round(c.valor_total_contestado or 0, 2),
        "valor_total_credito":   round(c.valor_total_credito or 0, 2),
        "valor_cs":              round(c.valor_cs or 0, 2),
        "created_at":            c.created_at.isoformat() if c.created_at else None,
        "approved_at":           c.approved_at.isoformat() if c.approved_at else None,
        "sent_at":               c.sent_at.isoformat() if c.sent_at else None,
    }


def _item_dict(i: ContestationItem) -> dict:
    return {
        "id":               i.id,
        "type":             i.type,
        "status":           i.status,
        "msisdn":           i.msisdn,
        "iccid":            i.iccid,
        "operadora":        i.operadora,
        "operadora_forn":   i.operadora_forn,
        "id_pedido":        i.id_pedido,
        "nome_pedido":      i.nome_pedido,
        "pacote_forn":      i.pacote_forn,
        "status_forn":      i.status_forn,
        "dias_forn":        i.dias_forn,
        "valor_contrato":   round(i.valor_contrato or 0, 2),
        "valor_esperado":   round(i.valor_esperado or 0, 4),
        "valor_produto":    round(i.valor_produto or 0, 2),
        "valor_faturado":   round(i.valor_faturado or 0, 2),
        "valor_excedente":  round(i.valor_excedente or 0, 2),
        "valor_diferenca":  round(i.valor_diferenca or 0, 2),
        "observacao":       i.observacao,
        "observacao_manual":i.observacao_manual,
        "reviewed_at":      i.reviewed_at.isoformat() if i.reviewed_at else None,
    }


def _credit_dict(c: ContestationCredit) -> dict:
    return {
        "id":               c.id,
        "ref_year":         c.ref_year,
        "ref_month":        c.ref_month,
        "valor_contestado": round(c.valor_contestado, 2),
        "valor_recebido":   round(c.valor_recebido, 2),
        "data_recebimento": c.data_recebimento.isoformat() if c.data_recebimento else None,
        "observacao":       c.observacao,
        "created_at":       c.created_at.isoformat() if c.created_at else None,
    }


# ─────────────────────────────────────────────
# ALLCOM PEDIDOS
# ─────────────────────────────────────────────

@router.post("/allcom/upload", status_code=201)
async def upload_allcom_pedidos(
    file: UploadFile = File(...),
    ref: str = "auto",   # "auto" = mês atual, ou "YYYY-MM" explícito
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Faz upload da planilha mensal de pedidos a pagar da Allcom.
    Detecta e ignora pedidos com ID já cadastrado (duplicatas).
    """
    import io
    import pandas as pd
    from datetime import date
    from app.models.contestation import AllcomPedido

    data = await file.read()
    df = pd.read_excel(io.BytesIO(data), sheet_name="Pedidos A Pagar", dtype={"ID": int})

    if ref == "auto":
        today = date.today()
        upload_ref = f"{today.year}-{today.month:02d}"
    else:
        upload_ref = ref

    # IDs já no banco
    existing_ids = {
        r[0] for r in db.execute(
            __import__('sqlalchemy').text("SELECT pedido_id FROM allcom_pedidos")
        ).fetchall()
    }

    novos, duplicatas = [], []

    for _, row in df.iterrows():
        pid = int(row["ID"]) if pd.notna(row["ID"]) else None
        if not pid:
            continue
        if pid in existing_ids:
            duplicatas.append(pid)
            continue

        def _date(v):
            if pd.isna(v): return None
            try: return pd.to_datetime(v).date()
            except: return None

        db.add(AllcomPedido(
            pedido_id=pid,
            descricao=str(row.get("Descrição") or ""),
            contrato=str(row.get("Contrato") or ""),
            tipo_compartilhamento=str(row.get("Tipo de Compartilhamento") or ""),
            franquia_mb=float(row["Franquia (MB)"]) if pd.notna(row.get("Franquia (MB)")) else None,
            mensalidade=float(row["Mensalidade (R$)"]) if pd.notna(row.get("Mensalidade (R$)")) else None,
            preco_ativacao=float(row["Preço de Ativação (R$)"]) if pd.notna(row.get("Preço de Ativação (R$)")) else None,
            preco_exc_mb=float(row["Preço do Exc. por MB (R$)"]) if pd.notna(row.get("Preço do Exc. por MB (R$)")) else None,
            data_ativacao=_date(row.get("Data de Ativação")),
            pre_ativacao_dias=int(row["Prazo de Pré-Ativação (dias)"]) if pd.notna(row.get("Prazo de Pré-Ativação (dias)")) else None,
            bloqueio_automatico=str(row.get("Bloqueio Automático") or ""),
            roaming=str(row.get("Roaming") or ""),
            status=str(row.get("Status") or ""),
            upload_ref=upload_ref,
            uploaded_by=current_user.id,
        ))
        novos.append(pid)
        existing_ids.add(pid)

    db.commit()
    return {
        "upload_ref": upload_ref,
        "novos": len(novos),
        "duplicatas": len(duplicatas),
        "duplicatas_ids": duplicatas[:20],  # primeiros 20 para exibir
    }


@router.get("/allcom/pedidos")
def list_allcom_pedidos(
    upload_ref: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    per_page: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.contestation import AllcomPedido
    from sqlalchemy import text as _text

    query = db.query(AllcomPedido)
    if upload_ref:
        query = query.filter(AllcomPedido.upload_ref == upload_ref)
    if search:
        query = query.filter(
            AllcomPedido.descricao.ilike(f"%{search}%") |
            AllcomPedido.contrato.ilike(f"%{search}%")
        )

    total = query.count()
    items = query.order_by(AllcomPedido.pedido_id.desc()).offset((page-1)*per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "items": [_pedido_dict(i) for i in items],
    }


@router.get("/allcom/refs")
def list_allcom_refs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista os meses de upload disponíveis."""
    from sqlalchemy import text as _text
    rows = db.execute(_text(
        "SELECT DISTINCT upload_ref, COUNT(*) as qtd FROM allcom_pedidos GROUP BY upload_ref ORDER BY upload_ref DESC"
    )).fetchall()
    return [{"ref": r.upload_ref, "qtd": r.qtd} for r in rows]


@router.get("/allcom/stats")
def allcom_stats(
    upload_ref: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Agrega estatísticas do mês por contrato/operadora."""
    from sqlalchemy import text as _text

    where = "WHERE upload_ref = :ref" if upload_ref else ""
    params = {"ref": upload_ref} if upload_ref else {}

    total_row = db.execute(_text(f"""
        SELECT COUNT(*) as total_linhas
        FROM allcom_pedidos
        {where}
    """), params).fetchone()

    por_contrato = db.execute(_text(f"""
        SELECT contrato,
               COUNT(*) as qtd_linhas,
               SUM(pre_ativacao_dias) as total_pre_ativacao,
               SUM(franquia_mb) as total_franquia,
               SUM(mensalidade) as total_mensalidade
        FROM allcom_pedidos
        {where}
        GROUP BY contrato
        ORDER BY total_mensalidade DESC
    """), params).fetchall()

    return {
        "total_linhas": total_row.total_linhas or 0,
        "por_contrato": [
            {
                "contrato": r.contrato or "—",
                "qtd_linhas": r.qtd_linhas,
                "total_pre_ativacao": int(r.total_pre_ativacao or 0),
                "total_franquia": round(r.total_franquia or 0, 0),
                "total_mensalidade": round(r.total_mensalidade or 0, 2),
            }
            for r in por_contrato
        ],
    }


def _pedido_dict(p) -> dict:
    return {
        "id":                    p.id,
        "pedido_id":             p.pedido_id,
        "descricao":             p.descricao,
        "contrato":              p.contrato,
        "tipo_compartilhamento": p.tipo_compartilhamento,
        "franquia_mb":           p.franquia_mb,
        "mensalidade":           round(p.mensalidade or 0, 2),
        "preco_ativacao":        round(p.preco_ativacao or 0, 2),
        "preco_exc_mb":          p.preco_exc_mb,
        "data_ativacao":         p.data_ativacao.isoformat() if p.data_ativacao else None,
        "pre_ativacao_dias":     p.pre_ativacao_dias,
        "bloqueio_automatico":   p.bloqueio_automatico,
        "roaming":               p.roaming,
        "status":                p.status,
        "upload_ref":            p.upload_ref,
    }
