from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, text
from typing import Optional

from app.database import get_db
from app.models import User, BillingCycle, BillingClientSummary, BillingAdjustment, BillingStatus, BillingLine
from app.models.extra import PaymentRecord
from app.routers.auth import get_current_user
from app.core.permissions import get_permission
from app.utils.business_days import effective_due_date, is_overdue, is_overdue_iso

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
def get_dashboard_summary(
    month: Optional[int] = Query(None),
    year:  Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_view_dashboard"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Sem permissão")

    MONTHS_PT = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                 "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

    # Todos os ciclos aprovados/fechados
    approved_cycles = db.query(BillingCycle).filter(
        BillingCycle.status.in_([BillingStatus.APROVADO, BillingStatus.FECHADO])
    ).order_by(BillingCycle.year.desc(), BillingCycle.month.desc()).all()

    available_cycles = [
        {"id": c.id, "month": c.month, "year": c.year,
         "label": f"{MONTHS_PT[c.month]} {c.year}"}
        for c in reversed(approved_cycles)
    ]

    # Ciclo selecionado
    if month and year and approved_cycles:
        latest_cycle = next((c for c in approved_cycles if c.month == month and c.year == year), None)
        if not latest_cycle:
            latest_cycle = approved_cycles[0] if approved_cycles else None
    else:
        latest_cycle = approved_cycles[0] if approved_cycles else None

    # Todos os ciclos para histórico
    all_cycles = db.query(BillingCycle).order_by(
        BillingCycle.year.asc(), BillingCycle.month.asc()
    ).all()

    # Ciclos em andamento
    pending = db.query(BillingCycle).filter(
        BillingCycle.status.in_([BillingStatus.RASCUNHO, BillingStatus.REVISAO])
    ).count()

    # Ajustes pendentes de aprovação
    pending_adjustments = db.query(BillingAdjustment).filter(
        BillingAdjustment.requires_approval == True,
        BillingAdjustment.approved_at.is_(None),
    ).count()

    # Histórico — ciclos do sistema onde existem; meses sem ciclo: Asaas + Itaú
    cycle_months = {(c.year, c.month) for c in all_cycles}

    # Asaas: agrupa por mês de competência (due_date), exclui meses já cobertos por ciclo
    asaas_hist = db.execute(text("""
        SELECT
            EXTRACT(YEAR  FROM due_date)::int AS ano,
            EXTRACT(MONTH FROM due_date)::int AS mes,
            SUM(value) AS total,
            COUNT(*) AS qtd
        FROM asaas_payments_sync
        WHERE due_date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY ano, mes
        ORDER BY ano, mes
    """)).fetchall()
    # Itaú: upload_ref = "YYYY-MM" representa o mês de competência
    itau_hist = db.execute(text("""
        SELECT
            SPLIT_PART(upload_ref, '-', 1)::int AS ano,
            SPLIT_PART(upload_ref, '-', 2)::int AS mes,
            SUM(valor_titulo) AS total,
            COUNT(*) AS qtd
        FROM itau_boletos
        WHERE upload_ref >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM')
        GROUP BY upload_ref
        ORDER BY upload_ref
    """)).fetchall()

    # Mescla Asaas + Itaú por mês (apenas meses sem ciclo de faturamento)
    ext_map: dict = {}
    for r in asaas_hist:
        key = (r.ano, r.mes)
        if key not in cycle_months:
            ext_map[key] = {"total": r.total or 0, "qtd": r.qtd or 0}
    for r in itau_hist:
        key = (r.ano, r.mes)
        if key not in cycle_months:
            if key in ext_map:
                ext_map[key]["total"] += r.total or 0
                ext_map[key]["qtd"]   += r.qtd or 0
            else:
                ext_map[key] = {"total": r.total or 0, "qtd": r.qtd or 0}

    ext_history = [
        {
            "id":      None,
            "period":  f"{mes:02d}/{ano}",
            "month":   mes,
            "year":    ano,
            "value":   round(v["total"], 2),
            "boletos": v["qtd"],
            "status":  "FECHADO",
        }
        for (ano, mes), v in sorted(ext_map.items())
    ]

    cycle_history = [
        {
            "id":       c.id,
            "period":   f"{c.month:02d}/{c.year}",
            "month":    c.month,
            "year":     c.year,
            "value":    round(c.total_value or 0, 2),
            "boletos":  c.total_boletos,
            "status":   c.status,
        }
        for c in all_cycles
    ]

    monthly_history = sorted(
        ext_history + cycle_history,
        key=lambda x: (x["year"], x["month"])
    )

    # Status dos boletos do último ciclo
    boleto_stats = {}
    if latest_cycle:
        summaries = db.query(
            BillingClientSummary.boleto_status,
            func.count(BillingClientSummary.id).label("count"),
            func.sum(BillingClientSummary.total_final).label("value"),
        ).filter(
            BillingClientSummary.cycle_id == latest_cycle.id
        ).group_by(BillingClientSummary.boleto_status).all()

        for row in summaries:
            boleto_stats[row.boleto_status or "sem_boleto"] = {
                "count": row.count,
                "value": round(row.value or 0, 2),
            }

    # Distribuição por status do último ciclo (6 mini cards)
    status_breakdown = {}
    if latest_cycle:
        rows = db.execute(text("""
            SELECT status, COUNT(*) AS qtd, ROUND(SUM(total_linha)::numeric, 2) AS valor
            FROM billing_lines
            WHERE cycle_id = :cid
              AND NOT (status = 'Cancelamento' AND iccid <> '')
            GROUP BY status
        """), {"cid": latest_cycle.id}).fetchall()
        for r in rows:
            status_breakdown[r[0]] = {"count": r[1], "value": float(r[2] or 0)}

    return {
        "latest_cycle": {
            "id":      latest_cycle.id if latest_cycle else None,
            "period":  f"{latest_cycle.month:02d}/{latest_cycle.year}" if latest_cycle else None,
            "value":   round(latest_cycle.total_value or 0, 2) if latest_cycle else 0,
            "boletos": latest_cycle.total_boletos if latest_cycle else 0,
            "status":  latest_cycle.status if latest_cycle else None,
        },
        "pending_cycles":      pending,
        "pending_adjustments": pending_adjustments,
        "monthly_history":     monthly_history,
        "boleto_stats":        boleto_stats,
        "status_breakdown":    status_breakdown,
        "available_cycles":    available_cycles,
    }


@router.get("/adjustments")
def get_adjustments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna todos os ajustes do ciclo mais recente."""
    if not get_permission(current_user, "can_view_dashboard"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Sem permissão")

    # Último ciclo (qualquer status)
    latest_cycle = db.query(BillingCycle).order_by(
        BillingCycle.year.desc(), BillingCycle.month.desc()
    ).first()

    if not latest_cycle:
        return []

    adjustments = db.query(BillingAdjustment).filter(
        BillingAdjustment.cycle_id == latest_cycle.id
    ).order_by(BillingAdjustment.created_at.desc()).all()

    # Busca todos os usuários referenciados em uma única query (evita N+1)
    user_ids = {a.created_by_id for a in adjustments if a.created_by_id} | \
               {a.approved_by_id for a in adjustments if a.approved_by_id}
    users = {}
    if user_ids:
        for u in db.query(User).filter(User.id.in_(user_ids)).all():
            users[u.id] = u.name

    result = []
    for a in adjustments:
        result.append({
            "id":               a.id,
            "cycle_id":         a.cycle_id,
            "id_smart":         a.id_smart,
            "type":             str(a.type.value) if hasattr(a.type, 'value') else str(a.type or ""),
            "valor_original":   a.valor_original,
            "valor_ajustado":   a.valor_ajustado,
            "valor_diferenca":  a.valor_diferenca,
            "justificativa":    a.justificativa,
            "requires_approval":a.requires_approval,
            "approved_at":      a.approved_at.isoformat() if a.approved_at else None,
            "created_at":       a.created_at.isoformat() if a.created_at else None,
            "created_by_name":  users.get(a.created_by_id),
            "approved_by_name": users.get(a.approved_by_id),
        })
    return result


@router.get("/status-evolution")
def get_status_evolution(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retorna a evolução por mês de: qtd de linhas e total R$ por status.
    Usado no gráfico de evolução do dashboard.
    """
    rows = db.execute(text("""
        SELECT
            bc.year,
            bc.month,
            bl.status,
            COUNT(*)                             AS qtd,
            ROUND(SUM(bl.total_linha)::numeric, 2) AS total
        FROM billing_lines bl
        JOIN billing_cycles bc ON bl.cycle_id = bc.id
        WHERE bc.status IN ('APROVADO', 'FECHADO', 'REVISAO')
          AND (bc.year * 100 + bc.month) >= (
              EXTRACT(YEAR FROM CURRENT_DATE)::int * 100
              + EXTRACT(MONTH FROM CURRENT_DATE)::int - 23
          )
          AND NOT (bl.status = 'Cancelamento' AND bl.iccid <> '')
        GROUP BY bc.year, bc.month, bl.status
        ORDER BY bc.year, bc.month, bl.status
    """)).fetchall()

    # Monta estrutura: [{period, Ativo, Suspenso, Pré-ativo, ...}, ...]
    from collections import defaultdict
    periods = {}  # "MM/YYYY" → {status: {qtd, total}}
    for r in rows:
        period = f"{r[1]:02d}/{r[0]}"
        if period not in periods:
            periods[period] = {"period": period, "year": r[0], "month": r[1]}
        periods[period][r[2]] = {"qtd": r[3], "total": float(r[4] or 0)}

    result = sorted(periods.values(), key=lambda x: (x["year"], x["month"]))
    return result


@router.get("/cycles/{cycle_id}/breakdown")
def get_cycle_breakdown(
    cycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Detalhamento do ciclo por componente — via SQL agregado (rápido)."""
    row = db.execute(text("""
        SELECT
            ROUND(SUM(mensalidade_cobrada)::numeric, 2),
            ROUND(SUM(ativacao_cobrada)::numeric,    2),
            ROUND(SUM(excedente_cobrado)::numeric,   2),
            ROUND(SUM(multa_cobrada)::numeric,       2),
            ROUND(SUM(sms_cobrado)::numeric,         2),
            ROUND(SUM(total_linha)::numeric,         2),
            COUNT(*)
        FROM billing_lines
        WHERE cycle_id = :cid AND NOT (status = 'Cancelamento' AND iccid <> '')
    """), {"cid": cycle_id}).fetchone()

    if not row or not row[6]:
        return {}

    by_status = db.execute(text("""
        SELECT status, COUNT(*), ROUND(SUM(total_linha)::numeric, 2)
        FROM billing_lines
        WHERE cycle_id = :cid AND NOT (status = 'Cancelamento' AND iccid <> '')
        GROUP BY status
    """), {"cid": cycle_id}).fetchall()

    return {
        "total_mensalidade": float(row[0] or 0),
        "total_ativacao":    float(row[1] or 0),
        "total_excedente":   float(row[2] or 0),
        "total_multa":       float(row[3] or 0),
        "total_sms":         float(row[4] or 0),
        "total_geral":       float(row[5] or 0),
        "total_linhas":      row[6],
        "by_status":         {r[0]: {"count": r[1], "value": float(r[2] or 0)} for r in by_status},
    }


@router.get("/executive-summary")
async def get_executive_summary(
    month: Optional[int] = Query(None),
    year:  Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resumo executivo: inadimplência, instrumentos, sinais estratégicos."""
    from datetime import date

    if not get_permission(current_user, "can_view_dashboard"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Sem permissão")

    MONTHS_PT = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                 "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

    hoje = date.today()
    sel_year  = year  or hoje.year
    sel_month = month or hoje.month

    # available_cycles: últimos 12 meses (independente de ciclo de faturamento)
    available_cycles = []
    y, m = hoje.year, hoje.month
    for _ in range(12):
        available_cycles.append({"id": None, "month": m, "year": y,
                                  "label": f"{MONTHS_PT[m]} {y}"})
        m -= 1
        if m == 0:
            m = 12; y -= 1
    available_cycles.reverse()

    # ciclo de faturamento (opcional — usado só para emitido e top devedores)
    approved_cycles = db.query(BillingCycle).filter(
        BillingCycle.status.in_([BillingStatus.APROVADO, BillingStatus.FECHADO])
    ).order_by(BillingCycle.year.desc(), BillingCycle.month.desc()).all()
    cycle = next((c for c in approved_cycles if c.month == sel_month and c.year == sel_year), None)
    summaries = db.query(BillingClientSummary).filter(
        BillingClientSummary.cycle_id == cycle.id
    ).all() if cycle else []

    received_statuses = ("RECEIVED", "CONFIRMED")

    # ── Asaas — banco local ──────────────────────────────────────
    asaas_rows = db.execute(text("""
        SELECT asaas_id, customer_id, value, net_value, due_date,
               payment_date, credit_date, status, billing_type
        FROM asaas_payments_sync
        WHERE EXTRACT(YEAR  FROM due_date) = :y
          AND EXTRACT(MONTH FROM due_date) = :m
    """), {"y": sel_year, "m": sel_month}).fetchall()

    asaas_payments = [
        {
            "id":          r.asaas_id,
            "customer":    r.customer_id,
            "value":       r.value or 0,
            "netValue":    r.net_value,
            "dueDate":     r.due_date.isoformat() if r.due_date else None,
            "paymentDate": r.payment_date.isoformat() if r.payment_date else None,
            "creditDate":  r.credit_date.isoformat() if r.credit_date else None,
            "status":      r.status,
            "billingType": r.billing_type,
            "banco":       "Asaas",
        }
        for r in asaas_rows
    ]

    # ── Itaú — planilha importada ────────────────────────────────
    upload_ref = f"{sel_year}-{sel_month:02d}"
    itau_rows = db.execute(text("""
        SELECT valor_titulo, valor_pago, data_vencimento, data_pagamento, status
        FROM itau_boletos WHERE upload_ref = :ref
    """), {"ref": upload_ref}).fetchall()

    itau_payments = [
        {
            "value":       r.valor_titulo or 0,
            "netValue":    r.valor_pago or 0,
            "dueDate":     r.data_vencimento.isoformat() if r.data_vencimento else None,
            "paymentDate": r.data_pagamento.isoformat() if r.data_pagamento else None,
            "creditDate":  r.data_pagamento.isoformat() if r.data_pagamento else None,
            "status":      {"paga": "RECEIVED", "a vencer": "PENDING", "vencida": "OVERDUE"}.get(
                               (r.status or "").lower(), r.status or ""),
            "billingType": "BOLETO",
            "banco":       "Itaú",
        }
        for r in itau_rows
    ]

    all_payments = asaas_payments + itau_payments

    recebidos = [p for p in all_payments if p.get("status") in received_statuses]
    # vencimento no fim de semana só conta como vencido depois da segunda seguinte
    vencidos  = [p for p in all_payments if p.get("status") == "OVERDUE" and is_overdue_iso(p.get("dueDate"))]
    pendentes = [p for p in all_payments if p.get("status") == "PENDING"]

    # emitido: preferência pelo ciclo de faturamento; fallback = soma all_payments
    total_emitido      = sum(s.total_final or 0 for s in summaries) if summaries else sum(p["value"] for p in all_payments)
    receita_confirmada = sum(p.get("netValue") or p.get("value", 0) for p in recebidos)
    receita_em_risco   = sum(p.get("value", 0) for p in vencidos)
    receita_pendente   = sum(p.get("value", 0) for p in pendentes)

    # Prazo médio
    dias_antecipacao = []
    for p in recebidos:
        credit_str = p.get("creditDate") or p.get("paymentDate") or ""
        due_str    = p.get("dueDate") or ""
        if not credit_str or not due_str:
            continue
        try:
            cd = date.fromisoformat(credit_str[:10])
            dd = date.fromisoformat(due_str[:10])
            dias_antecipacao.append((dd - cd).days)
        except Exception:
            continue
    prazo_medio = round(sum(dias_antecipacao) / len(dias_antecipacao), 1) if dias_antecipacao else None

    # Instrumento — Asaas tem billing_type; Itaú é sempre BOLETO
    def billing_type(p):
        bt = p.get("billingType") or "UNDEFINED"
        return "PIX" if bt in ("UNDEFINED", None, "") else bt

    pix_recebido    = sum((p.get("netValue") or p.get("value", 0)) for p in recebidos if billing_type(p) == "PIX")
    boleto_recebido = sum((p.get("netValue") or p.get("value", 0)) for p in recebidos if billing_type(p) == "BOLETO")
    boleto_vencido  = sum(p.get("value", 0) for p in vencidos if billing_type(p) == "BOLETO")
    boleto_total    = sum(p.get("value", 0) for p in all_payments if billing_type(p) == "BOLETO")
    pix_total       = pix_recebido

    por_instrumento_exec = {
        "PIX":    {"recebido": round(pix_recebido,    2), "vencido": 0},
        "Boleto": {"recebido": round(boleto_recebido, 2), "vencido": round(boleto_vencido, 2)},
    }

    # Top devedores — agrupa vencidos por cliente
    from collections import defaultdict
    _venc_map = defaultdict(float)
    for p in vencidos:
        key = p.get("customer") or p.get("cpfCnpj") or p.get("id") or "?"
        _venc_map[key] += p.get("value", 0)
    top_vencidos_sorted = sorted(_venc_map.items(), key=lambda x: -x[1])
    top3_valor = sum(v for _, v in top_vencidos_sorted[:3])
    top3_pct   = round(top3_valor / receita_em_risco * 100, 1) if receita_em_risco else 0
    top1_pct   = round(top_vencidos_sorted[0][1] / receita_em_risco * 100, 1) if (receita_em_risco and top_vencidos_sorted) else 0

    # Mantém compatibilidade com sinais que usam top_vencidos (lista de summaries)
    vencidos_db_for_top = [s for s in summaries if s.boleto_status == "OVERDUE" and s.due_date and is_overdue(s.due_date)]
    top_vencidos = sorted(vencidos_db_for_top, key=lambda s: s.total_final or 0, reverse=True)

    confirmado_pct = round(receita_confirmada / total_emitido * 100, 1) if total_emitido else 0
    em_risco_pct   = round(receita_em_risco   / total_emitido * 100, 1) if total_emitido else 0

    inadimplencia_boleto_pct = round(boleto_vencido / boleto_total * 100, 1) if boleto_total else 0
    inadimplencia_pix_pct    = 0

    # ── Comportamento pontual (usa dados do banco para contagem) ─
    confirmados_db2 = [s for s in summaries if s.boleto_status in ("RECEIVED", "CONFIRMED")]
    vencidos_db2    = [s for s in summaries if s.boleto_status == "OVERDUE" and s.due_date and is_overdue(s.due_date)]
    total_com_boleto = len([s for s in summaries if s.boleto_status])
    pontuais = len(confirmados_db2)
    pct_pontual = round(pontuais / total_com_boleto * 100, 1) if total_com_boleto else None

    # ── Sinais estratégicos (baseados nos dados) ─────────────
    sinais = []

    if vencidos_db2 and summaries:
        # Concentração de vencimento em data única
        from collections import Counter
        due_dates = [s.due_date for s in vencidos_db2 if s.due_date]
        if due_dates:
            mc = Counter(due_dates).most_common(1)[0]
            pct_conc = round(mc[1] / len(vencidos_db2) * 100, 1)
            if pct_conc >= 50:
                sinais.append({
                    "nivel": "danger",
                    "titulo": f"Inadimplência de {em_risco_pct}% é estrutural, não pontual",
                    "descricao": f"{mc[1]} clientes vencidos em {mc[0].strftime('%d/%m')}. Concentração de vencimento cria pico de risco mensal. Distribuir vencimentos ao longo do mês reduziria a volatilidade."
                })

    if boleto_total > 0 and pix_total == 0 and receita_em_risco > 0:
        sinais.append({
            "nivel": "danger",
            "titulo": "100% da inadimplência está em boleto bancário",
            "descricao": f"Pix tem zero inadimplência sobre R$ {pix_total:,.2f} recebidos. Migrar parte da base de boleto para Pix pode reduzir inadimplência em até 50% sem custo adicional."
        })
    elif pix_total > 0:
        sinais.append({
            "nivel": "info",
            "titulo": f"Pix: {inadimplencia_pix_pct}% de inadimplência",
            "descricao": f"R$ {pix_total:,.2f} recebidos via Pix, com {inadimplencia_pix_pct}% de inadimplência. Estratégia eficiente de recebimento."
        })

    if top_vencidos and receita_em_risco > 0:
        top1 = top_vencidos[0]
        sinais.append({
            "nivel": "warning",
            "titulo": f"{top1.id_smart}: R$ {top1.total_final:,.2f} — risco individual elevado",
            "descricao": f"Um único cliente representa {top1_pct}% de toda a inadimplência. Se não regularizar nos próximos 7 dias, impacta diretamente o fluxo de caixa."
        })

    if pct_pontual and pct_pontual >= 80:
        sinais.append({
            "nivel": "success",
            "titulo": f"{pct_pontual}% dos pagamentos ocorrem no prazo ou antes",
            "descricao": "A base pagante tem comportamento saudável. O problema está nos inadimplentes, não na qualidade geral da carteira."
        })

    if len(confirmados_db2) > 0 and len(vencidos_db2) > 0:
        ticket_pago    = round(receita_confirmada / len(confirmados_db2), 2)
        ticket_vencido = round(receita_em_risco   / len(vencidos_db2),   2)
        sinais.append({
            "nivel": "success",
            "titulo": "Ticket médio estável entre pagantes e inadimplentes",
            "descricao": f"R$ {ticket_pago:,.0f} (recebidos) vs R$ {ticket_vencido:,.0f} (vencidos). Inadimplência não está concentrada em clientes de menor ticket — distribuição uniforme."
        })

    # ── Indicadores executivos ───────────────────────────────
    def badge(valor, benchmark_max=None, benchmark_min=None, inverted=False):
        if benchmark_max is not None:
            ok = valor <= benchmark_max
        elif benchmark_min is not None:
            ok = valor >= benchmark_min
        else:
            return "info"
        return "success" if ok else ("danger" if (inverted or True) else "warning")

    indicadores = [
        {
            "nome":       "Taxa de inadimplência (valor)",
            "resultado":  f"{em_risco_pct:.1f}%",
            "benchmark":  "≤5%",
            "leitura":    ("saudável" if em_risco_pct <= 5 else f"{em_risco_pct/5:.0f}x acima do benchmark"),
            "level":      "success" if em_risco_pct <= 5 else "danger",
        },
        {
            "nome":       "Concentração top 1 devedor",
            "resultado":  f"{top1_pct:.1f}%",
            "benchmark":  "≤10%",
            "leitura":    ("dentro do esperado" if top1_pct <= 10 else "risco de crédito concentrado"),
            "level":      "success" if top1_pct <= 10 else "danger",
        },
        {
            "nome":       "Receita em risco / receita total",
            "resultado":  f"R$ {receita_em_risco:,.2f}",
            "benchmark":  "—",
            "leitura":    ("sem inadimplência" if receita_em_risco == 0 else "janela de 7 dias para recuperar"),
            "level":      "success" if receita_em_risco == 0 else "warning",
        },
        {
            "nome":       "Eficiência do Pix",
            "resultado":  f"{inadimplencia_pix_pct}% inadimplência",
            "benchmark":  "—",
            "leitura":    ("alavanca de melhoria disponível" if pix_total == 0 else f"R$ {pix_total:,.0f} via Pix"),
            "level":      "info",
        },
        {
            "nome":       "Prazo médio recebimento",
            "resultado":  (f"{prazo_medio:+.1f} dias" if prazo_medio is not None else "sem dados"),
            "benchmark":  "≤5 dias",
            "leitura":    ("saudável" if prazo_medio is not None and prazo_medio >= -5 else "dentro do esperado"),
            "level":      "success" if prazo_medio is not None else "info",
        },
        {
            "nome":       "% base com comportamento pontual",
            "resultado":  (f"{pct_pontual}%" if pct_pontual is not None else "sem dados"),
            "benchmark":  "≥85%",
            "leitura":    ("dentro do esperado" if pct_pontual and pct_pontual >= 85 else ("a monitorar" if pct_pontual else "sem dados")),
            "level":      "success" if (pct_pontual and pct_pontual >= 85) else "info",
        },
    ]

    # ── Recomendações ────────────────────────────────────────
    top3_ids = [s.id_smart for s in top_vencidos[:3]]
    top12_acima500 = [s for s in top_vencidos if (s.total_final or 0) >= 500][:12]

    recomendacoes = {
        "imediato": (
            f"Contato direto com {', '.join(top3_ids[:3])}. "
            f"Os três somam {top3_pct:.1f}% do total vencido (R$ {top3_valor:,.2f})."
        ) if top_vencidos else "Nenhum vencido no momento.",
        "curto_prazo": (
            f"Disparar régua de cobrança para os {len(top12_acima500)} devedores acima de R$ 500 "
            f"que somam R$ {sum(s.total_final or 0 for s in top12_acima500):,.0f}."
        ) if top12_acima500 else "Manter monitoramento preventivo.",
        "estrategico": (
            "Migrar base de boleto para Pix progressivamente. "
            "Dados mostram zero inadimplência no Pix — alavanca de melhoria sem custo adicional."
        ) if boleto_total > 0 else (
            "Implementar cobrança via Pix para novos clientes e monitorar taxa de conversão."
        ),
    }

    return {
        "periodo":           f"{sel_month:02d}/{sel_year}",
        "cycle_id":          cycle.id if cycle else None,
        "emitido":           round(total_emitido, 2),
        "qtd_clientes":      len(summaries) if summaries else len(set(p.get("customer") or p.get("id","") for p in all_payments)),
        "confirmado":        round(receita_confirmada, 2),
        "confirmado_pct":    confirmado_pct,
        "em_risco":          round(receita_em_risco, 2),
        "em_risco_pct":      em_risco_pct,
        "pendente":          round(receita_pendente, 2),
        "top3_valor":        round(top3_valor, 2),
        "top3_pct":          top3_pct,
        "top1_pct":          top1_pct,
        "pix_recebido":      round(pix_recebido, 2),
        "pix_inadimplencia": inadimplencia_pix_pct,
        "boleto_recebido":   round(boleto_recebido, 2),
        "boleto_vencido":    round(boleto_vencido, 2),
        "boleto_inadimplencia": inadimplencia_boleto_pct,
        "por_instrumento":   por_instrumento_exec,
        "sinais":            sinais,
        "indicadores":       indicadores,
        "recomendacoes":     recomendacoes,
        "available_cycles":  available_cycles,
        "por_semana":        _build_por_semana(all_payments, sel_year, sel_month) if all_payments else {},
    }


def _build_por_semana(payments, year, month):
    """Helper: builds por_semana dict from merged payments list."""
    import calendar as cal_mod

    last_day = cal_mod.monthrange(year, month)[1]
    received_statuses = ("RECEIVED", "CONFIRMED")

    def week_of_day(day):
        if day <= 7:  return "W1"
        if day <= 14: return "W2"
        if day <= 21: return "W3"
        return "W4"

    por_semana = {
        "W1": {"planejado": 0.0, "realizado": 0.0, "label": "01–07"},
        "W2": {"planejado": 0.0, "realizado": 0.0, "label": "08–14"},
        "W3": {"planejado": 0.0, "realizado": 0.0, "label": "15–21"},
        "W4": {"planejado": 0.0, "realizado": 0.0, "label": f"22–{last_day:02d}"},
    }

    prefix = f"{year}-{month:02d}"
    from datetime import date as _date
    for p in payments:
        due_str = p.get("dueDate") or ""
        if due_str.startswith(prefix):
            try:
                d = _date.fromisoformat(str(due_str)[:10]).day
                por_semana[week_of_day(d)]["planejado"] += p.get("value", 0)
            except (ValueError, TypeError):
                pass
        if p.get("status") in received_statuses:
            cd = p.get("creditDate") or ""
            if cd.startswith(prefix):
                try:
                    d = _date.fromisoformat(str(cd)[:10]).day
                    por_semana[week_of_day(d)]["realizado"] += p.get("netValue") or p.get("value", 0)
                except (ValueError, TypeError):
                    pass

    for wk in por_semana.values():
        wk["planejado"] = round(wk["planejado"], 2)
        wk["realizado"] = round(wk["realizado"], 2)
    return por_semana
