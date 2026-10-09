"""
Aba "Comissionamento" do Faturamento — comissão dos analistas de contas a receber
com base na adimplência por vencimento ORIGINAL (10, 15, 20 e 25).

Mês escolhido = mês de VENCIMENTO dos boletos (o ciclo de setembro gera boletos com
vencimento em outubro, então outubro usa o ciclo de setembro). Vencimento original =
`billing_client_summaries.due_date` (arquivo de Vencimentos); o realizado vem de
`asaas_payments_sync` (cruzado por CNPJ/CPF) e `itau_boletos` — boletos com vencimento dentro do mês.

Regra do valor (por analista): percentual × SALÁRIO do analista, liberado só se a meta (R$)
foi definida (> 0) e o recebido do vencimento a atingiu. Previsão = o que pagaria se a meta for batida.
O recebido é da carteira toda (ainda não há carteira por analista). Só o admin edita;
cada analista (Carlo, Brenda…) vê apenas o próprio comissionamento.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.auth import get_current_user
from app.models import AnalystCommissionRule, AnalystSalary, AuditLog, User, UserRole

router = APIRouter(prefix="/analyst-commission", tags=["Comissionamento Analistas"])


DIAS = (10, 15, 20, 25)


class ConfigIn(BaseModel):
    user_id: int
    year: int
    month: int
    dia: int
    percentual: float
    meta: float = 0.0


class SalaryIn(BaseModel):
    user_id: int
    year: int
    month: int
    salario: float


class MemberIn(BaseModel):
    user_id: int
    year: int
    month: int


def _is_admin(user: User) -> bool:
    return user.role == UserRole.ADMIN


def _ym(model, year, month):
    return (model.year * 100 + model.month) <= year * 100 + month


def _rule_do_mes(db: Session, user_id: int, year: int, month: int, dia: int) -> dict:
    """Regra do mês; se não houver, herda a mais recente anterior."""
    c = (db.query(AnalystCommissionRule)
         .filter(AnalystCommissionRule.user_id == user_id, AnalystCommissionRule.dia == dia,
                 _ym(AnalystCommissionRule, year, month))
         .order_by(AnalystCommissionRule.year.desc(), AnalystCommissionRule.month.desc())
         .first())
    if not c:
        return {"percentual": 0.0, "meta": 0.0, "herdada": False}
    return {"percentual": c.percentual, "meta": c.meta, "herdada": (c.year, c.month) != (year, month)}


def _salario_do_mes(db: Session, user_id: int, year: int, month: int) -> Optional[float]:
    c = (db.query(AnalystSalary)
         .filter(AnalystSalary.user_id == user_id, _ym(AnalystSalary, year, month))
         .order_by(AnalystSalary.year.desc(), AnalystSalary.month.desc())
         .first())
    return c.salario if c else None


def _membros(db: Session) -> list:
    rows = (db.query(User).join(AnalystSalary, AnalystSalary.user_id == User.id)
            .distinct().order_by(User.name).all())
    return [{"id": u.id, "name": " ".join((u.name or "").split())} for u in rows]


def is_analyst(db: Session, user_id: int) -> bool:
    """Usado também pelo /auth/me pra decidir se a aba aparece no menu."""
    return db.query(AnalystSalary.id).filter(AnalystSalary.user_id == user_id).first() is not None


@router.get("")
def comissionamento(year: int, month: int, user_id: Optional[int] = None,
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido")

    admin = _is_admin(user)
    membros = _membros(db)
    if admin:
        alvo_id = user_id or (membros[0]["id"] if membros else None)
    else:
        # analista comum só enxerga o PRÓPRIO comissionamento, ignorando user_id
        if not is_analyst(db, user.id):
            raise HTTPException(status_code=403, detail="Você não participa do comissionamento de analistas")
        alvo_id = user.id
    alvo = next((m for m in membros if m["id"] == alvo_id), None)
    if admin and alvo_id and not alvo:
        raise HTTPException(status_code=404, detail="Analista não cadastrado")

    ini = date(year, month, 1)
    fim = date(year + (month == 12), month % 12 + 1, 1)
    dados = {d: {"clientes": 0, "boletos": 0, "pagos": 0, "faturado": 0.0, "recebido": 0.0,
                "recebido_itau": 0.0, "boletos_itau": 0} for d in DIAS}
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
            WITH sc AS (   -- clientes do ciclo: valor original = total do ciclo
                SELECT regexp_replace(id_smart, '\\D', '', 'g') AS doc,
                       EXTRACT(DAY FROM due_date)::int AS dia,
                       SUM(total_final) AS valor
                FROM billing_client_summaries
                WHERE due_date >= :ini AND due_date < :fim
                  AND EXTRACT(DAY FROM due_date)::int IN (10, 15, 20, 25)
                GROUP BY 1, 2
            ),
            se AS (        -- boletos do Itaú de clientes que NÃO estão no ciclo: valor = o do boleto
                SELECT regexp_replace(cpf_cnpj, '\\D', '', 'g') AS doc,
                       EXTRACT(DAY FROM data_vencimento)::int AS dia,
                       SUM(valor_titulo) AS valor
                FROM itau_boletos
                WHERE status <> 'cancelada'
                  AND data_vencimento >= :ini AND data_vencimento < :fim
                  AND EXTRACT(DAY FROM data_vencimento)::int IN (10, 15, 20, 25)
                  AND regexp_replace(cpf_cnpj, '\\D', '', 'g') NOT IN (SELECT doc FROM sc)
                GROUP BY 1, 2
            ),
            s AS (
                SELECT doc, dia, valor, FALSE AS extra FROM sc
                UNION ALL
                SELECT doc, dia, valor, TRUE FROM se
            ),
            f AS (   -- valor original de cada vencimento (o que o ciclo mandou cobrar)
                SELECT dia, COUNT(*) AS clientes, SUM(valor) AS faturado FROM s GROUP BY dia
            ),
            pg AS (  -- boletos do mês nos dois bancos (Asaas + Itaú), por cliente
                SELECT regexp_replace(customer_cpf_cnpj, '\\D', '', 'g') AS doc,
                       COALESCE(value_original, value) AS valor,
                       (status IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')) AS pago,
                       'Asaas' AS banco
                FROM asaas_payments_sync
                WHERE due_date >= :ini AND due_date < :fim
                UNION ALL
                SELECT regexp_replace(cpf_cnpj, '\\D', '', 'g'), valor_titulo,
                       (status = 'paga'), 'Itaú'
                FROM itau_boletos
                WHERE status <> 'cancelada' AND data_vencimento >= :ini AND data_vencimento < :fim
            ),
            r AS (   -- o que já foi emitido / recebido desses clientes
                SELECT s.dia,
                       COUNT(*) AS boletos,
                       COUNT(*) FILTER (WHERE pg.pago) AS pagos,
                       COALESCE(SUM(pg.valor) FILTER (WHERE pg.pago), 0) AS recebido,
                       COALESCE(SUM(pg.valor) FILTER (WHERE pg.pago AND pg.banco = 'Itaú'), 0) AS recebido_itau,
                       COUNT(*) FILTER (WHERE pg.banco = 'Itaú') AS boletos_itau
                FROM s JOIN pg ON pg.doc = s.doc AND (NOT s.extra OR pg.banco = 'Itaú')
                GROUP BY s.dia
            )
            SELECT f.dia, f.clientes, f.faturado,
                   COALESCE(r.boletos, 0) AS boletos, COALESCE(r.pagos, 0) AS pagos, COALESCE(r.recebido, 0) AS recebido,
                   COALESCE(r.recebido_itau, 0) AS recebido_itau, COALESCE(r.boletos_itau, 0) AS boletos_itau
            FROM f LEFT JOIN r ON r.dia = f.dia
        """), {"ini": ini, "fim": fim}).fetchall()
        for r in rows:
            dados[int(r.dia)] = {
                "clientes": int(r.clientes), "boletos": int(r.boletos), "pagos": int(r.pagos),
                "faturado": float(r.faturado or 0), "recebido": float(r.recebido),
                "recebido_itau": float(r.recebido_itau), "boletos_itau": int(r.boletos_itau),
            }

    salario = (_salario_do_mes(db, alvo_id, year, month) if alvo_id else None) or 0.0
    out = []
    for dia in DIAS:
        d = dados[dia]
        cfg = _rule_do_mes(db, alvo_id, year, month, dia) if alvo_id else {"percentual": 0.0, "meta": 0.0, "herdada": False}
        fat, rec = d["faturado"], d["recebido"]
        adimp = round(rec / fat * 100, 2) if fat else 0.0
        # Meta 0 = ainda não definida: não libera nada (realizado = 0). Previsão = o que pagaria se a meta for batida.
        meta_ok = cfg["meta"] > 0 and rec >= cfg["meta"]
        previsao = round(salario * cfg["percentual"] / 100, 2)
        valor = previsao if meta_ok else 0.0
        out.append({
            "dia": dia, "vencimento_original": (datas.get(dia) or date(year, month, dia)).isoformat(), **d, **cfg,
            "adimplencia": adimp,
            "meta_atingida": meta_ok,
            "previsao": previsao,
            "valor": valor,
        })
    return {
        "year": year, "month": month,
        "ciclo": tem_boletos,
        "is_admin": admin,
        "analista": alvo,
        "analistas": membros if admin else [],
        "candidatos": ([{"id": u.id, "name": " ".join((u.name or "").split())}
                        for u in db.query(User).filter(User.is_active == True, User.role == UserRole.CONTAS_RECEBER)  # noqa: E712
                        .order_by(User.name).all() if u.id not in {m["id"] for m in membros}] if admin else []),
        "salario": salario,
        "vencimentos": out,
        "total": round(sum(v["valor"] for v in out), 2),
        "total_previsao": round(sum(v["previsao"] for v in out), 2),
    }


def _so_admin(user: User):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Somente o administrador edita o comissionamento")


def _validar_mes(month: int):
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Mês inválido")


@router.put("/config")
def salvar_config(data: ConfigIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _so_admin(user)
    _validar_mes(data.month)
    if data.dia not in DIAS:
        raise HTTPException(status_code=400, detail="Vencimento deve ser 10, 15, 20 ou 25")
    if data.percentual < 0 or data.percentual > 100:
        raise HTTPException(status_code=400, detail="Percentual deve estar entre 0 e 100")
    if data.meta < 0:
        raise HTTPException(status_code=400, detail="Meta não pode ser negativa")
    if not is_analyst(db, data.user_id):
        raise HTTPException(status_code=404, detail="Analista não cadastrado")

    c = (db.query(AnalystCommissionRule)
         .filter_by(user_id=data.user_id, year=data.year, month=data.month, dia=data.dia).first())
    if c:
        c.percentual, c.meta, c.updated_by = data.percentual, data.meta, user.name
    else:
        db.add(AnalystCommissionRule(user_id=data.user_id, year=data.year, month=data.month, dia=data.dia,
                                     percentual=data.percentual, meta=data.meta, updated_by=user.name))
    db.add(AuditLog(user_id=user.id, action="analyst_commission.rule", entity="analyst_commission_rule",
                    details=data.model_dump() if hasattr(data, "model_dump") else data.dict()))
    db.commit()
    return {"ok": True}


@router.put("/salary")
def salvar_salario(data: SalaryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _so_admin(user)
    _validar_mes(data.month)
    if data.salario < 0:
        raise HTTPException(status_code=400, detail="Salário não pode ser negativo")
    if not is_analyst(db, data.user_id):
        raise HTTPException(status_code=404, detail="Analista não cadastrado")
    c = db.query(AnalystSalary).filter_by(user_id=data.user_id, year=data.year, month=data.month).first()
    if c:
        c.salario, c.updated_by = data.salario, user.name
    else:
        db.add(AnalystSalary(user_id=data.user_id, year=data.year, month=data.month,
                             salario=data.salario, updated_by=user.name))
    db.add(AuditLog(user_id=user.id, action="analyst_commission.salary", entity="analyst_salary",
                    details={"user_id": data.user_id, "year": data.year, "month": data.month}))
    db.commit()
    return {"ok": True}


@router.post("/members", status_code=201)
def adicionar_analista(data: MemberIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _so_admin(user)
    _validar_mes(data.month)
    alvo = db.query(User).filter(User.id == data.user_id, User.is_active == True).first()  # noqa: E712
    if not alvo:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if not is_analyst(db, alvo.id):
        db.add(AnalystSalary(user_id=alvo.id, year=data.year, month=data.month, salario=0.0, updated_by=user.name))
        db.add(AuditLog(user_id=user.id, action="analyst_commission.member_add", entity="analyst_salary",
                        details={"user_id": alvo.id}))
        db.commit()
    return {"ok": True}
