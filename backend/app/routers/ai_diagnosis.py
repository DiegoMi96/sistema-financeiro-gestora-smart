"""
Diagnóstico por IA — Gestora Smart
Analisa os dados do ciclo de faturamento e retorna insights em português.
"""
import hashlib
import json
import httpx
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, not_, and_, text

from app.database import get_db
from app.models import BillingCycle, BillingClientSummary, BillingLine, BillingStatus, User
from app.models.extra import AIAnalysis, OperationalDiagnosis
from app.routers.auth import get_current_user
from app.routers.analyst import payment_planning
from app.routers.previsibilidade import _score, _fmt_cnpj
from app.config import settings

router = APIRouter(prefix="/ai", tags=["Diagnóstico IA"])

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"


def _build_context(cycle_id: int, db: Session) -> dict:
    """Monta o contexto de dados para enviar à IA."""

    cycle = db.query(BillingCycle).filter(BillingCycle.id == cycle_id).first()
    if not cycle:
        return {}

    # Dados do ciclo atual
    summaries = db.query(BillingClientSummary).filter(
        BillingClientSummary.cycle_id == cycle_id
    ).all()

    # Breakdown por status
    # Exclui a linha de Cancelamento vinda da base (iccid != "") — o valor
    # oficial já vem da linha do arquivo dedicado (iccid==""), contá-las
    # juntas dobra o total de Cancelamento.
    breakdown = db.query(
        BillingLine.status,
        func.count(BillingLine.id).label("qtd"),
        func.sum(BillingLine.total_linha).label("valor"),
    ).filter(
        BillingLine.cycle_id == cycle_id,
        not_(and_(BillingLine.status == "Cancelamento", BillingLine.iccid != "")),
    ).group_by(BillingLine.status).all()

    # Histórico dos 3 ciclos anteriores
    historico = db.query(BillingCycle).filter(
        BillingCycle.id < cycle_id,
        BillingCycle.status.in_([BillingStatus.APROVADO, BillingStatus.FECHADO])
    ).order_by(BillingCycle.id.desc()).limit(3).all()

    # Top 10 maiores faturas
    top_clientes = sorted(summaries, key=lambda s: s.total_final or 0, reverse=True)[:10]

    # Clientes com fatura zerada (possível problema)
    zerados = [s for s in summaries if (s.total_final or 0) == 0]

    total_faturado  = sum(s.total_final or 0 for s in summaries)
    total_mensalidde = sum(s.total_mensalidade or 0 for s in summaries)
    total_ativacao  = sum(s.total_ativacao or 0 for s in summaries)
    total_excedente = sum(s.total_excedente or 0 for s in summaries)
    total_multa     = sum(s.total_multa or 0 for s in summaries)
    total_frete     = sum(s.total_frete or 0 for s in summaries)

    ctx = {
        "ciclo": {
            "id": cycle.id,
            "periodo": f"{cycle.month:02d}/{cycle.year}",
            "total_faturado": round(total_faturado, 2),
            "total_boletos": cycle.total_boletos,
            "total_linhas": cycle.total_lines,
        },
        "composicao": {
            "mensalidade":  round(total_mensalidde, 2),
            "ativacao":     round(total_ativacao, 2),
            "excedente":    round(total_excedente, 2),
            "multa":        round(total_multa, 2),
            "frete":        round(total_frete, 2),
            "pct_mensalidade": round(total_mensalidde / total_faturado * 100, 1) if total_faturado else 0,
        },
        "por_status": [
            {"status": r.status, "qtd": r.qtd, "valor": round(r.valor or 0, 2)}
            for r in breakdown
        ],
        "historico": [
            {
                "periodo": f"{h.month:02d}/{h.year}",
                "total": round(h.total_value or 0, 2),
                "boletos": h.total_boletos,
                "linhas": h.total_lines,
            }
            for h in historico
        ],
        "top_clientes": [
            {"id_smart": s.id_smart, "valor": round(s.total_final or 0, 2)}
            for s in top_clientes
        ],
        "alertas": {
            "clientes_fatura_zerada": len(zerados),
            "ticket_medio": round(total_faturado / len(summaries), 2) if summaries else 0,
        }
    }

    return ctx


def _build_prompt(ctx: dict) -> str:
    return f"""Você é um analista financeiro especialista em empresas de conectividade B2B/IoT.
Analise os dados de faturamento abaixo e produza um diagnóstico executivo em português.

DADOS DO FATURAMENTO:
{json.dumps(ctx, ensure_ascii=False, indent=2)}

Produza um diagnóstico com exatamente estas seções:

## 📊 Resumo Executivo
2-3 frases diretas sobre o desempenho do mês.

## ✅ Pontos Positivos
Até 3 pontos positivos identificados nos dados.

## ⚠️ Pontos de Atenção
Até 3 pontos que merecem acompanhamento.

## 🔍 Análise de Tendência
Compare com os meses anteriores. Identifique tendências de crescimento ou queda.

## 💡 Recomendações
Até 3 ações concretas e práticas para o próximo mês.

## 📌 O que Monitorar
3 indicadores específicos para acompanhar na próxima semana.

Seja direto, use números reais dos dados, evite jargões desnecessários.
Escreva como se estivesse explicando para uma gestora financeira que está aprendendo a ler esses indicadores."""


async def _call_anthropic(prompt: str, max_tokens: int = 1500) -> str:
    """Chama a API da Anthropic e devolve o texto da resposta."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY não configurada. Adicione ao .env para usar o diagnóstico por IA."
        )
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key":         settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            json={
                "model":      "claude-sonnet-4-6",
                "max_tokens": max_tokens,
                "messages":   [{"role": "user", "content": prompt}],
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Erro na API da IA: {r.text}")
    return r.json()["content"][0]["text"]


@router.get("/diagnosis/{cycle_id}")
async def get_diagnosis(
    cycle_id: int,
    force_refresh: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retorna o diagnóstico de IA para um ciclo.
    Usa cache — só rechama a API se force_refresh=true ou se os dados mudaram.
    """
    ctx  = _build_context(cycle_id, db)
    if not ctx:
        raise HTTPException(status_code=404, detail="Ciclo não encontrado")

    # Hash dos dados para detectar mudanças
    data_hash = hashlib.md5(json.dumps(ctx, sort_keys=True).encode()).hexdigest()

    # Verifica cache
    cached = db.query(AIAnalysis).filter(
        AIAnalysis.cycle_id == cycle_id,
        AIAnalysis.type == "diagnostico",
    ).order_by(AIAnalysis.created_at.desc()).first()

    if cached and cached.input_hash == data_hash and not force_refresh:
        return {
            "cycle_id":   cycle_id,
            "content":    cached.content,
            "cached":     True,
            "created_at": cached.created_at.isoformat(),
        }

    # Chama a API da Anthropic
    prompt  = _build_prompt(ctx)
    content = await _call_anthropic(prompt)

    # Salva no cache
    analysis = AIAnalysis(
        cycle_id=cycle_id,
        type="diagnostico",
        content=content,
        model_used="claude-sonnet-4-6",
        input_hash=data_hash,
        created_by=current_user.id,
    )
    db.add(analysis)
    db.commit()

    return {
        "cycle_id":   cycle_id,
        "content":    content,
        "cached":     False,
        "created_at": analysis.created_at.isoformat(),
    }


# ══════════════════════════════════════════════════════════════
# DIAGNÓSTICO OPERACIONAL E DE COBRANÇA
# Diferente do diagnóstico acima (que é por ciclo de faturamento): este é
# por período (mês/ano) e cobre duas frentes pedidas pelo Diego em
# 22/08/2026 — (1) comportamento de pagamento/inadimplência dos clientes e
# (2) uso da plataforma pelos usuários internos — com recomendações
# concretas, não só um resumo descritivo.
# ══════════════════════════════════════════════════════════════

ACTION_LABELS = {
    "auth.login":             "Login no sistema",
    "user.create":            "Criação de usuário",
    "user.update":            "Edição de usuário",
    "user.delete_permanent":  "Exclusão de usuário",
    "billing.approve":        "Aprovação de ciclo de faturamento",
    "adjustment.create":      "Criação de ajuste de faturamento",
}


async def _build_context_operacional(month: int, year: int, current_user: User, db: Session) -> dict:
    hist_start = date(year, month, 1) - timedelta(days=180)
    target_start = date(year, month, 1)

    # ── 1) Comportamento de pagamento / inadimplência ──────────────────
    # Reaproveita a MESMA classificação A/B/C (>=0 em dia, até -5 atraso
    # leve, abaixo disso atraso crônico) usada na Previsibilidade
    # Comportamental — critério do Diego é justamente "em dia ou até 5
    # dias de atraso" pra ser considerado aceitável.
    hist_rows = db.execute(text("""
        SELECT customer_cpf_cnpj, customer_name,
               COUNT(*) AS qtd,
               ROUND(AVG(due_date - credit_date)::numeric, 1) AS avg_dias
        FROM asaas_payments_sync
        WHERE status IN ('RECEIVED', 'CONFIRMED')
          AND credit_date IS NOT NULL AND due_date IS NOT NULL
          AND due_date >= :hs AND due_date < :ts
          AND customer_cpf_cnpj IS NOT NULL
        GROUP BY customer_cpf_cnpj, customer_name
        HAVING COUNT(*) >= 3
    """), {"hs": hist_start, "ts": target_start}).fetchall()

    pend_rows = db.execute(text("""
        SELECT customer_cpf_cnpj, SUM(COALESCE(net_value, value, 0)) AS valor_pendente
        FROM asaas_payments_sync
        WHERE status IN ('PENDING', 'OVERDUE')
          AND EXTRACT(YEAR FROM due_date) = :y AND EXTRACT(MONTH FROM due_date) = :m
        GROUP BY customer_cpf_cnpj
    """), {"y": year, "m": month}).fetchall()
    pendente_por_cliente = {r.customer_cpf_cnpj: float(r.valor_pendente or 0) for r in pend_rows}

    scores = []
    contagem_score = {"A": 0, "B": 0, "C": 0}
    for r in hist_rows:
        avg_dias = float(r.avg_dias or 0)
        sc, _ = _score(avg_dias)
        contagem_score[sc] += 1
        scores.append({
            "nome":            r.customer_name or "Não identificado",
            "cnpj":            _fmt_cnpj(r.customer_cpf_cnpj or ""),
            "qtd_pagamentos":  r.qtd,
            "avg_dias_atraso": -avg_dias,   # positivo = dias de atraso, mais legível pro prompt
            "score":           sc,
            "valor_pendente_mes": round(pendente_por_cliente.get(r.customer_cpf_cnpj, 0), 2),
        })

    piores_ofensores = sorted(
        [s for s in scores if s["score"] == "C"],
        key=lambda s: s["valor_pendente_mes"],
        reverse=True,
    )[:10]

    melhores_clientes = sorted(
        [s for s in scores if s["score"] == "A"],
        key=lambda s: s["valor_pendente_mes"],
        reverse=True,
    )[:5]

    # Reaproveita o planejamento comportamental já corrigido (mesma fonte
    # que o card "Planejamento comportamental" do AnalystDashboard) em vez
    # de recalcular a mesma regra de outro jeito.
    plano = await payment_planning(month=month, year=year, current_user=current_user, db=db)
    total_planejado_mes = round(sum(d["planejado"] for d in plano["planejado_por_dia"]), 2)

    inadimplencia = {
        "clientes_score_a_em_dia":       contagem_score["A"],
        "clientes_score_b_atraso_leve":  contagem_score["B"],
        "clientes_score_c_atraso_cronico": contagem_score["C"],
        "total_clientes_com_historico":  len(scores),
        "piores_ofensores":              piores_ofensores,
        "melhores_clientes":             melhores_clientes,
        "valor_previsto_este_mes":       total_planejado_mes,
        "valor_deslocado_mes_seguinte":  plano["valor_previsto_mes_seguinte"],
        "clientes_deslocados_mes_seguinte": plano["clientes_previsto_mes_seguinte"],
        "cobertura_historico_pct":       plano["cobertura_pct"],
    }

    # ── 2) Uso da plataforma pelos usuários internos ───────────────────
    cutoff = date.today() - timedelta(days=30)
    usage_rows = db.execute(text("""
        SELECT u.id, u.name, u.role, al.action, COUNT(*) AS qtd
        FROM audit_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= :cutoff
        GROUP BY u.id, u.name, u.role, al.action
    """), {"cutoff": cutoff}).fetchall()

    por_usuario: dict = {}
    por_acao: dict = {}
    for r in usage_rows:
        por_usuario.setdefault(r.name, {"role": r.role, "total": 0, "acoes": {}})
        label = ACTION_LABELS.get(r.action, r.action)
        por_usuario[r.name]["acoes"][label] = por_usuario[r.name]["acoes"].get(label, 0) + r.qtd
        por_usuario[r.name]["total"] += r.qtd
        por_acao[label] = por_acao.get(label, 0) + r.qtd

    todos_usuarios = db.execute(text(
        "SELECT name FROM users WHERE is_active = true"
    )).fetchall()
    usuarios_sem_atividade = [u.name for u in todos_usuarios if u.name not in por_usuario]

    usage = {
        "periodo_dias":              30,
        "usuarios_ativos":           [
            {"nome": nome, **info} for nome, info in
            sorted(por_usuario.items(), key=lambda kv: kv[1]["total"], reverse=True)
        ],
        "usuarios_sem_atividade":    usuarios_sem_atividade,
        "acoes_totais_no_periodo":   por_acao,
        "limitacoes_do_rastreamento": (
            "Este uso cobre apenas login, aprovação de ciclo de faturamento, "
            "criação de ajuste e gestão de usuários. O módulo de Contestação "
            "não registra nenhuma ação ainda, e não existe rastreamento de "
            "navegação/visualização de tela — só ações que gravam dado."
        ),
    }

    return {"periodo": f"{month:02d}/{year}", "inadimplencia": inadimplencia, "uso_da_plataforma": usage}


def _build_prompt_operacional(ctx: dict) -> str:
    return f"""Você é um consultor de operações financeiras e cobrança B2B, especialista em empresas de conectividade/IoT.
Analise os dados abaixo (comportamento de pagamento dos clientes + uso da plataforma pelos usuários internos) e produza um diagnóstico PRÁTICO e ACIONÁVEL em português — o leitor quer usar isso HOJE para decidir o que fazer, não uma descrição genérica dos números.

DADOS:
{json.dumps(ctx, ensure_ascii=False, indent=2)}

Produza um diagnóstico com exatamente estas seções:

## 💰 Inadimplência — quem atrasa e o que fazer
Cite os piores ofensores pelo NOME e CNPJ reais dos dados, o valor em risco de cada um, e para cada um (ou para o grupo, se muitos) uma ação concreta e específica (ex.: "ligar antes do vencimento", "antecipar o dia de cobrança em N dias", "renegociar prazo", "colocar em régua de cobrança mais agressiva"). Não generalize — use os números e nomes reais do JSON.

## ✅ Clientes exemplares
Quem paga em dia ou adiantado (score A) com maior valor — vale considerar para benefícios/fidelização (ex.: desconto por pontualidade).

## 📊 Panorama de recebimento do mês
Resuma valor previsto este mês vs. valor que já saiu pro mês seguinte por atraso crônico, e o que isso significa em caixa.

## 👥 Uso da plataforma pela equipe
Quem está usando o sistema (login, aprovações, ajustes) e quem está com atividade baixa/nula nos últimos 30 dias. Aponte se alguma ação crítica (ex.: aprovação de ciclo, criação de ajuste) está concentrada em pouca gente — isso é risco operacional (dependência de uma pessoa).

## 🔧 Lacunas e melhorias no sistema
Baseado nas limitações de rastreamento informadas nos dados (o que NÃO é medido hoje), sugira até 3 melhorias concretas no próprio sistema (não no cliente) — ex.: passar a registrar ações da Contestação, medir engajamento por tela.

## ⚡ Ações imediatas (próximos 7 dias)
Lista numerada de até 5 ações bem específicas e priorizadas, cada uma citando cliente/usuário/valor real quando aplicável. Isto é a seção mais importante — tem que ser algo que dá pra fazer HOJE, não recomendação vaga.

Seja direto, cite números e nomes reais, nunca invente dado que não está no JSON. Se um dado necessário não existir, diga isso explicitamente em vez de inventar."""


@router.get("/diagnosis-operacional")
async def get_diagnosis_operacional(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020),
    force_refresh: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Diagnóstico operacional e de cobrança — inadimplência/adimplência dos
    clientes + uso da plataforma pelos usuários internos, com recomendações
    imediatas. Por período (mês/ano), não por ciclo. Cache em
    operational_diagnoses, mesma lógica de hash do diagnóstico por ciclo.
    """
    ctx = await _build_context_operacional(month, year, current_user, db)

    data_hash = hashlib.md5(json.dumps(ctx, sort_keys=True).encode()).hexdigest()

    cached = db.query(OperationalDiagnosis).filter(
        OperationalDiagnosis.month == month,
        OperationalDiagnosis.year == year,
    ).order_by(OperationalDiagnosis.created_at.desc()).first()

    if cached and cached.input_hash == data_hash and not force_refresh:
        return {
            "month": month, "year": year,
            "content":    cached.content,
            "cached":     True,
            "created_at": cached.created_at.isoformat(),
        }

    prompt  = _build_prompt_operacional(ctx)
    content = await _call_anthropic(prompt, max_tokens=2200)

    analysis = OperationalDiagnosis(
        month=month,
        year=year,
        content=content,
        model_used="claude-sonnet-4-6",
        input_hash=data_hash,
        created_by=current_user.id,
    )
    db.add(analysis)
    db.commit()

    return {
        "month": month, "year": year,
        "content":    content,
        "cached":     False,
        "created_at": analysis.created_at.isoformat(),
    }
