"""
Router: Previsibilidade Comportamental
Lê do banco local (asaas_payments_sync + itau_boletos) — sem chamadas em tempo real ao Asaas.

06/10/2026 — o comportamento de pagamento agora é por CNPJ/CPF, SEM IMPORTAR O BANCO:
quando o emissor dos boletos mudou (mais de 200 boletos, R$ 1,77 mi, foram pro Itaú), a
previsão antiga (só Asaas, agrupada por customer_id) simplesmente perdeu esses boletos e
não conseguia usar o histórico deles. Agora o histórico do Asaas e do Itaú se junta pelo
CNPJ do pagador, e as cobranças em aberto dos dois bancos entram na previsão.
"""
import io
import math
import re
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/previsibilidade", tags=["Previsibilidade"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def _score(avg_dias: float) -> tuple[str, str]:
    if avg_dias >= 0:
        return "A", "A – Baixo risco"
    if avg_dias >= -5:
        return "B", "B – Médio risco"
    return "C", "C – Alto risco"


def _previsao_padrao(avg_dias: float) -> str:
    if avg_dias > 0:
        return "Paga antes do vencimento"
    if avg_dias == 0:
        return "Paga no vencimento"
    return f"Atrasa em média {abs(int(round(avg_dias)))} dias"


def _std(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    return math.sqrt(variance)


def _fmt_cnpj(raw: str) -> str:
    d = (raw or "").replace(".", "").replace("/", "").replace("-", "").strip()
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    return raw or ""


def _doc(raw: Optional[str]) -> str:
    """Só os dígitos do CNPJ/CPF — chave que une o mesmo pagador em qualquer banco."""
    return re.sub(r"\D", "", raw or "")


def _meses_janela(year: int, month: int, months_back: int) -> list[tuple[int, int]]:
    ref = date(year, month, 1)
    out = []
    for i in range(months_back):
        m = ref.month - i
        y = ref.year
        while m <= 0:
            m += 12
            y -= 1
        out.append((y, m))
    return out


def _load_itau(year: int, month: int, months_back: int = 6) -> list[dict]:
    """Boletos do Itaú da mesma janela, no mesmo formato dos pagamentos do Asaas."""
    months = _meses_janela(year, month, months_back)
    conditions = " OR ".join(
        f"(EXTRACT(YEAR FROM data_vencimento)={y} AND EXTRACT(MONTH FROM data_vencimento)={m})"
        for y, m in months
    )
    db = SessionLocal()
    try:
        rows = db.execute(text(f"""
            SELECT nosso_numero, pagador, cpf_cnpj, valor_titulo, data_vencimento,
                   data_pagamento, status
            FROM itau_boletos
            WHERE status != 'cancelada' AND ({conditions})
        """)).fetchall()
    except Exception as e:                     # tabela ausente/erro: a previsão segue só com o Asaas
        print(f"⚠️  previsibilidade: itau_boletos indisponível: {e}")
        return []
    finally:
        db.close()
    mapa = {"paga": "RECEIVED", "a vencer": "PENDING", "vencida": "OVERDUE"}
    return [
        {
            "id": r.nosso_numero, "customer": None, "name": r.pagador, "cpfCnpj": r.cpf_cnpj,
            "value": r.valor_titulo or 0,
            "dueDate": r.data_vencimento.isoformat() if r.data_vencimento else None,
            "paymentDate": r.data_pagamento.isoformat() if r.data_pagamento else None,
            "creditDate": r.data_pagamento.isoformat() if r.data_pagamento else None,
            "status": mapa.get((r.status or "").lower(), r.status or ""),
            "banco": "Itaú",
        }
        for r in rows
    ]


def _chave_pagador(p: dict) -> str:
    """CNPJ/CPF (só dígitos) — igual em qualquer banco. Sem documento, cai no id do Asaas."""
    d = _doc(p.get("cpfCnpj"))
    if d:
        return d
    if p.get("customer"):
        return f"asaas:{p['customer']}"
    return f"{(p.get('banco') or 'x').lower()}:{p.get('name') or p.get('id') or ''}"


def _calcular(year: int, month: int) -> dict:
    """Cálculo único da previsão (usado pela tela e pelo Excel).

    - Histórico: boletos pagos (Asaas RECEIVED/CONFIRMED + Itaú 'paga') dos últimos 6 meses,
      agrupados por CNPJ/CPF, qualquer banco. avg_dias = média de (vencimento - dia do crédito).
    - Em aberto: Asaas PENDING + Itaú 'a vencer' com vencimento no mês escolhido.
    - Sem histórico: previsão pelo vencimento (marcada como tal).
    """
    asaas = _load_payments(year, month, months_back=6)
    for p in asaas:
        p["banco"] = "Asaas"
    itau = _load_itau(year, month, months_back=6)
    todos = asaas + itau
    prefix = f"{year}-{month:02d}"

    # 1) histórico por pagador
    dados: dict[str, dict] = {}
    for p in todos:
        if p.get("status") not in ("RECEIVED", "CONFIRMED"):
            continue
        due_date    = _parse_date(p.get("dueDate"))
        credit_date = _parse_date(p.get("creditDate") or p.get("paymentDate"))
        if not due_date or not credit_date:
            continue
        k = _chave_pagador(p)
        d = dados.setdefault(k, {"diffs": [], "name": None, "cpfCnpj": None, "bancos": set()})
        d["diffs"].append((due_date - credit_date).days)
        d["bancos"].add(p["banco"])
        if not d["name"] and p.get("name"):
            d["name"] = p["name"]
        if not d["cpfCnpj"] and p.get("cpfCnpj"):
            d["cpfCnpj"] = p["cpfCnpj"]

    # 2) em aberto do mês (Asaas PENDING + Itaú a vencer), sem contar o mesmo boleto duas vezes
    itau_abertos = {
        (_doc(p.get("cpfCnpj")), round(float(p.get("value") or 0), 2), (p.get("dueDate") or "")[:7])
        for p in itau if p.get("status") == "PENDING" and (p.get("dueDate") or "").startswith(prefix)
    }
    abertos = []
    for p in todos:
        if p.get("status") != "PENDING" or not (p.get("dueDate") or "").startswith(prefix):
            continue
        if p["banco"] == "Asaas" and _doc(p.get("cpfCnpj")) and \
           (_doc(p.get("cpfCnpj")), round(float(p.get("value") or 0), 2), prefix) in itau_abertos:
            continue
        abertos.append(p)

    # 3) scores (só quem tem histórico)
    scores: dict[str, dict] = {}
    for k, info in dados.items():
        diffs = info["diffs"]
        avg = sum(diffs) / len(diffs)
        sc, cl = _score(avg)
        doc = _doc(info.get("cpfCnpj"))
        scores[k] = {
            "customer_id":     k,
            "id_smart":        f"ss_{doc}" if doc else "",
            "nome":            info.get("name") or "Não identificado",
            "cnpj":            _fmt_cnpj(info.get("cpfCnpj") or ""),
            "qtd_pagamentos":  len(diffs),
            "avg_dias":        round(avg, 1),
            "std_dias":        round(_std(diffs), 1),
            "score":           sc,
            "classificacao":   cl,
            "previsao_padrao": _previsao_padrao(avg),
            "bancos":          sorted(info["bancos"]),
            "sem_historico":   False,
        }

    # 4) cobranças em aberto com a data prevista
    pending_list = []
    sem_hist: dict[str, dict] = {}
    for p in abertos:
        k = _chave_pagador(p)
        due_date = _parse_date(p.get("dueDate"))
        sc_info = scores.get(k)
        doc = _doc(p.get("cpfCnpj"))
        if sc_info:
            delta = int(round(sc_info["avg_dias"]))
            data_prevista = (due_date - timedelta(days=delta)).isoformat() if due_date else None
            obs = f"Baseado em {sc_info['qtd_pagamentos']} pagamento(s) ({' + '.join(sc_info['bancos'])})"
            sc = sc_info["score"]
            sem = False
        else:
            data_prevista = due_date.isoformat() if due_date else None   # sem histórico: o vencimento
            obs = "Sem histórico — previsão pelo vencimento"
            sc = None
            sem = True
            r = sem_hist.setdefault(k, {
                "customer_id": k, "id_smart": f"ss_{doc}" if doc else "",
                "nome": p.get("name") or "Não identificado", "cnpj": _fmt_cnpj(p.get("cpfCnpj") or ""),
                "qtd_pagamentos": 0, "avg_dias": None, "std_dias": 0, "score": None,
                "classificacao": "Sem histórico", "previsao_padrao": "Sem histórico — previsão pelo vencimento",
                "bancos": [], "sem_historico": True,
            })
            if p["banco"] not in r["bancos"]:
                r["bancos"].append(p["banco"])
        pending_list.append({
            "customer_id":   k,
            "id_smart":      f"ss_{doc}" if doc else "",
            "nome":          p.get("name") or "Não identificado",
            "cnpj":          _fmt_cnpj(p.get("cpfCnpj") or ""),
            "valor":         p.get("value", 0),
            "vencimento":    p.get("dueDate"),
            "data_prevista": data_prevista,
            "score":         sc,
            "observacao":    obs,
            "banco":         p["banco"],
            "sem_historico": sem,
        })

    return {"scores": scores, "sem_hist": sem_hist, "pending": pending_list,
            "total_registros": len(todos)}


def _load_payments(year: int, month: int, months_back: int = 6) -> list[dict]:
    """Carrega pagamentos dos últimos N meses a partir do banco local."""
    ref = date(year, month, 1)
    months = []
    for i in range(months_back):
        m = ref.month - i
        y = ref.year
        while m <= 0:
            m += 12
            y -= 1
        months.append((y, m))

    if not months:
        return []

    # monta cláusula WHERE para os meses
    conditions = " OR ".join(
        f"(EXTRACT(YEAR FROM due_date)={y} AND EXTRACT(MONTH FROM due_date)={m})"
        for y, m in months
    )

    db = SessionLocal()
    try:
        rows = db.execute(text(f"""
            SELECT asaas_id, customer_id, customer_name, customer_cpf_cnpj,
                   value, net_value, due_date, payment_date, credit_date,
                   status, billing_type, external_reference
            FROM asaas_payments_sync
            WHERE {conditions}
        """)).fetchall()

        return [
            {
                "id":               r.asaas_id,
                "customer":         r.customer_id,
                "name":             r.customer_name,
                "cpfCnpj":          r.customer_cpf_cnpj,
                "value":            r.value or 0,
                "netValue":         r.net_value,
                "dueDate":          r.due_date.isoformat() if r.due_date else None,
                "paymentDate":      r.payment_date.isoformat() if r.payment_date else None,
                "creditDate":       r.credit_date.isoformat() if r.credit_date else None,
                "status":           r.status,
                "billingType":      r.billing_type,
                "externalReference": r.external_reference,
            }
            for r in rows
        ]
    finally:
        db.close()


# ── endpoint: dados JSON para visualização ────────────────────────────────────

@router.get("/summary")
async def get_previsibilidade_summary(
    month: int = Query(..., ge=1, le=12),
    year:  int = Query(..., ge=2020),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = _calcular(year, month)
    if not r["total_registros"]:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Sem dados no banco local. Aguarde o próximo sync (20 min).")

    scores_lista = list(r["scores"].values())
    order = {"C": 0, "B": 1, "A": 2}
    scores_lista.sort(key=lambda x: (order.get(x["score"], 9), x["avg_dias"]))
    pending_list = r["pending"]

    # KPIs de score: só quem tem histórico. Quem está sem histórico aparece na tabela (para as
    # cobranças em aberto dele não ficarem invisíveis), mas não entra nos percentuais.
    total = len(scores_lista)
    por_banco: dict[str, float] = {}
    for p in pending_list:
        por_banco[p["banco"]] = round(por_banco.get(p["banco"], 0) + (p["valor"] or 0), 2)
    sem = [p for p in pending_list if p["sem_historico"]]
    kpis = {
        "total_clientes":  total,
        "pct_score_a":     round(sum(1 for s in scores_lista if s["score"] == "A") / total * 100, 1) if total else 0,
        "pct_score_b":     round(sum(1 for s in scores_lista if s["score"] == "B") / total * 100, 1) if total else 0,
        "pct_score_c":     round(sum(1 for s in scores_lista if s["score"] == "C") / total * 100, 1) if total else 0,
        "total_pending":   len(pending_list),
        "valor_pending":   round(sum(p["valor"] for p in pending_list), 2),
        "valor_por_banco": por_banco,
        "sem_historico_qtd":   len(sem),
        "sem_historico_valor": round(sum(p["valor"] for p in sem), 2),
    }
    return {"kpis": kpis, "scores": scores_lista + list(r["sem_hist"].values()), "pending": pending_list}


# ── endpoint: export Excel ────────────────────────────────────────────────────

@router.get("/export")
async def export_previsibilidade(
    month: int = Query(..., ge=1, le=12),
    year:  int = Query(..., ge=2020),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = _calcular(year, month)
    ref = f"{month:02d}/{year}"
    scores = {k: dict(v, ultima_ref=ref) for k, v in r["scores"].items()}
    for v in scores.values():
        v["avg_dias"] = round(v["avg_dias"], 2)

    previsao_rows = []
    for p in r["pending"]:
        due_date = _parse_date(p.get("vencimento"))
        data_prev = _parse_date(p.get("data_prevista"))
        sem = p["sem_historico"]
        if sem:
            dias_lbl = "—"
        else:
            sc_info = r["scores"][p["customer_id"]]
            dias_lbl = f"{int(round(sc_info['avg_dias'])):+d} dias"
        previsao_rows.append({
            "nome":          p.get("nome") or "Não identificado",
            "cnpj":          p.get("cnpj") or "",
            "valor":         p.get("valor", 0),
            "vencimento":    due_date,
            "data_prevista": data_prev,
            "score":         "—" if sem else p["score"],
            "dias_label":    dias_lbl,
            "obs":           p["observacao"],
            "banco":         p["banco"],
        })

    # ── gera Excel ────────────────────────────────────────────────────────────
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    VERDE_ESCURO = "3CB54A"
    VERDE_CLARO  = "F0FDF4"
    BRANCO       = "FFFFFF"
    CINZA_CLARO  = "F9FAFB"
    LARANJA      = "F97316"
    VERMELHO_C   = "EF4444"
    VERDE_SCORE  = "16A34A"

    wb  = Workbook()
    thin = Side(style="thin", color="D1D5DB")
    borda = Border(left=thin, right=thin, top=thin, bottom=thin)

    def _hdr_font():
        return Font(name="Arial", bold=True, color=BRANCO, size=10)
    def _title_font():
        return Font(name="Arial", bold=True, color=VERDE_ESCURO, size=12)
    def _cell_font():
        return Font(name="Arial", size=10)
    def _fill(h):
        return PatternFill("solid", fgColor=h)
    def _score_color(sc):
        return VERDE_SCORE if sc == "A" else (LARANJA if sc == "B" else VERMELHO_C)

    def _write_title(ws, title_text, ncols):
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
        c = ws.cell(1, 1, title_text)
        c.font = _title_font(); c.fill = _fill(VERDE_CLARO)
        c.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[1].height = 24

    def _write_headers(ws, row, headers):
        for col, h in enumerate(headers, 1):
            c = ws.cell(row, col, h)
            c.font = _hdr_font(); c.fill = _fill(VERDE_ESCURO)
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = borda
        ws.row_dimensions[row].height = 18

    # Aba 1: Score por Cliente
    ws1 = wb.active
    ws1.title = "Score por Cliente"
    headers1 = ["Nome", "CNPJ", "Qtd Pagamentos", "Média Dias", "Desvio Padrão", "Score", "Classificação", "Últ. Ref.", "Bancos (histórico)"]
    _write_title(ws1, f"Previsibilidade Comportamental — Score por Cliente — {month:02d}/{year}", len(headers1))
    _write_headers(ws1, 2, headers1)

    for i, (cid, info) in enumerate(scores.items()):
        row = i + 3
        fill = _fill(BRANCO) if i % 2 == 0 else _fill(CINZA_CLARO)
        vals = [info["nome"], info["cnpj"], info["qtd_pagamentos"], info["avg_dias"],
                info["std_dias"], info["score"], info["classificacao"], info["ultima_ref"], " + ".join(info["bancos"])]
        for col, val in enumerate(vals, 1):
            c = ws1.cell(row, col, val)
            c.font = _cell_font(); c.fill = fill
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = borda
            if col == 6 and val in ("A", "B", "C"):
                c.font = Font(name="Arial", bold=True, size=10, color=_score_color(val))

    for col, w in zip(range(1, len(headers1)+1), [35, 20, 16, 12, 14, 8, 20, 14, 20]):
        ws1.column_dimensions[get_column_letter(col)].width = w

    # Aba 2: Previsão – Cobranças Abertas
    ws2 = wb.create_sheet("Previsão – Cobranças Abertas")
    headers2 = ["Nome", "CNPJ", "Banco", "Valor (R$)", "Vencimento", "Data Prevista", "Score", "Dias Antes/Após", "Observação"]
    _write_title(ws2, f"Previsibilidade — Cobranças Abertas — {month:02d}/{year}", len(headers2))
    _write_headers(ws2, 2, headers2)

    for i, row_data in enumerate(previsao_rows):
        row = i + 3
        fill = _fill(BRANCO) if i % 2 == 0 else _fill(CINZA_CLARO)
        cells = [
            (1, row_data["nome"],          None),
            (2, row_data["cnpj"],          None),
            (3, row_data["banco"],         None),
            (4, row_data["valor"],         'R$ #,##0.00'),
            (5, row_data["vencimento"],    "DD/MM/YYYY"),
            (6, row_data["data_prevista"], "DD/MM/YYYY"),
            (7, row_data["score"],         None),
            (8, row_data["dias_label"],    None),
            (9, row_data["obs"],           None),
        ]
        for col, val, fmt_str in cells:
            c = ws2.cell(row, col, val)
            c.font = _cell_font(); c.fill = fill
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = borda
            if fmt_str:
                c.number_format = fmt_str
            if col == 7 and val in ("A", "B", "C"):
                c.font = Font(name="Arial", bold=True, size=10, color=_score_color(val))

    for col, w in zip(range(1, len(headers2)+1), [35, 20, 10, 14, 14, 18, 8, 16, 44]):
        ws2.column_dimensions[get_column_letter(col)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"previsibilidade_comportamental_{month:02d}_{year}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
