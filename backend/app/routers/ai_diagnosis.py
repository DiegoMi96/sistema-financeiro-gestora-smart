"""
Diagnóstico por IA — Gestora Smart
Analisa os dados do ciclo de faturamento e retorna insights em português.
"""
import hashlib
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import BillingCycle, BillingClientSummary, BillingLine, BillingStatus
from app.models.extra import AIAnalysis
from app.routers.auth import get_current_user
from app.models import User
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
    breakdown = db.query(
        BillingLine.status,
        func.count(BillingLine.id).label("qtd"),
        func.sum(BillingLine.total_linha).label("valor"),
    ).filter(BillingLine.cycle_id == cycle_id).group_by(BillingLine.status).all()

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
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY não configurada. Adicione ao .env para usar o diagnóstico por IA."
        )

    prompt = _build_prompt(ctx)

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
                "max_tokens": 1500,
                "messages":   [{"role": "user", "content": prompt}],
            },
        )

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Erro na API da IA: {r.text}")

    content = r.json()["content"][0]["text"]

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
