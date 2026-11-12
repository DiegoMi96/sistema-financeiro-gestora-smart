"""
Fechamento automático do Comissionamento dos analistas de contas a receber.

Pedido do Diego (12/11/2026), depois de outubro/2026 ter sido perdido (a
sincronização do Asaas acabou sobrescrevendo o vencimento original de boletos
renegociados, derrubando o faturado/recebido de um mês já encerrado): a partir
de agora, todo dia 28 o sistema trava de vez (congela) o faturado/recebido dos
4 vencimentos (10/15/20/25) do mês corrente, usando o que o banco tiver até
ali. Da em diante, a tela de Comissionamento (GET /analyst-commission) passa a
ler só esse congelamento pra aquele mês — nunca mais recalcula, então nenhuma
mudança futura na sincronização (boleto perdido, remarcado, etc.) pode alterar
um mês já fechado.

Mesmo padrão de "loop + lock consultivo" do asaas_sync.py/comissionamento_retention.py
— 2 workers do Uvicorn não podem fechar o mesmo mês ao mesmo tempo.
"""
import asyncio
from datetime import date, timedelta, timezone, datetime
from collections import defaultdict

from sqlalchemy import text

from app.database import SessionLocal
from app.models import AnalystCommissionSnapshot, AnalystCommissionSnapshotBoleto

FREEZE_INTERVAL = 60 * 60 * 6     # a cada 6h — barato, e pega o dia 28 assim que ele chegar
DIA_FECHAMENTO  = 28
_FREEZE_LOCK_KEY = 727274          # diferente do asaas_sync (727272) e da retenção (727273)


def _mes_a_fechar(hoje: date) -> tuple[int, int] | None:
    """Mês/ano a fechar hoje, ou None se ainda não chegou no dia de fechamento
    deste mês. Fecha o PRÓPRIO mês corrente (ex.: 28/11 fecha novembro — os 4
    vencimentos de novembro já tiveram a janela de pagamento encerrada a essa
    altura, inclusive o dia 25 com a folga até 26/27)."""
    if hoje.day < DIA_FECHAMENTO:
        return None
    return (hoje.year, hoje.month)


def fechar_mes(year: int, month: int, db=None) -> dict:
    """Congela o mês (idempotente — não refaz se já tiver sido fechado).
    Pode ser chamado manualmente (ex.: endpoint de admin) além do loop."""
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        ja_fechado = db.query(AnalystCommissionSnapshot.id).filter_by(year=year, month=month).first()
        if ja_fechado:
            return {"status": "skipped", "reason": "mês já fechado"}

        # Import local pra evitar ciclo de import (analyst_commission importa modelos
        # que este módulo também usa).
        from app.routers.analyst_commission import _boletos_detalhados, DIAS

        linhas = _boletos_detalhados(db, year, month)
        if not linhas:
            return {"status": "skipped", "reason": "sem boleto nenhum nesse mês — nada pra fechar"}

        agg = {d: {"clientes": set(), "boletos": 0, "pagos": 0, "faturado": 0.0, "recebido": 0.0,
                   "recebido_itau": 0.0, "boletos_itau": 0, "venc": None} for d in DIAS}
        for l in linhas:
            v = l["vencimento"]
            dia = v.day if v else None
            if dia not in DIAS:
                continue
            a = agg[dia]
            if l["tipo"] == "faturado":
                a["clientes"].add(l["documento"])
                a["faturado"] += float(l["valor"] or 0)
                if a["venc"] is None:
                    a["venc"] = v
            else:
                a["boletos"] += 1
                a["pagos"] += 1
                a["recebido"] += float(l["valor"] or 0)
                if l["banco"] == "Itaú":
                    a["recebido_itau"] += float(l["valor"] or 0)
                    a["boletos_itau"] += 1
                if a["venc"] is None:
                    a["venc"] = v

        criados = 0
        for dia in DIAS:
            a = agg[dia]
            if not a["clientes"] and not a["boletos"]:
                continue
            snap = AnalystCommissionSnapshot(
                year=year, month=month, dia=dia,
                clientes=len(a["clientes"]), boletos=a["boletos"], pagos=a["pagos"],
                faturado=round(a["faturado"], 2), recebido=round(a["recebido"], 2),
                recebido_itau=round(a["recebido_itau"], 2), boletos_itau=a["boletos_itau"],
                vencimento_original=a["venc"],
            )
            db.add(snap)
            db.flush()  # pra pegar snap.id antes de gravar o detalhe
            for l in linhas:
                v = l["vencimento"]
                if (v.day if v else None) != dia:
                    continue
                db.add(AnalystCommissionSnapshotBoleto(
                    snapshot_id=snap.id, tipo=l["tipo"], nome=l["nome"], documento=l["documento"],
                    banco=l["banco"], vencimento=v, valor=l["valor"] or 0,
                    status=l["status"], data_pagamento=l["data_pagamento"],
                ))
            criados += 1
        db.commit()
        print(f"🔒 Comissionamento analistas: {month:02d}/{year} fechado — {criados} vencimento(s) congelado(s)", flush=True)
        return {"status": "ok", "vencimentos_fechados": criados}
    except Exception as e:
        db.rollback()
        print(f"❌ Fechamento do Comissionamento analistas falhou ({year}-{month:02d}): {e}", flush=True)
        return {"status": "error", "error": str(e)}
    finally:
        if own_session:
            db.close()


def run_freeze_check() -> dict:
    db = SessionLocal()
    got_lock = False
    try:
        got_lock = bool(db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _FREEZE_LOCK_KEY}).scalar())
        if not got_lock:
            return {"status": "skipped", "reason": "fechamento já em execução em outro worker"}
        alvo = _mes_a_fechar(date.today())
        if not alvo:
            return {"status": "skipped", "reason": "ainda não chegou o dia de fechamento deste mês"}
        return fechar_mes(alvo[0], alvo[1], db=db)
    finally:
        if got_lock:
            try:
                db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _FREEZE_LOCK_KEY})
                db.commit()
            except Exception:
                pass
        db.close()


async def freeze_loop():
    """Roda run_freeze_check() imediatamente e depois a cada FREEZE_INTERVAL segundos."""
    while True:
        try:
            run_freeze_check()
        except Exception as e:
            print(f"❌ freeze_loop erro inesperado: {e}", flush=True)
        await asyncio.sleep(FREEZE_INTERVAL)
