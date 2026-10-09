"""
Comissionamento — endpoints do extrato pós-cálculo (persistência real).

O front (arquivos estáticos em /comissionamento/) chama isso pra:
  1) gravar o extrato de uma aba assim que o Importar processa (POST)
  2) buscar o extrato salvo ao abrir a tela, no lugar de confiar só na memória
     do navegador — resolve o "some no F5" (GET)
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comissionamento import ComissaoExtrato, ComissaoCiclo, CadastroParceiro, ComissaoEstado, ComissaoImportacao
from app.core.permissions import require_permission, get_permission
from app.routers.auth import get_current_user
from datetime import datetime, timezone

# Mesmo padrão do organograma: qualquer chamada exige login + a permissão do
# módulo (já existe ponta a ponta desde a integração do card/rota React).
router = APIRouter(
    prefix="/comissionamento",
    tags=["comissionamento"],
    dependencies=[Depends(require_permission("can_view_comissao"))],
)


# ── Quem pode ler/gravar o quê ───────────────────────────────────────────
# O módulo inteiro exige `can_view_comissao`, mas as permissões por painel
# (can_view_com_*) antes só escondiam o menu — a API entregava os dados de TODOS os
# perfis a qualquer usuário do módulo. Ex.: o Diretor Comercial não pode ver o
# Diretor Administrativo nem o Gestor de Operações (pedido do Diego, 09/10/2026).
# Agora cada chave/extrato/ciclo/planilha só sai (e só entra) para quem tem pelo menos
# uma das permissões de painel que usam aquele dado. Admin tem todas.
_AREAS_GERAIS = ["consolidado", "executivo", "importar"]
_TODAS = ["consolidado", "executivo", "vendedor", "dealer", "indicadores", "projeto_especial",
          "gestor_operacoes", "diretor_comercial", "diretor_adm", "cadastro", "importar"]


def _pode(user, db, areas) -> bool:
    return any(get_permission(user, "can_view_com_" + a, db) for a in areas)


def _areas_da_chave(chave: str):
    """
    Quem pode LER cada chave de estado. A Visão Consolidada/Executivo NÃO abre os dados dos
    perfis: ela só mostra (e só recebe) o que o usuário já pode ver pelo painel do próprio
    perfil — senão quem só vê "Diretor Comercial" + Consolidada leria os números dos outros.
    "importar" (função administrativa que processa tudo) lê/grava todas as chaves de perfil.
    """
    if chave in ("gs5_v", "dp1_dealers", "dp1_projetos", "ind1_list"):   # listas de cadastro
        base = {"gs5_v": ["vendedor"], "dp1_dealers": ["dealer"], "dp1_projetos": ["projeto_especial"],
                "ind1_list": ["indicadores"]}[chave]
        return base + ["cadastro", "importar"]
    if chave.startswith("gs5_"):
        return ["vendedor", "importar"]
    if chave.startswith("dp1_"):
        return ["dealer", "projeto_especial", "importar"]
    if chave.startswith("ind1_"):
        return ["indicadores", "importar"]
    if chave.startswith("dc1_"):
        return ["diretor_comercial", "importar"]
    if chave.startswith("da1_"):
        return ["diretor_adm", "importar"]
    if chave.startswith("go1_"):
        return ["gestor_operacoes", "importar"]
    if chave == "imp_clientes_map":
        return ["importar"]
    if chave == "regras_comissao":
        return ["dealer", "projeto_especial", "importar"]
    if chave in ("cons_hist_manual", "cons_bonus_extra"):
        return _AREAS_GERAIS      # leitura liberada, mas filtrada por campo (ver _filtrar_valor)
    return _TODAS   # aprovacoes_mes: qualquer painel do módulo


# Campos de cons_hist_manual / cons_bonus_extra por perfil -> painel necessário
_CAMPO_PAINEL = {
    "vendedor": "vendedor", "dealer": "dealer", "indicador": "indicadores", "projeto": "projeto_especial",
    "gestor": "gestor_operacoes", "diretor": "diretor_adm", "diretorComercial": "diretor_comercial",
}


def _filtrar_valor(chave: str, valor, user, db):
    """Tira do valor os campos de perfis que o usuário não pode ver (totais manuais / bonificação extra)."""
    if chave not in ("cons_hist_manual", "cons_bonus_extra") or not isinstance(valor, dict):
        return valor
    out = {}
    for mes, campos in valor.items():
        if not isinstance(campos, dict):
            continue
        keep = {k: v for k, v in campos.items() if k in _CAMPO_PAINEL and get_permission(user, "can_view_com_" + _CAMPO_PAINEL[k], db)}
        if keep:
            out[mes] = keep
    return out


def _pode_gravar_chave(chave: str, user, db) -> bool:
    if chave == "cons_hist_manual":
        return _pode(user, db, ["importar"])          # lançamento manual de totais = função administrativa
    if chave == "aprovacoes_mes":                     # aprovar/desaprovar mês = ação da Consolidada/Importar
        return _pode(user, db, ["consolidado", "importar"])
    if chave == "cons_bonus_extra":                   # grava o blob inteiro: só quem enxerga os 3
        return all(get_permission(user, "can_view_com_" + a, db) for a in ("gestor_operacoes", "diretor_adm", "diretor_comercial"))
    return _pode(user, db, _areas_da_chave(chave))


_AREAS_EXTRATO = {
    "vendedor": ["vendedor", "importar"],
    "dealer": ["dealer", "importar"],
    "indicador": ["indicadores", "importar"],
    "projeto": ["projeto_especial", "importar"],
}


def _areas_do_ciclo(perfil: str):
    if perfil in ("gestor_operacoes", "diretor_adm", "diretor_comercial"):
        return [perfil, "importar"]
    return _TODAS   # "executivos" (lista de nomes) e afins


def _negar():
    raise HTTPException(status_code=403, detail="Sem permissão para este painel do Comissionamento")


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
def salvar_extrato(data: ExtratoIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _pode(user, db, _AREAS_EXTRATO.get(data.tipo, ["importar"])):
        _negar()
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
    user=Depends(get_current_user),
):
    rows = (
        db.query(ComissaoExtrato)
        .filter(
            ComissaoExtrato.colaborador_id == colaborador_id,
            ComissaoExtrato.mes_referencia == mes_referencia,
        )
        .all()
    )
    return [_out(r) for r in rows if _pode(user, db, _AREAS_EXTRATO.get(r.tipo, ["importar"]))]


@router.get("/extratos/disponiveis")
def extratos_disponiveis(mes_referencia: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Quais extratos já existem no banco pro mês (sem trazer as linhas) — o front usa
    pra manter o botão "Extrair" habilitado depois de um F5, em vez de depender da
    memória da página.
    """
    rows = (
        db.query(ComissaoExtrato.colaborador_id, ComissaoExtrato.aba, ComissaoExtrato.tipo)
        .filter(ComissaoExtrato.mes_referencia == mes_referencia)
        .all()
    )
    return [{"colaborador_id": r.colaborador_id, "aba": r.aba, "tipo": r.tipo}
            for r in rows if _pode(user, db, _AREAS_EXTRATO.get(r.tipo, ["importar"]))]


# ── Estado do sistema (espelho do localStorage) ──────────────────────────
# Chaves de negócio que antes só existiam no navegador de quem usava. Whitelist
# no servidor (prefixos/nomes conhecidos) — o front nunca grava chave arbitrária.
ESTADO_CHAVES = {
    "gs5_v", "gs5_m", "gs5_d", "gs5_f", "gs5_r", "gs5_celulas", "gs5_celula_aliquotas",
    "dp1_m", "dp1_pp", "dp1_projetos", "dp1_dealers", "dp1_rules", "dp1_bl", "dp1_precos",
    "ind1_m", "ind1_rules", "ind1_list",
    "dc1_cfg", "dc1_ext", "dc1_m",
    "da1_cfg", "da1_ext", "da1_m",
    "go1_cfg", "go1_ext", "go1_m",
    "aprovacoes_mes", "cons_hist_manual", "cons_bonus_extra", "imp_clientes_map", "regras_comissao",
}


class EstadoIn(BaseModel):
    # chave -> valor JSON (None = apagar a chave)
    itens: Dict[str, Any]


@router.get("/estado")
def ler_estado(db: Session = Depends(get_db), user=Depends(get_current_user)):
    # só devolve as chaves dos painéis que o usuário pode ver
    rows = [r for r in db.query(ComissaoEstado).all() if _pode(user, db, _areas_da_chave(r.chave))]
    return {
        "itens": {r.chave: _filtrar_valor(r.chave, r.valor, user, db) for r in rows},
        "meta": {r.chave: {"atualizado_em": r.atualizado_em.isoformat() if r.atualizado_em else None,
                           "por": r.atualizado_por} for r in rows},
    }


@router.put("/estado")
def gravar_estado(data: EstadoIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    invalidas = [k for k in data.itens if k not in ESTADO_CHAVES]
    if invalidas:
        raise HTTPException(status_code=400, detail=f"Chave(s) não permitida(s): {', '.join(invalidas)}")
    if any(not _pode_gravar_chave(k, user, db) for k in data.itens):
        _negar()
    for chave, valor in data.itens.items():
        row = db.query(ComissaoEstado).filter(ComissaoEstado.chave == chave).first()
        if valor is None:
            if row:
                db.delete(row)
            continue
        if row:
            row.valor = valor
            row.atualizado_por = user.name
        else:
            db.add(ComissaoEstado(chave=chave, valor=valor, atualizado_por=user.name))
    db.commit()
    return {"ok": True, "gravadas": len(data.itens)}


# ── Planilhas importadas (Vendas/Pedidos e Cancelamentos) ─────────────────
IMPORTACAO_TIPOS = {"pedidos", "cancelamentos"}


class ImportacaoIn(BaseModel):
    tipo:           str
    mes_referencia: str
    arquivo:        Optional[str] = None
    headers:        List[str]
    linhas:         List[List[Any]]


@router.post("/importacoes", status_code=201)
def salvar_importacao(data: ImportacaoIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _pode(user, db, ["importar"]):
        _negar()
    if data.tipo not in IMPORTACAO_TIPOS:
        raise HTTPException(status_code=400, detail="Tipo de importação inválido")
    row = (db.query(ComissaoImportacao)
           .filter(ComissaoImportacao.tipo == data.tipo, ComissaoImportacao.mes_referencia == data.mes_referencia)
           .first())
    if row:
        row.arquivo, row.headers, row.linhas = data.arquivo, data.headers, data.linhas
        row.total_linhas, row.usuario = len(data.linhas), user.name
    else:
        db.add(ComissaoImportacao(tipo=data.tipo, mes_referencia=data.mes_referencia, arquivo=data.arquivo,
                                  headers=data.headers, linhas=data.linhas, total_linhas=len(data.linhas),
                                  usuario=user.name))
    db.commit()
    return {"ok": True, "total_linhas": len(data.linhas)}


@router.get("/importacoes")
def listar_importacoes(mes_referencia: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Lista o que já foi importado (sem as linhas) — histórico de quem importou o quê e quando."""
    if not _pode(user, db, ["importar"]):
        _negar()
    q = db.query(ComissaoImportacao)
    if mes_referencia:
        q = q.filter(ComissaoImportacao.mes_referencia == mes_referencia)
    return [{
        "tipo": r.tipo, "mes_referencia": r.mes_referencia, "arquivo": r.arquivo,
        "total_linhas": r.total_linhas, "usuario": r.usuario,
        "atualizado_em": r.atualizado_em.isoformat() if r.atualizado_em else None,
    } for r in q.order_by(ComissaoImportacao.mes_referencia.desc(), ComissaoImportacao.tipo).all()]


@router.get("/importacoes/{tipo}/{mes_referencia}")
def baixar_importacao(tipo: str, mes_referencia: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _pode(user, db, ["importar"]):
        _negar()
    r = (db.query(ComissaoImportacao)
         .filter(ComissaoImportacao.tipo == tipo, ComissaoImportacao.mes_referencia == mes_referencia).first())
    if not r:
        raise HTTPException(status_code=404, detail="Importação não encontrada")
    return {"tipo": r.tipo, "mes_referencia": r.mes_referencia, "arquivo": r.arquivo,
            "headers": r.headers, "linhas": r.linhas, "usuario": r.usuario,
            "atualizado_em": r.atualizado_em.isoformat() if r.atualizado_em else None}


# ── Ciclo (Diretor Administrativo / Diretor Comercial / Gestor de Operações) ──
# Cada perfil guarda o `mdata` inteiro (todos os meses) como um blob só —
# são poucos campos por mês, não vale a pena uma linha por mês no banco.

class CicloIn(BaseModel):
    perfil: str
    dados:  dict


@router.post("/ciclo", status_code=201)
def salvar_ciclo(data: CicloIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _pode(user, db, _areas_do_ciclo(data.perfil)):
        _negar()
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
def buscar_ciclo(perfil: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not _pode(user, db, _areas_do_ciclo(perfil)):
        _negar()
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
