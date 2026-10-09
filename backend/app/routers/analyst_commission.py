"""
Aba "Comissionamento" do Faturamento — comissão dos analistas de contas a receber
com base na adimplência por vencimento ORIGINAL (10, 15, 20 e 25).

Mês escolhido = mês de VENCIMENTO dos boletos (o ciclo de setembro gera boletos com
vencimento em outubro, então outubro usa o ciclo de setembro). Vencimento original =
`billing_client_summaries.due_date` (arquivo de Vencimentos); o realizado vem de
`asaas_payments_sync` (cruzado por CNPJ/CPF) — boletos com vencimento dentro do mês.

Regra do valor: percentual × recebido, liberado só se recebido >= meta
(meta em R$ por vencimento; meta 0 = sem meta, sempre libera).
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.permissions import require_permission
from app.database import get_db
from app.models import AnalystCommissionConfig, AuditLog, User

router = APIRouter(prefix="/analyst-commission", tags=["Comissionamento Analistas"])

_perm = require_permission("can_edit_billing")

DIAS = (10, 15, 20, 25)


class ConfigIn(BaseModel):
    year: int
    month: int
    dia: int
    percentual: float
    meta: float = 0.0


def _config_do_mes(db: Session, year: int, month: int, dia: int) -> dict:
    """Config do mês; se não houver, herda a mais recente anterior."""
    c = (db.query(AnalystCommissionConfig)
         .filter(AnalystCommissionConfig.dia == dia,
                 (AnalystCommissionConfig.year * 100 + AnalystCommissionConfig.month) <= year * 100 + month)
         .order_by(AnalystCommissionConfig.year.desc(), AnalystCommissionConfig.month.desc())
         .first())
    if not c:
        return {"percentual": 0.0, "meta": 0.0, "herdada": False, "updated_by": None}
    herdada = (c.year, c.month) != (year, month)
    return {"percentual": c.percentual, "meta": c.meta, "herdada": herdada, "updated_by": c.updated_by}


@router.get("")
def comissionamento(year: int, month: int, db: Session = Depends(get_db), user: User = Depends(_perm)):
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido")

    ini = date(year, month, 1)
    fim = date(year + (month == 12), month % 12 + 1, 1)
    dados = {d: {"clientes": 0, "boletos": 0, "pagos": 0, "faturado": 0.0, "recebido": 0.0} for d in DIAS}
    datas = {}
    # Vencimento original de cada grupo (data mais frequente nos resumos dos ciclos)
    for r in db.execute(text("""
        SELECT EXTRACT(DAY FROM due_date)::int AS dia, due_date, COUNT(*) AS n
        FROM billing_client_summaries
        WHERE due_date >= :ini AND due_date < :fim
          AND EXTRACT(DAY FROM due_date)::int IN (10, 15, 20, 25)
        GROUP BY 1, 2 ORDER BY 1, 3 DESC
    """), {"ini": ini, "fim": fim}).fetchall():
        datas.setdefault(int(r.dia), r.due_date)
    tem_boletos = bool(datas)
    if tem_boletos:
        rows = db.execute(text("""
            WITH s AS (
                SELECT regexp_replace(id_smart, '\\D', '', 'g') AS doc,
                       EXTRACT(DAY FROM due_date)::int AS dia,
                       SUM(total_final) AS valor
                FROM billing_client_summaries
                WHERE due_date >= :ini AND due_date < :fim
                  AND EXTRACT(DAY FROM due_date)::int IN (10, 15, 20, 25)
                GROUP BY 1, 2
            ),
            f AS (   -- valor original de cada vencimento (o que o ciclo mandou cobrar)
                SELECT dia, COUNT(*) AS clientes, SUM(valor) AS faturado FROM s GROUP BY dia
            ),
            r AS (   -- o que o Asaas já emitiu / recebeu desses clientes no mês
                SELECT s.dia,
                       COUNT(p.asaas_id) AS boletos,
                       COUNT(p.asaas_id) FILTER (WHERE p.status IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')) AS pagos,
                       COALESCE(SUM(COALESCE(p.value_original, p.value))
                                FILTER (WHERE p.status IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')), 0) AS recebido
                FROM s
                JOIN asaas_payments_sync p
                  ON regexp_replace(p.customer_cpf_cnpj, '\\D', '', 'g') = s.doc
                 AND p.due_date >= :ini AND p.due_date < :fim
                GROUP BY s.dia
            )
            SELECT f.dia, f.clientes, f.faturado,
                   COALESCE(r.boletos, 0) AS boletos, COALESCE(r.pagos, 0) AS pagos, COALESCE(r.recebido, 0) AS recebido
            FROM f LEFT JOIN r ON r.dia = f.dia
        """), {"ini": ini, "fim": fim}).fetchall()
        for r in rows:
            dados[int(r.dia)] = {
                "clientes": int(r.clientes), "boletos": int(r.boletos), "pagos": int(r.pagos),
                "faturado": float(r.faturado or 0), "recebido": float(r.recebido),
            }

    out = []
    for dia in DIAS:
        d = dados[dia]
        cfg = _config_do_mes(db, year, month, dia)
        fat, rec = d["faturado"], d["recebido"]
        adimp = round(rec / fat * 100, 2) if fat else 0.0
        meta_ok = rec >= cfg["meta"] if cfg["meta"] > 0 else True
        valor = round(rec * cfg["percentual"] / 100, 2) if meta_ok else 0.0
        out.append({
            "dia": dia, "vencimento_original": (datas.get(dia) or date(year, month, dia)).isoformat(), **d, **cfg,
            "adimplencia": adimp,
            "meta_atingida": meta_ok,
            "valor": valor,
        })
    return {
        "year": year, "month": month,
        "ciclo": tem_boletos,
        "vencimentos": out,
        "total": round(sum(v["valor"] for v in out), 2),
    }


@router.put("/config")
def salvar_config(data: ConfigIn, db: Session = Depends(get_db), user: User = Depends(_perm)):
    if data.dia not in DIAS:
        raise HTTPException(status_code=400, detail="Vencimento deve ser 10, 15, 20 ou 25")
    if not (1 <= data.month <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido")
    if data.percentual < 0 or data.percentual > 100:
        raise HTTPException(status_code=400, detail="Percentual deve estar entre 0 e 100")
    if data.meta < 0:
        raise HTTPException(status_code=400, detail="Meta não pode ser negativa")

    c = (db.query(AnalystCommissionConfig)
         .filter_by(year=data.year, month=data.month, dia=data.dia).first())
    if c:
        c.percentual, c.meta, c.updated_by = data.percentual, data.meta, user.name
    else:
        c = AnalystCommissionConfig(year=data.year, month=data.month, dia=data.dia,
                                    percentual=data.percentual, meta=data.meta, updated_by=user.name)
        db.add(c)
    db.add(AuditLog(user_id=user.id, action="analyst_commission.config", entity="analyst_commission_config",
                    details={"year": data.year, "month": data.month, "dia": data.dia,
                             "percentual": data.percentual, "meta": data.meta}))
    db.commit()
    return {"ok": True}
