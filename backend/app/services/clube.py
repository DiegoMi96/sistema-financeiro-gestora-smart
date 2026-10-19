"""
Clube Smart — regras que mexem no faturamento (motor).

  1. Frete de SIM card ("Software" na planilha de frete): 20% de desconto, limitado a R$ 100 por frete.
  2. Excedente de MB e multa de cancelamento: parcelados automaticamente em 3x quando o total do
     cliente (por tipo) é >= R$ 10. A parcela 1 vai no ciclo da dívida; as demais nos ciclos seguintes.
     Se o cliente fica sem nenhuma linha viva, o saldo pendente é cobrado inteiro (última cobrança).
  3. Mensalidade do Clube (R$ 9,90): linha "Clube Smart" com valor 0 até o ciclo da 1ª cobrança.

Cliente marcado na aba Atenção como "Sem Clube Smart" não recebe nenhum benefício novo
(desconto de frete, novos parcelamentos) nem a linha do Clube. Parcelas já criadas continuam.

Valores-padrão ficam aqui; podem ser trocados em system_settings (chaves clube_*), sem deploy.
"""
import math
from sqlalchemy import text as _text
from sqlalchemy.orm import Session

from app.models import BillingInstallment

STATUS_CLUBE = "Clube Smart"
STATUS_DESC_FRETE = "Desconto Frete Clube Smart"
STATUS_PARCELA = {"excedente": "Parcela Excedente", "multa": "Parcela Multa"}
STATUS_PARCELAS = tuple(STATUS_PARCELA.values())

_MESES = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

_DEFAULTS = {
    "clube_valor": 9.90,
    "clube_primeira_cobranca": "2027-02",   # ciclo (AAAA-MM) da 1ª fatura com cobrança; vence no mês seguinte
    "clube_frete_pct": 20.0,
    "clube_frete_limite": 100.0,
    "clube_parcelas": 3,
    "clube_parcela_minimo": 10.0,
}


def carregar_config(db: Session) -> dict:
    cfg = dict(_DEFAULTS)
    try:
        rows = db.execute(_text("SELECT key, value FROM system_settings WHERE key = ANY(:ks)"),
                          {"ks": list(_DEFAULTS.keys())}).fetchall()
    except Exception:
        return cfg
    for k, v in rows:
        if k not in cfg or v is None or str(v).strip() == "":
            continue
        try:
            if k == "clube_primeira_cobranca":
                a, m = str(v).strip().split("-")[:2]
                cfg[k] = f"{int(a):04d}-{int(m):02d}"
            elif k == "clube_parcelas":
                cfg[k] = max(1, int(float(str(v).replace(",", "."))))
            else:
                cfg[k] = float(str(v).replace(",", "."))
        except (ValueError, TypeError):
            pass
    return cfg


# ── helpers ────────────────────────────────────────────────────────────────────

def brl(v: float) -> str:
    return "R$ " + f"{float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def mes_label(ano: int, mes: int) -> str:
    return f"{_MESES[mes]}/{str(ano)[-2:]}"


def soma_meses(ano: int, mes: int, k: int) -> tuple:
    t = ano * 12 + (mes - 1) + k
    return t // 12, t % 12 + 1


def dividir(total: float, n: int) -> list:
    """n parcelas em centavos; a última absorve a diferença (soma sempre fecha)."""
    total = round(float(total), 2)
    base = round(total / n, 2)
    parcelas = [base] * (n - 1)
    parcelas.append(round(total - sum(parcelas), 2))
    return parcelas


def mensalidade_clube(year: int, month: int, cfg: dict) -> float:
    a, m = cfg["clube_primeira_cobranca"].split("-")
    return round(float(cfg["clube_valor"]), 2) if (year, month) >= (int(a), int(m)) else 0.0


def desconto_frete(valor: float, cfg: dict) -> float:
    """pct% do frete, limitado a clube_frete_limite por frete."""
    d = round(float(valor or 0) * float(cfg["clube_frete_pct"]) / 100.0, 2)
    return round(max(0.0, min(d, float(cfg["clube_frete_limite"]))), 2)


def eh_software(categoria) -> bool:
    c = str(categoria or "").strip().lower()
    return c == "software"


# ── parcelamento ───────────────────────────────────────────────────────────────

def liberar_ciclo(db: Session, year: int, month: int) -> None:
    """Desfaz o efeito de um processamento anterior do ciclo (reprocessar/excluir):
    parcelas cobradas aqui voltam a pendente; planos nascidos aqui são apagados
    (exceto se alguma parcela já foi cobrada em outro ciclo)."""
    # Não dá pra refazer este ciclo se parcelas dos planos nascidos nele já foram cobradas num ciclo
    # posterior — duplicaria/perderia parcelas. Antes, exclua/reprocesse o ciclo posterior.
    posterior = db.execute(_text("""
        SELECT cobrada_ano, cobrada_mes FROM billing_installments
         WHERE origem_ano = :a AND origem_mes = :m
           AND cobrada_ano IS NOT NULL AND (cobrada_ano, cobrada_mes) > (:a, :m)
         ORDER BY cobrada_ano, cobrada_mes LIMIT 1
    """), {"a": year, "m": month}).fetchone()
    if posterior:
        raise ValueError(
            f"Parcelamento do Clube Smart: este ciclo tem parcelas já cobradas em {posterior[1]:02d}/{posterior[0]}. "
            f"Exclua ou reprocesse primeiro o ciclo de {posterior[1]:02d}/{posterior[0]}.")
    db.execute(_text("""
        UPDATE billing_installments
           SET status = 'pendente', cobrada_ano = NULL, cobrada_mes = NULL
         WHERE cobrada_ano = :a AND cobrada_mes = :m
    """), {"a": year, "m": month})
    db.execute(_text("""
        DELETE FROM billing_installments
         WHERE origem_ano = :a AND origem_mes = :m
           AND plano NOT IN (SELECT plano FROM billing_installments
                              WHERE status <> 'pendente'
                                AND origem_ano = :a AND origem_mes = :m)
    """), {"a": year, "m": month})


def _texto(parcela: int, total: int, obs: str, antecipada: bool) -> str:
    t = f"Parcela {parcela}/{total} – {obs}"
    return t + " – saldo antecipado (cancelamento total)" if antecipada else t


def planejar(db: Session, year: int, month: int, cfg: dict, *,
             exc: dict, multa: dict, mb_exc: dict, qtd_multa: dict,
             vivos: set, sem_clube: set) -> dict:
    """
    Decide parcelamentos do ciclo, grava as parcelas (billing_installments) e devolve:
      exc_final / multa_final : {id: valor cobrado no ciclo} (substituem os apurados)
      zerar_exc / zerar_multa : ids cujas linhas de origem não entram no total (valor apurado só informativo)
      linhas                  : [{id_smart, tipo, texto, valor}] — linhas de parcela do ciclo
      n_planos / n_carregadas / n_antecipadas
    """
    N = int(cfg["clube_parcelas"])
    minimo = float(cfg["clube_parcela_minimo"])
    exc_final = dict(exc)
    multa_final = dict(multa)
    zerar = {"excedente": set(), "multa": set()}
    linhas: list = []
    novas: list = []

    apurado = {"excedente": exc, "multa": multa}
    finais = {"excedente": exc_final, "multa": multa_final}

    # 1) dívidas novas do ciclo → plano em N parcelas
    for tipo in ("excedente", "multa"):
        for cli, valor in apurado[tipo].items():
            total = round(float(valor or 0), 2)
            if total < minimo or cli not in vivos or cli in sem_clube:
                continue
            if tipo == "excedente":
                mb_txt = f"{round(mb_exc.get(cli, 0)):,}".replace(",", ".")
                obs = f"MB total {mb_txt} – Consumo {mes_label(year, month)} – Total {brl(total)}"
            else:
                q = int(qtd_multa.get(cli, 0))
                obs = f"Multa total {brl(total)} – {q} {'linha' if q == 1 else 'linhas'} – Cancelamento {mes_label(year, month)}"
            plano = f"{cli}|{tipo}|{year}-{month:02d}"
            for i, v in enumerate(dividir(total, N), 1):
                due = soma_meses(year, month, i - 1)
                novas.append(BillingInstallment(
                    plano=plano, id_smart=cli, tipo=tipo, origem_ano=year, origem_mes=month,
                    parcela=i, total_parcelas=N, due_ano=due[0], due_mes=due[1],
                    valor=v, valor_total=total, obs=obs[:300],
                    status="cobrada" if i == 1 else "pendente",
                    cobrada_ano=year if i == 1 else None, cobrada_mes=month if i == 1 else None,
                ))
                if i == 1:
                    finais[tipo][cli] = v
                    linhas.append({"id_smart": cli, "tipo": tipo, "valor": v,
                                   "texto": _texto(1, N, obs, False)})
            zerar[tipo].add(cli)

    n_planos = len(novas) // N if N else 0

    # 2) parcelas de ciclos anteriores: vencidas até este ciclo; se o cliente não tem mais linha viva,
    #    o saldo inteiro entra agora (última cobrança)
    pend = db.query(BillingInstallment).filter(BillingInstallment.status == "pendente").all()
    n_carr = n_ant = 0
    for p in pend:
        if (p.origem_ano, p.origem_mes) >= (year, month):
            continue
        vencida = (p.due_ano, p.due_mes) <= (year, month)
        if not vencida and p.id_smart in vivos:
            continue
        antecipada = not vencida
        p.status = "antecipada" if antecipada else "cobrada"
        p.cobrada_ano, p.cobrada_mes = year, month
        tipo_fin = finais[p.tipo]
        tipo_fin[p.id_smart] = round(float(tipo_fin.get(p.id_smart, 0) or 0) + float(p.valor), 6)
        linhas.append({"id_smart": p.id_smart, "tipo": p.tipo, "valor": float(p.valor),
                       "texto": _texto(p.parcela, p.total_parcelas, p.obs or "", antecipada)})
        n_ant += 1 if antecipada else 0
        n_carr += 0 if antecipada else 1

    if novas:
        db.add_all(novas)
    db.flush()
    return {"exc_final": exc_final, "multa_final": multa_final,
            "zerar_exc": zerar["excedente"], "zerar_multa": zerar["multa"],
            "linhas": linhas, "n_planos": n_planos, "n_carregadas": n_carr, "n_antecipadas": n_ant}
