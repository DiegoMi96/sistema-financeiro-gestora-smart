"""
Retenção do extrato de Comissionamento — 1 ano.

Depois de 1 ano, o extrato pós-cálculo (comissao_extratos) é exportado pra um
.xlsx idêntico ao que o colaborador já baixa hoje (uma aba por categoria: Simcard,
Placas, Vendas, Cancelamento — ver `app/routers/comissionamento.py` e o
`exportVendedor`/`exportEntity` do front) e apagado do banco ativo. Mesmo padrão
de "loop + lock consultivo" do `asaas_sync.py` — 2 workers do Uvicorn não podem
rodar a retenção ao mesmo tempo.
"""
import asyncio
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from openpyxl import Workbook
from sqlalchemy import text

from app.database import SessionLocal
from app.models.comissionamento import ComissaoExtrato

RETENTION_INTERVAL = 60 * 60 * 24   # 1x por dia
RETENTION_DAYS      = 365
ARCHIVE_DIR         = "/opt/gestora-smart/comissionamento/arquivados"
_RETENTION_LOCK_KEY = 727273   # diferente do lock do asaas_sync (727272)

# Nome de exibição de cada aba no .xlsx arquivado — "aba" é a mesma chave que
# o front já usa em impSetRaw (ver vendedor.html/dealer.html/indicadores.html/
# projeto_especial.html); o nome de exibição segue a planilha real do Johnny.
_ABA_SHEET_NAME = {
    "simcard":      "Simcard",
    "gps":          "Placas",       # Smart GPS — nome real da aba na planilha
    "equip":        "Equipamento",
    "vendas":       "Vendas",
    "cancelamento": "Cancelamento",
}


def _montar_xlsx(colaborador_nome: str, extratos: list[ComissaoExtrato], destino: str) -> None:
    wb = Workbook()
    wb.remove(wb.active)   # a sheet default vazia — cada extrato vira sua própria aba
    for e in extratos:
        ws = wb.create_sheet(_ABA_SHEET_NAME.get(e.aba, e.aba)[:31])
        ws.append(e.headers)
        for linha in e.linhas:
            ws.append(linha)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    wb.save(destino)


def run_retention() -> dict:
    db = SessionLocal()
    got_lock = False
    try:
        got_lock = bool(db.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": _RETENTION_LOCK_KEY}
        ).scalar())
        if not got_lock:
            return {"status": "skipped", "reason": "retenção já em execução em outro worker"}

        limite = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
        antigos = (
            db.query(ComissaoExtrato)
            .filter(ComissaoExtrato.criado_em < limite)
            .all()
        )
        if not antigos:
            return {"status": "ok", "arquivados": 0}

        # Agrupa por colaborador+mês pra gerar 1 arquivo com todas as abas,
        # igual ao que exportVendedor/exportEntity fazem hoje no navegador.
        grupos: dict[tuple, list[ComissaoExtrato]] = defaultdict(list)
        for e in antigos:
            grupos[(e.colaborador_id, e.mes_referencia, e.colaborador_nome)].append(e)

        arquivados = 0
        for (colaborador_id, mes_referencia, colaborador_nome), extratos in grupos.items():
            ano = mes_referencia.split("-")[0]
            nome_limpo = "".join(c if c.isalnum() else "_" for c in colaborador_nome).strip("_")
            destino = os.path.join(ARCHIVE_DIR, ano, f"{nome_limpo}_{mes_referencia}.xlsx")
            _montar_xlsx(colaborador_nome, extratos, destino)
            for e in extratos:
                db.delete(e)
            arquivados += len(extratos)

        db.commit()
        return {"status": "ok", "arquivados": arquivados, "grupos": len(grupos)}
    finally:
        if got_lock:
            db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _RETENTION_LOCK_KEY})
        db.close()


async def retention_loop():
    """Roda run_retention() imediatamente e depois a cada RETENTION_INTERVAL segundos."""
    while True:
        try:
            run_retention()
        except Exception as e:
            print(f"❌ comissionamento retention_loop erro inesperado: {e}")
        await asyncio.sleep(RETENTION_INTERVAL)
