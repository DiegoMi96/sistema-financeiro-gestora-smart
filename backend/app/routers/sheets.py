"""
Router: /sheets — Indicadores Mensais + integração Google Sheets
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Header
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json, logging

from app.database import get_db
from app.models import SheetIndicator
from app.routers.auth import get_current_user
from app.routers.settings import SystemSetting
from app.core.permissions import get_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sheets", tags=["Indicadores / Planilha"])


# ─────────────────────────────────────────────
# Helpers de configuração (armazenadas em system_settings)
# ─────────────────────────────────────────────

def _get_setting(db: Session, key: str) -> Optional[str]:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return row.value if row else None


def _set_setting(db: Session, key: str, value: str):
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = value
    else:
        row = SystemSetting(key=key, value=value)
        db.add(row)
    db.commit()


def _get_sheets_config(db: Session):
    spreadsheet_id    = _get_setting(db, "sheets_spreadsheet_id") or ""
    service_account    = _get_setting(db, "sheets_service_account") or ""
    return spreadsheet_id, service_account


# ─────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────

class SheetConfigBody(BaseModel):
    spreadsheet_id: str
    service_account_json: Optional[str] = None  # None = manter o que está


class SaveIndicatorsBody(BaseModel):
    year: int
    month: int   # 1–12
    updates: dict[str, Optional[float]]


# ─────────────────────────────────────────────
# Background: push para Google Sheets sem bloquear a resposta
# ─────────────────────────────────────────────

def _push_to_sheet(updates: dict[str, Optional[float]], month: int, spreadsheet_id: str, sa_json: str):
    if not spreadsheet_id or not sa_json:
        return
    try:
        from app.services.google_sheets import write_values
        write_values(spreadsheet_id, sa_json, updates, month)
    except Exception as e:
        logger.error("Erro ao sincronizar com Google Sheets: %s", e)


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.get("/config")
def get_config(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_view_controladoria", db):
        raise HTTPException(403, "Sem permissão")
    sid = _get_setting(db, "sheets_spreadsheet_id") or ""
    has_sa = bool(_get_setting(db, "sheets_service_account"))
    return {"spreadsheet_id": sid, "has_service_account": has_sa}


@router.put("/config")
def save_config(
    body: SheetConfigBody,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_manage_users", db):
        raise HTTPException(403, "Apenas administradores podem configurar a planilha")
    _set_setting(db, "sheets_spreadsheet_id", body.spreadsheet_id.strip())
    if body.service_account_json and body.service_account_json.strip():
        # Valida o JSON
        try:
            json.loads(body.service_account_json)
        except json.JSONDecodeError:
            raise HTTPException(400, "JSON da service account inválido")
        _set_setting(db, "sheets_service_account", body.service_account_json.strip())
    return {"ok": True}


@router.get("/sync")
def sync_tab(
    tab: str,
    x_api_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Devolve o CSV de uma aba da planilha — substitui o /api/sync do server.js
    legado (porta 3000). Autenticação por x-api-key (mesmo header que o HTML da
    Controladoria já envia), validada contra 'sheets_sync_api_key' em settings.
    Aditivo: nada é servido por aqui até o nginx repontar /api/sync -> :8000."""
    expected = _get_setting(db, "sheets_sync_api_key")
    if not expected or x_api_key != expected:
        raise HTTPException(401, "Não autorizado")
    sid, sa = _get_sheets_config(db)
    if not sid or not sa:
        raise HTTPException(503, "Planilha não configurada")
    from app.services.google_sheets import read_tab_csv
    try:
        csv = read_tab_csv(sid, sa, tab)
    except Exception as e:
        logger.error("Erro ao sincronizar aba '%s': %s", tab, e)
        raise HTTPException(502, f"Erro ao ler a planilha: {e}")
    return PlainTextResponse(csv, media_type="text/csv; charset=utf-8")


@router.post("/cache/clear")
def cache_clear(
    x_api_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Compat com o /api/cache/clear do legado. Como o /sync sempre lê fresco,
    não há cache a limpar — retorna ok para o HTML seguir o fluxo."""
    expected = _get_setting(db, "sheets_sync_api_key")
    if not expected or x_api_key != expected:
        raise HTTPException(401, "Não autorizado")
    return {"ok": True}


@router.get("/indicators")
def get_indicators(
    year: int,
    month: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_view_controladoria", db):
        raise HTTPException(403, "Sem permissão")
    rows = (
        db.query(SheetIndicator)
        .filter(SheetIndicator.year == year, SheetIndicator.month == month)
        .all()
    )
    return {
        "year": year,
        "month": month,
        "data": {r.chave: r.value for r in rows},
        "sources": {r.chave: r.source for r in rows},
    }


@router.put("/indicators")
def save_indicators(
    body: SaveIndicatorsBody,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not get_permission(current_user, "can_view_controladoria", db):
        raise HTTPException(403, "Sem permissão")
    if not (1 <= body.month <= 12):
        raise HTTPException(400, "Mês inválido")

    # Upsert no banco
    for chave, value in body.updates.items():
        existing = (
            db.query(SheetIndicator)
            .filter(
                SheetIndicator.chave == chave,
                SheetIndicator.year == body.year,
                SheetIndicator.month == body.month,
            )
            .first()
        )
        if existing:
            existing.value = value
            existing.source = "system"
            existing.updated_at = datetime.utcnow()
        else:
            db.add(SheetIndicator(
                chave=chave, year=body.year, month=body.month,
                value=value, source="system",
            ))
    db.commit()

    # Push assíncrono para Google Sheets
    sid, sa = _get_sheets_config(db)
    if sid and sa:
        background_tasks.add_task(_push_to_sheet, body.updates, body.month, sid, sa)

    return {"ok": True, "saved": len(body.updates)}


@router.post("/import")
def import_from_sheet(
    year: int,
    month: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Importa dados do Google Sheets → banco. Não sobrescreve edições do sistema feitas depois."""
    if not get_permission(current_user, "can_manage_users", db):
        raise HTTPException(403, "Apenas administradores podem importar da planilha")

    sid, sa = _get_sheets_config(db)
    if not sid or not sa:
        raise HTTPException(400, "Planilha não configurada. Vá em Configurações › Planilha.")

    try:
        from app.services.google_sheets import read_month
        sheet_data = read_month(sid, sa, month, year)
    except Exception as e:
        raise HTTPException(500, f"Erro ao conectar ao Google Sheets: {e}")

    updated = 0
    for chave, value in sheet_data.items():
        if value is None:
            continue
        existing = (
            db.query(SheetIndicator)
            .filter(
                SheetIndicator.chave == chave,
                SheetIndicator.year == year,
                SheetIndicator.month == month,
            )
            .first()
        )
        if existing:
            # Só importa se a planilha é a fonte mais recente ou não existe edição do sistema
            if existing.source == "sheet":
                existing.value = value
                existing.updated_at = datetime.utcnow()
                updated += 1
            # Se source=="system", a edição do sistema vence — não sobrescreve
        else:
            db.add(SheetIndicator(
                chave=chave, year=year, month=month, value=value, source="sheet",
            ))
            updated += 1
    db.commit()
    return {"ok": True, "imported": updated, "total_in_sheet": len(sheet_data)}


@router.post("/test-connection")
def test_connection(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Testa a conexão com o Google Sheets e retorna os nomes das abas."""
    if not get_permission(current_user, "can_manage_users", db):
        raise HTTPException(403, "Apenas administradores")
    sid, sa = _get_sheets_config(db)
    if not sid or not sa:
        raise HTTPException(400, "Planilha não configurada")
    try:
        import gspread
        from app.services.google_sheets import _get_client
        client = _get_client(sa)
        workbook = client.open_by_key(sid)
        sheets = [ws.title for ws in workbook.worksheets()]
        return {"ok": True, "title": workbook.title, "sheets": sheets}
    except Exception as e:
        raise HTTPException(500, f"Erro de conexão: {e}")
