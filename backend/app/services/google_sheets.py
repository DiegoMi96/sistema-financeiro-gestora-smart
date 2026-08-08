"""
Serviço de integração com Google Sheets — Indicadores Mensais 2026.
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

SHEET_INDICADORES = "INDICADORES MENSAIS 2026"
SHEET_OPERADORAS  = "DETALHAMENTO POR OPERADORA 2026"

CHAVE_SHEET: dict[str, str] = {
    **{k: SHEET_INDICADORES for k in [
        "Base_Ativa", "Base_Pre", "Base_Susp", "Base_SW",
        "Vendas_SIM", "Vendas_EQ", "Novos_CLI", "Cancelam", "Desistencia", "Atv_Qtd",
        "RH_CLT", "RH_PJ", "RH_Folha", "RH_Salario", "RH_Faltas", "RH_Rescisao",
        "RH_Deslig", "RH_Afasta",
        "RH_D_Comerc", "RH_D_Oper", "RH_D_TI", "RH_D_Log", "RH_D_Dev",
        "RH_D_Admin", "RH_D_Mkt", "RH_D_Fin", "RH_D_Fac", "RH_D_Sup",
        "RH_D_Dir", "RH_D_Cons",
        "Vol_Envio", "Custo_Envio", "Tickets", "Satisfacao",
    ]},
    **{k: SHEET_OPERADORAS for k in [
        "OP_ALGAR_MENS",   "OP_ALGAR_M_MENS",  "OP_ARQIA_MENS",    "OP_ARQIA_2_MENS",
        "OP_ARQIA_I_MENS", "OP_CLARO_MENS",    "OP_CLARO_BL_MENS", "OP_CLARO_C_MENS",
        "OP_SIERRA_MENS",  "OP_TIM_MENS",      "OP_VIVO_MENS",     "OP_VIVO_BL_MENS",
        "OP_VIVO_C_MENS",
        "OP_ALGAR_CUSTO",   "OP_ALGAR_M_CUSTO",  "OP_ARQIA_CUSTO",    "OP_ARQIA_2_CUSTO",
        "OP_ARQIA_I_CUSTO", "OP_CLARO_CUSTO",    "OP_CLARO_BL_CUSTO", "OP_CLARO_C_CUSTO",
        "OP_SIERRA_CUSTO",  "OP_TIM_CUSTO",      "OP_VIVO_CUSTO",     "OP_VIVO_BL_CUSTO",
        "OP_VIVO_C_CUSTO",
        "POOL_VIVO_PCT", "POOL_TIM_PCT", "POOL_ALGAR_M_PCT", "POOL_ALGAR_O_PCT", "POOL_ARQIA_PCT",
        "OP_ALGAR_QTD",   "OP_ALGAR_M_QTD",  "OP_ARQIA_QTD",    "OP_ARQIA_2_QTD",
        "OP_ARQIA_I_QTD", "OP_CLARO_QTD",    "OP_CLARO_BL_QTD", "OP_CLARO_C_QTD",
        "OP_SIERRA_QTD",  "OP_TIM_QTD",      "OP_VIVO_QTD",     "OP_VIVO_BL_QTD", "OP_VIVO_C_QTD",
    ]},
}


def _parse_br(val: str) -> Optional[float]:
    if not val or str(val).strip() in ("-", "TRUE", "FALSE", ""):
        return None
    try:
        return float(str(val).strip().replace(".", "").replace(",", "."))
    except (ValueError, TypeError):
        return None


def _month_col(month: int) -> int:
    """month 1–12 → 1-based column (Jan=3 = column C)."""
    return month + 2


def _get_client(service_account_json: str):
    import gspread
    from google.oauth2.service_account import Credentials
    creds = Credentials.from_service_account_info(
        json.loads(service_account_json),
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    return gspread.authorize(creds)


def _row_index(worksheet) -> dict[str, int]:
    """Returns {chave: row_number (1-based)} reading column A."""
    index: dict[str, int] = {}
    for i, val in enumerate(worksheet.col_values(1)):
        v = str(val).strip()
        if v and not v.startswith(("►", "Chave")):
            index[v] = i + 1
    return index


def read_tab_csv(spreadsheet_id: str, service_account_json: str, tab: str) -> str:
    """Lê uma aba inteira e devolve CSV — equivalente ao /api/sync do server.js
    legado (valueRenderOption=UNFORMATTED_VALUE). Mesma escapagem de célula:
    envolve em aspas se tiver vírgula/aspas/quebra de linha e duplica aspas."""
    client   = _get_client(service_account_json)
    workbook = client.open_by_key(spreadsheet_id)
    ws       = workbook.worksheet(tab)
    try:
        values = ws.get_all_values(value_render_option="UNFORMATTED_VALUE")
    except TypeError:
        # gspread mais antigo não aceita o kwarg
        values = ws.get_all_values()

    def _cell(v) -> str:
        if v is None:
            return ""
        if isinstance(v, bool):
            return "true" if v else "false"  # igual ao String(true) do JS legado
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
        return str(v)

    lines = []
    for row in values:
        cells = [_cell(v) for v in row]
        # Corta células vazias do FIM da linha — o Google Sheets API (usada pelo
        # server.js legado) não devolve trailing empties; o gspread preenche.
        # Sem isso a planilha vem com vírgulas sobrando no fim de cada linha.
        while cells and cells[-1] == "":
            cells.pop()
        out = []
        for s in cells:
            if ("," in s) or ('"' in s) or ("\n" in s):
                s = '"' + s.replace('"', '""') + '"'
            out.append(s)
        lines.append(",".join(out))
    return "\n".join(lines)


def read_month(
    spreadsheet_id: str,
    service_account_json: str,
    month: int,
    year: int,
) -> dict[str, Optional[float]]:
    """Read all known indicators for a given month from both sheets."""
    client   = _get_client(service_account_json)
    workbook = client.open_by_key(spreadsheet_id)
    col      = _month_col(month)
    result: dict[str, Optional[float]] = {}

    for sheet_name in (SHEET_INDICADORES, SHEET_OPERADORAS):
        try:
            ws       = workbook.worksheet(sheet_name)
            all_rows = ws.get_all_values()
            idx      = _row_index(ws)
            for chave, row_num in idx.items():
                row_data = all_rows[row_num - 1] if row_num <= len(all_rows) else []
                raw      = row_data[col - 1] if col - 1 < len(row_data) else ""
                result[chave] = _parse_br(raw)
        except Exception as exc:
            logger.warning("Erro ao ler '%s': %s", sheet_name, exc)

    return result


def write_values(
    spreadsheet_id: str,
    service_account_json: str,
    updates: dict[str, Optional[float]],
    month: int,
) -> dict[str, bool]:
    """Write multiple indicator values. Groups by sheet to minimise API calls."""
    import gspread

    client   = _get_client(service_account_json)
    workbook = client.open_by_key(spreadsheet_id)
    col      = _month_col(month)

    by_sheet: dict[str, dict[str, Optional[float]]] = {}
    for chave, val in updates.items():
        sheet_name = CHAVE_SHEET.get(chave)
        if sheet_name:
            by_sheet.setdefault(sheet_name, {})[chave] = val

    status: dict[str, bool] = {}

    for sheet_name, chave_vals in by_sheet.items():
        try:
            ws  = workbook.worksheet(sheet_name)
            idx = _row_index(ws)

            cell_list = []
            for chave, val in chave_vals.items():
                row_num = idx.get(chave)
                if row_num is None:
                    status[chave] = False
                    continue
                cell = ws.cell(row_num, col)
                cell.value = val if val is not None else ""
                cell_list.append(cell)
                status[chave] = True

            if cell_list:
                ws.update_cells(cell_list, value_input_option="RAW")
        except Exception as exc:
            logger.error("Erro ao escrever em '%s': %s", sheet_name, exc)
            for chave in chave_vals:
                status.setdefault(chave, False)

    return status
