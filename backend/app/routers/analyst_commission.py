"""
Aba "Comissionamento" do Faturamento — comissão dos analistas de contas a receber
com base na adimplência por vencimento ORIGINAL (10, 15, 20 e 25).

Mês escolhido = mês de VENCIMENTO dos boletos (o ciclo de setembro gera boletos com
vencimento em outubro, então outubro usa o ciclo de setembro). Vencimento original =
`billing_client_summaries.due_date` (arquivo de Vencimentos); o realizado vem de
`asaas_payments_sync` (cruzado por CNPJ/CPF) e `itau_boletos`. Boletos com vencimento dentro do mês.
CADA BOLETO VALE NO DIA DO SEU PRÓPRIO VENCIMENTO (22/10/2026, conferido contra as planilhas do Diego de 15/10 e 20/10): o dia 10/15/20/25
de um boleto é o do seu vencimento, não o do ciclo do cliente (que pode estar vazio ou diferente). Boleto com vencimento fora desses
dias (remarcado) vale no dia do ciclo do cliente; se o cliente não tem dia no ciclo, no dia anterior (16 → 15). Faturado = valor do ciclo. ASAAS usa o vencimento ORIGINAL (originalDueDate, coluna original_due_date da sincronização; sem ele, o atual); o Itaú só tem o atual. A base são os clientes do ciclo (Asaas e Itaú) + boletos do Itaú de clientes fora do ciclo.

RECEBIDO = RECEBIMENTO EVENTUAL, não só "no dia" (mudou em 07/11/2026, pedido do Diego — antes só contava
pago no dia do vencimento ou no dia seguinte; ele decidiu que o que vale pra bater a meta é o total recebido
daquele grupo de vencimento, não importa quando foi pago). `_janela_de_pagamento_*`/exceções de fim de semana
que existiam aqui até 07/11/2026 foram removidos porque não fazem mais sentido pra essa regra (continuam
existindo em `app/utils/business_days.py`, usado por outras telas como a Régua de Cobrança).

CONGELAMENTO DO MÊS (07/11/2026, pedido do Diego): como o recebido é lido ao vivo de `asaas_payments_sync`/
`itau_boletos`, um mês já fechado ficava mudando de resultado conforme esses dados eram reconciliados depois
("não pode puxar informação, não pode vincular outros meses" — ex.: outubro mostrando "não atingida" num dia
que na really tinha batido a meta, porque o cálculo ao vivo reabria o mês toda vez). Agora, assim que um mês
vira passado (mês/ano anterior ao atual), o resultado é calculado UMA VEZ e gravado em
`analyst_commission_snapshot` (ver `_congelar_mes`/`analyst_commission_freeze_loop`); dali em diante a tela
sempre lê o snapshot, nunca mais recalcula esse mês — mesmo que o Asaas/Itaú corrijam algo depois.

Regra do valor (por analista): percentual × SALÁRIO do analista, liberado só se a meta (R$)
foi definida (> 0) e o recebido do vencimento a atingiu. Previsão = o que pagaria se a meta for batida.
MARGEM DO TIME (22/10/2026): a meta conta como atingida a partir de 95% dela (margem de 5%, configurável em
system_settings.analistas_margem_meta_pct). O percentual do salário não muda — só o gatilho.
O recebido é da carteira toda (ainda não há carteira por analista). Só o admin edita;
cada analista (Carlo, Brenda…) vê apenas o próprio comissionamento.
"""
import asyncio
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.routers.auth import get_current_user
from app.models import (AnalystCommissionRule, AnalystCommissionSnapshot, AnalystSalary,
                        AuditLog, User, UserRole)

router = APIRouter(prefix="/analyst-commission", tags=["Comissionamento Analistas"])

log = logging.getLogger(__name__)

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


def _mes_fechado(year: int, month: int) -> bool:
    """Mês estritamente anterior ao atual — já virou passado, pode travar."""
    hoje = date.today()
    return (year, month) < (hoje.year, hoje.month)


def _computar_vencimentos(db: Session, year: int, month: int, alvo_id: Optional[int]) -> tuple:
    """Calcula AO VIVO os 4 vencimentos do mês. Usado pro mês corrente/futuro (sempre) e,
    uma única vez, pra congelar um mês que acabou de virar passado. Retorna (out, salario, tem_boletos)."""
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
    if not tem_boletos:
        # Sem vencimento nos resumos do ciclo (ex.: arquivo de Vencimentos incompleto), mas com boletos nos bancos: calcula assim mesmo
        tem_boletos = bool(db.execute(text("""
            SELECT EXISTS (SELECT 1 FROM asaas_payments_sync WHERE COALESCE(original_due_date, due_date) >= :ini AND COALESCE(original_due_date, due_date) < :fim)
                OR EXISTS (SELECT 1 FROM itau_boletos WHERE status <> 'cancelada' AND data_vencimento >= :ini AND data_vencimento < :fim)
        """), {"ini": ini, "fim": fim}).scalar())
    if tem_boletos:
        # Ciclo que gerou os boletos deste mês (o de setembro gera vencimentos de outubro)
        py, pm = (year - 1, 12) if month == 1 else (year, month - 1)
        cyc = db.execute(text("SELECT id FROM billing_cycles WHERE year = :y AND month = :m ORDER BY id DESC LIMIT 1"),
                         {"y": py, "m": pm}).scalar()
        # Recebido EVENTUAL (07/11/2026): conta qualquer boleto pago do grupo, não importa
        # quando — não existe mais janela de "pago no dia do vencimento".
        pago_expr = "e.rec"
        rows = db.execute(text(f"""
            WITH bol0 AS (   -- todos os boletos (Asaas + Itaú) com vencimento no mês, valor ORIGINAL do boleto
                -- Asaas: vale o vencimento ORIGINAL (originalDueDate), não o atual (que muda quando o boleto é remarcado)
                SELECT regexp_replace(customer_cpf_cnpj, '\\D', '', 'g') AS doc, COALESCE(original_due_date, due_date) AS dv,
                       COALESCE(value_original, value) AS valor,
                       (status IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')) AS rec,
                       COALESCE(payment_date, credit_date) AS dp, 'Asaas' AS banco
                FROM asaas_payments_sync
                WHERE COALESCE(original_due_date, due_date) >= :ini AND COALESCE(original_due_date, due_date) < :fim
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
            r AS (     -- emitido / recebido de cada vencimento (recebido = pago a qualquer momento)
                SELECT EXTRACT(DAY FROM x.gdate)::int AS dia,
                       COUNT(*) AS boletos,
                       COUNT(*) FILTER (WHERE x.pago) AS pagos,
                       COALESCE(SUM(x.valor) FILTER (WHERE x.pago), 0) AS recebido,
                       COALESCE(SUM(x.valor) FILTER (WHERE x.pago AND x.banco = 'Itaú'), 0) AS recebido_itau,
                       COUNT(*) FILTER (WHERE x.banco = 'Itaú') AS boletos_itau
                FROM (SELECT e.*, {pago_expr} AS pago FROM elig e) x
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
    return out, salario, tem_boletos


def _congelar_mes(db: Session, user_id: int, year: int, month: int) -> list:
    """Calcula o mês (que já virou passado) e grava o resultado travado. Idempotente —
    chamar de novo não recalcula (só insere o que ainda não existir)."""
    existentes = {r.dia: r for r in db.query(AnalystCommissionSnapshot)
                  .filter_by(user_id=user_id, year=year, month=month).all()}
    if len(existentes) == len(DIAS):
        return list(existentes.values())
    out, salario, _ = _computar_vencimentos(db, year, month, user_id)
    linhas = []
    for v in out:
        if v["dia"] in existentes:
            linhas.append(existentes[v["dia"]])
            continue
        row = AnalystCommissionSnapshot(
            user_id=user_id, year=year, month=month, dia=v["dia"],
            vencimento_original=date.fromisoformat(v["vencimento_original"]),
            clientes=v["clientes"], boletos=v["boletos"], pagos=v["pagos"],
            faturado=v["faturado"], recebido=v["recebido"], recebido_itau=v["recebido_itau"],
            boletos_itau=v["boletos_itau"], percentual=v["percentual"], meta=v["meta"],
            herdada=v["herdada"], adimplencia=v["adimplencia"], meta_atingida=v["meta_atingida"],
            meta_minima=v["meta_minima"], previsao=v["previsao"], valor=v["valor"], salario=salario,
        )
        db.add(row)
        linhas.append(row)
    db.commit()
    for r in linhas:
        db.refresh(r)
    return linhas


def _snapshot_para_out(linhas: list) -> list:
    ordem = {d: i for i, d in enumerate(DIAS)}
    return [{
        "dia": r.dia, "vencimento_original": r.vencimento_original.isoformat() if r.vencimento_original else None,
        "clientes": r.clientes, "boletos": r.boletos, "pagos": r.pagos, "faturado": r.faturado,
        "recebido": r.recebido, "recebido_itau": r.recebido_itau, "boletos_itau": r.boletos_itau,
        "percentual": r.percentual, "meta": r.meta, "herdada": r.herdada, "adimplencia": r.adimplencia,
        "meta_atingida": r.meta_atingida, "meta_minima": r.meta_minima, "previsao": r.previsao, "valor": r.valor,
    } for r in sorted(linhas, key=lambda r: ordem[r.dia])]


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

    margem = _margem_meta(db)
    if alvo_id and _mes_fechado(year, month):
        linhas = _congelar_mes(db, alvo_id, year, month)
        out = _snapshot_para_out(linhas)
        salario = linhas[0].salario if linhas else 0.0
        tem_boletos = any(v["clientes"] or v["boletos"] for v in out)
    else:
        out, salario, tem_boletos = _computar_vencimentos(db, year, month, alvo_id)

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


async def analyst_commission_freeze_loop():
    """Roda em background (ver app/main.py) — congela sozinho o mês que acabou de fechar,
    pra todo analista, sem precisar que alguém abra a tela primeiro. Checa de hora em hora;
    `_congelar_mes` é idempotente, então repetir não tem custo."""
    while True:
        try:
            hoje = date.today()
            ano_ant, mes_ant = (hoje.year - 1, 12) if hoje.month == 1 else (hoje.year, hoje.month - 1)
            db = SessionLocal()
            try:
                ids = [row.user_id for row in db.query(AnalystSalary.user_id).distinct().all()]
                for uid in ids:
                    _congelar_mes(db, uid, ano_ant, mes_ant)
            finally:
                db.close()
        except Exception:
            log.exception("Falha ao congelar comissionamento de analistas do mês anterior")
        await asyncio.sleep(3600)


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
