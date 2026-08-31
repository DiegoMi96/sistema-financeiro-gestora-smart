"""
Insights do mês — Fechamento (Controladoria).

O Controladoria (controladoria/index.html) é um app estático separado, sem
sessão JWT — autentica no backend via x-api-key (mesmo padrão do
GET /sheets/sync, ver sheets.py). Toda a lógica de negócio (KPIs, deltas
vs. mês anterior etc.) já roda em JS no próprio dashboard a partir da
planilha sincronizada; reimplementar isso em Python só pra gerar o texto
duplicaria milhares de linhas de regra de negócio. Em vez disso, o
frontend manda os números que ele mesmo já calculou e está mostrando na
tela — este router só cacheia por mês/ano e chama a Anthropic API.

Cache: mesma filosofia do /ai/diagnosis-operacional (ai_diagnosis.py) —
olha o último registro pra aquele mês/ano e devolve, só gera de novo com
force_refresh=true (nunca automaticamente, pra não custar API a cada
visita à tela — foi um bug real já corrigido no Diagnóstico Operacional).
"""
import json
import httpx
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.extra import ControladoriaInsight
from app.routers.settings import SystemSetting
from app.config import settings

router = APIRouter(prefix="/controladoria", tags=["Controladoria"])

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"

MES_NOME = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]


def _get_setting(db: Session, key: str) -> Optional[str]:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return row.value if row else None


def _check_api_key(db: Session, x_api_key: Optional[str]):
    expected = _get_setting(db, "sheets_sync_api_key")
    if not expected or x_api_key != expected:
        raise HTTPException(401, "Não autorizado")


class InsightsPayload(BaseModel):
    month: int
    year: int
    force_refresh: bool = False
    kpis: dict   # números já formatados que a tela do Fechamento está mostrando


def _build_prompt(kpis: dict, month: int, year: int) -> str:
    periodo = f"{MES_NOME[month - 1]}/{year}"
    return f"""Você é um controller financeiro experiente escrevendo o resumo executivo do fechamento mensal de uma empresa B2B de conectividade (SIM cards e M2M/IoT).

Dados do fechamento de {periodo}, já calculados e conferidos — use exatamente os números abaixo, não recalcule nem invente nada que não esteja aqui:
{json.dumps(kpis, ensure_ascii=False, indent=2)}

Escreva uma leitura executiva em português, em um único parágrafo corrido de 6 a 8 frases (sem headers de markdown, sem bullet points, sem saudação). Destaque o que mais chamou atenção no mês — pra melhor ou pra pior —, alguma tendência relevante se os dados de comparação permitirem, e um ponto de atenção prático se houver algum risco visível. Cite números reais do JSON ao longo do texto. Tom direto e objetivo, sem elogio genérico nem clichê corporativo."""


async def _call_anthropic(prompt: str, max_tokens: int = 1200) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY não configurada. Adicione ao .env para usar os insights.",
        )
    # Mesma calibração do ai_diagnosis.py (~40 tok/s + 20s de folga de rede).
    timeout = max(60.0, max_tokens / 40 + 20)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
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
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="A IA demorou demais para responder. Tente atualizar novamente em alguns segundos.",
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Erro na API da IA: {r.text}")
    return r.json()["content"][0]["text"]


@router.post("/insights")
async def get_insights(
    payload: InsightsPayload,
    x_api_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _check_api_key(db, x_api_key)

    if not payload.force_refresh:
        cached = (
            db.query(ControladoriaInsight)
            .filter(
                ControladoriaInsight.month == payload.month,
                ControladoriaInsight.year == payload.year,
            )
            .order_by(ControladoriaInsight.created_at.desc())
            .first()
        )
        if cached:
            return {
                "month": payload.month, "year": payload.year,
                "content": cached.content, "cached": True,
                "created_at": cached.created_at.isoformat(),
            }

    prompt = _build_prompt(payload.kpis, payload.month, payload.year)
    content = await _call_anthropic(prompt)

    row = ControladoriaInsight(
        month=payload.month, year=payload.year,
        content=content, model_used="claude-sonnet-4-6",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "month": payload.month, "year": payload.year,
        "content": content, "cached": False,
        "created_at": row.created_at.isoformat(),
    }
