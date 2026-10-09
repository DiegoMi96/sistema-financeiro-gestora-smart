"""
Aba "Atenção" do Faturamento — regras por cliente que o motor consulta a cada ciclo.

Lê a tabela client_attention e devolve:
  - cancel : ids com cancelamento proporcional (dias = DAY(data do cancelamento))
  - ativ   : ids com ativação proporcional   (dias = total do mês - DAY(ativação) + 1)
  - desconto: {id: [regras de desconto]}     (abatido do total do cliente, com motivo na descrição)

Mesmo formato de id do motor ("ss_" + dígitos) — ver _sanitize_id em billing_engine.
"""
import re

from sqlalchemy.orm import Session

from app.models import ClientAttention, BillingAdjustment, AdjustmentType, User

MOTIVOS = ("ativacao", "cancelamento", "desconto")
MOTIVO_LABEL = {"ativacao": "Ativação", "cancelamento": "Cancelamento", "desconto": "Desconto"}
DESCONTO_TIPOS = ("percentual", "valor")
JUSTIFICATIVA_PREFIXO = "Desconto automático (aba Atenção)"
ANALISTA_AUTO = "Sistema (aba Atenção)"


def norm_id(x) -> str | None:
    """'ss_123', '12.345.678/0001-90' ou '12345678000190' → 'ss_12345678000190'."""
    d = re.sub(r"\D", "", str(x if x is not None else ""))
    return f"ss_{d}" if d else None


def load_attention_rules(db: Session) -> dict:
    cancel: set = set()
    ativ: set = set()
    desconto: dict = {}
    rows = db.query(ClientAttention).all()
    for r in rows:
        cid = norm_id(r.id_smart)
        if not cid:
            continue
        if r.motivo == "cancelamento" and r.proporcional:
            cancel.add(cid)
        elif r.motivo == "ativacao" and r.proporcional:
            ativ.add(cid)
        elif r.motivo == "desconto" and r.desconto_tipo in DESCONTO_TIPOS and (r.desconto_valor or 0) > 0:
            desconto.setdefault(cid, []).append({
                "tipo": r.desconto_tipo,
                "valor": float(r.desconto_valor),
                "obs": (r.obs or "").strip(),
            })
    return {"cancel": cancel, "ativ": ativ, "desconto": desconto, "total": len(rows)}


def calcular_desconto(total: float, regra: dict) -> float:
    """% sobre o total do cliente ou valor fixo (R$); nunca passa do total, nunca negativo."""
    total = round(float(total or 0), 2)
    if total <= 0:
        return 0.0
    if regra["tipo"] == "percentual":
        d = round(total * min(float(regra["valor"]), 100.0) / 100.0, 2)
    else:
        d = round(float(regra["valor"]), 2)
    return round(max(0.0, min(d, total)), 2)


def aplicar_descontos(db: Session, cycle_id: int, created_by_id, summaries: list, desconto_map: dict) -> int:
    """
    Abate o desconto do total_final de cada cliente listado e grava um ajuste
    (tipo DESCONTO) com o motivo na justificativa. Roda ANTES de gravar os
    summaries, na mesma transação do ciclo (se algo falhar, nada fica pela metade).
    """
    if not desconto_map:
        return 0
    if not created_by_id:
        row = db.query(User.id).order_by(User.id).first()
        created_by_id = row[0] if row else None
    n = 0
    for s in summaries:
        regras = desconto_map.get(s.id_smart)
        if not regras:
            continue
        for regra in regras:
            antes = round(float(s.total_final or 0), 2)
            desc = calcular_desconto(antes, regra)
            if desc <= 0:
                continue
            depois = round(antes - desc, 2)
            s.total_ajustes = round(float(s.total_ajustes or 0) - desc, 2)
            s.total_final = depois
            alvo = f"{regra['valor']:g}%" if regra["tipo"] == "percentual" else f"R$ {regra['valor']:.2f}".replace(".", ",")
            texto = f"{JUSTIFICATIVA_PREFIXO} de {alvo}"
            if regra.get("obs"):
                texto += f": {regra['obs']}"
            db.add(BillingAdjustment(
                cycle_id=cycle_id,
                id_smart=s.id_smart,
                type=AdjustmentType.DESCONTO,
                component="total",
                valor_original=antes,
                valor_ajustado=depois,
                valor_diferenca=-desc,
                justificativa=texto,
                observacao=regra.get("obs") or None,
                analista=ANALISTA_AUTO,
                ofensor="Comercial",
                created_by_id=created_by_id,
                requires_approval=False,
            ))
            n += 1
    return n
