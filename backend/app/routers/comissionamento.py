"""
Comissionamento — endpoints do extrato pós-cálculo (persistência real).

O front (arquivos estáticos em /comissionamento/) chama isso pra:
  1) gravar o extrato de uma aba assim que o Importar processa (POST)
  2) buscar o extrato salvo ao abrir a tela, no lugar de confiar só na memória
     do navegador — resolve o "some no F5" (GET)
"""
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comissionamento import ComissaoExtrato
from app.core.permissions import require_permission

# Mesmo padrão do organograma: qualquer chamada exige login + a permissão do
# módulo (já existe ponta a ponta desde a integração do card/rota React).
router = APIRouter(
    prefix="/comissionamento",
    tags=["comissionamento"],
    dependencies=[Depends(require_permission("can_view_comissao"))],
)


class ExtratoIn(BaseModel):
    colaborador_id:   str
    colaborador_nome: str
    tipo:             str
    mes_referencia:   str
    aba:              str
    headers:          List[str]
    linhas:           List[List[Any]]


def _out(e: ComissaoExtrato) -> dict:
    return {
        "colaborador_id":   e.colaborador_id,
        "colaborador_nome": e.colaborador_nome,
        "tipo":             e.tipo,
        "mes_referencia":   e.mes_referencia,
        "aba":              e.aba,
        "headers":          e.headers,
        "linhas":           e.linhas,
        "atualizado_em":    e.atualizado_em.isoformat() if e.atualizado_em else None,
    }


@router.post("/extratos", status_code=201)
def salvar_extrato(data: ExtratoIn, db: Session = Depends(get_db)):
    existente = (
        db.query(ComissaoExtrato)
        .filter(
            ComissaoExtrato.colaborador_id == data.colaborador_id,
            ComissaoExtrato.mes_referencia == data.mes_referencia,
            ComissaoExtrato.aba == data.aba,
        )
        .first()
    )
    if existente:
        existente.colaborador_nome = data.colaborador_nome
        existente.tipo = data.tipo
        existente.headers = data.headers
        existente.linhas = data.linhas
        db.commit()
        db.refresh(existente)
        return _out(existente)

    novo = ComissaoExtrato(
        colaborador_id=data.colaborador_id,
        colaborador_nome=data.colaborador_nome,
        tipo=data.tipo,
        mes_referencia=data.mes_referencia,
        aba=data.aba,
        headers=data.headers,
        linhas=data.linhas,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return _out(novo)


@router.get("/extratos")
def buscar_extratos(
    colaborador_id: str,
    mes_referencia: str,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ComissaoExtrato)
        .filter(
            ComissaoExtrato.colaborador_id == colaborador_id,
            ComissaoExtrato.mes_referencia == mes_referencia,
        )
        .all()
    )
    return [_out(r) for r in rows]
