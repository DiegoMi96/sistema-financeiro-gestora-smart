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
from app.models.comissionamento import ComissaoExtrato, ComissaoCiclo, CadastroParceiro
from app.core.permissions import require_permission
from app.routers.auth import get_current_user
from datetime import datetime, timezone

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


# ── Ciclo (Diretor Administrativo / Diretor Comercial / Gestor de Operações) ──
# Cada perfil guarda o `mdata` inteiro (todos os meses) como um blob só —
# são poucos campos por mês, não vale a pena uma linha por mês no banco.

class CicloIn(BaseModel):
    perfil: str
    dados:  dict


@router.post("/ciclo", status_code=201)
def salvar_ciclo(data: CicloIn, db: Session = Depends(get_db)):
    existente = db.query(ComissaoCiclo).filter(ComissaoCiclo.perfil == data.perfil).first()
    if existente:
        existente.dados = data.dados
        db.commit()
        db.refresh(existente)
        return {"perfil": existente.perfil, "dados": existente.dados}

    novo = ComissaoCiclo(perfil=data.perfil, dados=data.dados)
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return {"perfil": novo.perfil, "dados": novo.dados}


@router.get("/ciclo")
def buscar_ciclo(perfil: str, db: Session = Depends(get_db)):
    row = db.query(ComissaoCiclo).filter(ComissaoCiclo.perfil == perfil).first()
    return {"perfil": perfil, "dados": row.dados if row else {}}


# ── Cadastros enviados pelo link público ─────────────────────────────────
# O formulário público grava em app/routers/cadastro_publico.py. Aqui a tela
# "Cadastro de Parceiros" busca os novos ao abrir e confirma depois de colocá-los
# na lista. Nada é apagado: o servidor guarda o registro oficial.

def _cadastro_out(c: CadastroParceiro) -> dict:
    return {
        "id": c.id,
        "status": c.status,
        "criado_em": c.criado_em.isoformat() if c.criado_em else None,
        "ciente_nf_em": c.ciente_nf_em.isoformat() if c.ciente_nf_em else None,
        "dados": c.dados,
    }


@router.get("/cadastros-parceiros")
def listar_cadastros_parceiros(status: str = "novo", db: Session = Depends(get_db)):
    """status: novo (ainda não puxados pela tela) | importado | todos."""
    q = db.query(CadastroParceiro)
    if status in ("novo", "importado"):
        q = q.filter(CadastroParceiro.status == status)
    return [_cadastro_out(c) for c in q.order_by(CadastroParceiro.id).limit(500).all()]


class ConfirmarCadastrosIn(BaseModel):
    ids: List[int]


@router.post("/cadastros-parceiros/confirmar")
def confirmar_cadastros_parceiros(
    data: ConfirmarCadastrosIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """A tela chama depois de gravar os cadastros na lista local. Idempotente."""
    if not data.ids:
        return {"confirmados": 0}
    agora = datetime.now(timezone.utc)
    n = (
        db.query(CadastroParceiro)
        .filter(CadastroParceiro.id.in_(data.ids[:500]), CadastroParceiro.status == "novo")
        .update({"status": "importado", "importado_em": agora, "importado_por": getattr(user, "id", None)},
                synchronize_session=False)
    )
    db.commit()
    return {"confirmados": n}
