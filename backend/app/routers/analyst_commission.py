"""
Aba "Comissionamento" do Faturamento — comissão dos analistas de contas a receber
com base na adimplência por vencimento ORIGINAL (10, 15, 20 e 25).

Mês escolhido = mês de VENCIMENTO dos boletos (o ciclo de setembro gera boletos com
vencimento em outubro, então outubro usa o ciclo de setembro). Vencimento original =
`billing_client_summaries.due_date` (arquivo de Vencimentos); o realizado vem de
`asaas_payments_sync` (cruzado por CNPJ/CPF) e `itau_boletos` — SÓ o pago NO DIA do vencimento ou no dia seguinte (10/11, 15/16, 20/21, 25/26); pago antes ou depois não entra no recebido. Boletos com vencimento dentro do mês.
CADA BOLETO VALE NO DIA DO SEU PRÓPRIO VENCIMENTO (22/10/2026, conferido contra as planilhas do Diego de 15/10 e 20/10): o dia 10/15/20/25
de um boleto é o do seu vencimento, não o do ciclo do cliente (que pode estar vazio ou diferente). Boleto com vencimento fora desses
dias (remarcado) vale no dia do ciclo do cliente; se o cliente não tem dia no ciclo, no dia anterior (16 → 15). Faturado = valor do ciclo. A base são os clientes do ciclo (Asaas e Itaú) + boletos do Itaú de clientes fora do ciclo.
VENCIMENTO EM FIM DE SEMANA (22/10/2026, pedido do Diego): sábado e domingo não são dia útil, então a janela vai do
vencimento REAL até 1 dia depois do primeiro dia útil (sáb 10 → vale pago de sáb 10 a ter 13). Assim o Pix pago no fim de
semana entra E quem paga na segunda/terça também. Dia útil comum: janela de sempre (vencimento e dia seguinte). Feriados não
entram (o sistema não tem calendário de feriados).

Regra do valor (por analista): percentual × SALÁRIO do analista, liberado só se a meta (R$)
foi definida (> 0) e o recebido do vencimento a atingiu. Previsão = o que pagaria se a meta for batida.
MARGEM DO TIME (22/10/2026): a meta conta como atingida a partir de 95% dela (margem de 5%, configurável em
system_settings.analistas_margem_meta_pct). O percentual do salário não muda — só o gatilho.
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
from app.utils.business_days import effective_due_date_sql

router = APIRouter(prefix="/analyst-commission", tags=["Comissionamento Analistas"])


DIAS = (10, 15, 20, 25)

MARGEM_META_PADRAO = 5.0   # % — o time bate a meta com 95% dela


def _margem_meta(db: Session) -> float:
    """Margem (em %) abaixo da meta que ainda conta como meta atingida. Padrão 5; ajustável sem deploy."""
    try:
        v = db.execute(text("SELECT value FROM system_settings WHERE key = 'analistas_margem_meta_pct'")).scalar()
        m = float(str(v).replace(",", ".")) if v not in (None, "") else MARGEM_META_PADRAO
    except Exception:
        m = MARGEM_META_PADRAO
    return min(max(m, 0.0), 50.0)


def meta_atingida(meta: float, recebido: float, margem_pct: float) -> bool:
    """Meta definida (> 0) e recebido >= meta × (1 − margem). Sem meta definida não libera nada."""
    return meta > 0 and recebido + 1e-9 >= meta * (1 - margem_pct / 100.0)


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
        # Ciclo que gerou os boletos deste mês (o de setembro gera vencimentos de outubro)
        py, pm = (year - 1, 12) if month == 1 else (year, month - 1)
        cyc = db.execute(text("SELECT id FROM billing_cycles WHERE year = :y AND month = :m ORDER BY id DESC LIMIT 1"),
                         {"y": py, "m": pm}).scalar()
        ef_g = effective_due_date_sql("e.gdate")
        rows = db.execute(text(f"""
            WITH bol0 AS (   -- todos os boletos (Asaas + Itaú) com vencimento no mês, valor ORIGINAL do boleto
                SELECT regexp_replace(customer_cpf_cnpj, '\\D', '', 'g') AS doc, due_date AS dv,
                       COALESCE(value_original, value) AS valor,
                       (status IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')) AS rec,
                       COALESCE(payment_date, credit_date) AS dp, 'Asaas' AS banco
                FROM asaas_payments_sync
                WHERE due_date >= :ini AND due_date < :fim
                UNION ALL
                SELECT regexp_replace(cpf_cnpj, '\\D', '', 'g'), data_vencimento, valor_titulo,
                       (status = 'paga'), data_pagamento, 'Itaú'
                FROM itau_boletos
                WHERE status <> 'cancelada' AND data_vencimento >= :ini AND data_vencimento < :fim
            ),
            base AS (  -- clientes do ciclo de origem (qualquer ciclo com vencimento no mês, ou o do mês anterior)
                SELECT regexp_replace(id_smart, '\\D', '', 'g') AS doc, SUM(total_final) AS valor_ciclo,
                       MIN(CASE WHEN due_date >= :ini AND due_date < :fim AND EXTRACT(DAY FROM due_date)::int IN (10, 15, 20, 25)
                                THEN due_date END) AS due_ciclo
                FROM billing_client_summaries
                WHERE total_final > 0 AND (cycle_id = :cyc OR (due_date >= :ini AND due_date < :fim))
                GROUP BY 1
            ),
            bol AS (   -- dia (grupo) de cada boleto: o do PRÓPRIO vencimento (10/15/20/25); se o vencimento é outro (boleto
                       -- remarcado), o dia do ciclo do cliente; sem dia no ciclo, o dia anterior (16 -> 15)
                SELECT b.*, CASE WHEN EXTRACT(DAY FROM b.dv)::int IN (10, 15, 20, 25) THEN b.dv
                                 WHEN bs.due_ciclo IS NOT NULL THEN bs.due_ciclo
                                 WHEN EXTRACT(DAY FROM b.dv - 1)::int IN (10, 15, 20, 25) THEN b.dv - 1 END AS gdate
                FROM bol0 b LEFT JOIN base bs ON bs.doc = b.doc
            ),
            elig AS (  -- boletos que entram: de cliente do ciclo (Asaas e Itaú) ou boleto do Itaú de cliente fora do ciclo
                SELECT b.* FROM bol b
                WHERE b.gdate IS NOT NULL AND b.gdate >= :ini AND b.gdate < :fim
                  AND (b.banco = 'Itaú' OR b.doc IN (SELECT doc FROM base))
            ),
            fat AS (   -- faturado = o que o ciclo mandou cobrar de cada cliente (uma vez, sem somar boleto duplicado);
                       -- sem dia no ciclo, vale o dia do boleto mais antigo; + boletos do Itaú de clientes fora do ciclo
                SELECT bs.doc, bs.valor_ciclo AS valor,
                       COALESCE(bs.due_ciclo, (SELECT MIN(e.gdate) FROM elig e WHERE e.doc = bs.doc)) AS gdate
                FROM base bs
                UNION ALL
                SELECT e.doc, e.valor, e.gdate FROM elig e WHERE e.banco = 'Itaú' AND e.doc NOT IN (SELECT doc FROM base)
            ),
            f AS (     -- faturado de cada vencimento
                SELECT EXTRACT(DAY FROM gdate)::int AS dia, COUNT(DISTINCT doc) AS clientes, SUM(valor) AS faturado
                FROM fat WHERE gdate IS NOT NULL GROUP BY 1
            ),
            r AS (     -- emitido / recebido: "pago no dia" = do vencimento até 1 dia depois do 1º dia útil
                SELECT EXTRACT(DAY FROM x.gdate)::int AS dia,
                       COUNT(*) AS boletos,
                       COUNT(*) FILTER (WHERE x.pago) AS pagos,
                       COALESCE(SUM(x.valor) FILTER (WHERE x.pago), 0) AS recebido,
                       COALESCE(SUM(x.valor) FILTER (WHERE x.pago AND x.banco = 'Itaú'), 0) AS recebido_itau,
                       COUNT(*) FILTER (WHERE x.banco = 'Itaú') AS boletos_itau
                FROM (SELECT e.*, (e.rec AND e.dp BETWEEN e.gdate AND ({ef_g}) + 1) AS pago FROM elig e) x
                GROUP BY 1
            )
            SELECT f.dia, f.clientes, f.faturado,
                   COALESCE(r.boletos, 0) AS boletos, COALESCE(r.pagos, 0) AS pagos, COALESCE(r.recebido, 0) AS recebido,
                   COALESCE(r.recebido_itau, 0) AS recebido_itau, COALESCE(r.boletos_itau, 0) AS boletos_itau
            FROM f LEFT JOIN r ON r.dia = f.dia
        """), {"ini": ini, "fim": fim, "cyc": cyc}).fetchall()
        for r in rows:
            dados[int(r.dia)] = {
                "clientes": int(r.clientes), "boletos": int(r.boletos), "pagos": int(r.pagos),
                "faturado": float(r.faturado or 0), "recebido": float(r.recebido),
                "recebido_itau": float(r.recebido_itau), "boletos_itau": int(r.boletos_itau),
            }

    salario = (_salario_do_mes(db, alvo_id, year, month) if alvo_id else None) or 0.0
    margem = _margem_meta(db)
    out = []
    for dia in DIAS:
        d = dados[dia]
        cfg = _rule_do_mes(db, alvo_id, year, month, dia) if alvo_id else {"percentual": 0.0, "meta": 0.0, "herdada": False}
        fat, rec = d["faturado"], d["recebido"]
        adimp = round(rec / fat * 100, 2) if fat else 0.0
        # Meta 0 = ainda não definida: não libera nada (realizado = 0). Previsão = o que pagaria se a meta for batida.
        meta_ok = meta_atingida(cfg["meta"], rec, margem)
        previsao = round(salario * cfg["percentual"] / 100, 2)
        valor = previsao if meta_ok else 0.0
        out.append({
            "dia": dia, "vencimento_original": (datas.get(dia) or date(year, month, dia)).isoformat(), **d, **cfg,
            "adimplencia": adimp,
            "meta_atingida": meta_ok,
            "meta_minima": round(cfg["meta"] * (1 - margem / 100.0), 2),
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
        "margem_meta_pct": margem,
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
