"""
Gerador de PDF — Gestora Smart
Renderiza HTML/CSS via WeasyPrint.
"""
import io
import datetime
import os
from collections import defaultdict
from html import escape

from weasyprint import HTML

OPERADORAS = ["ALGAR", "VIVO", "CLARO", "TIM", "ARQIA", "SIERRA"]
MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

_HERE = os.path.dirname(os.path.abspath(__file__))
_LOGO_PATH = os.path.join(_HERE, "gestora_logo.png")

_CSS = """
  @page { size: A4; margin: 0; }

  :root {
    --green: #6BBF4E;
    --green-light: #EEF7EA;
    --gray-dark: #555555;
    --gray-mid: #888888;
    --gray-light: #F4F4F4;
    --border: #DDDDDD;
    --text: #1A1A1A;
    --text-muted: #666666;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    background: #fff;
    padding: 20px 40px;
  }

  /* ── HEADER ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 10px;
    border-bottom: 3px solid var(--green);
    margin-bottom: 10px;
  }

  .logo-img { height: 160px; width: auto; display: block; margin-bottom: -28px; }

  .doc-id { text-align: right; }
  .doc-id .doc-number {
    font-size: 18px; font-weight: 800;
    color: var(--text); letter-spacing: -0.5px;
  }
  .doc-id .doc-date {
    font-size: 11px; font-weight: 500;
    color: var(--gray-mid); margin-top: 2px;
  }

  /* ── EMPRESA ── */
  .company-bar {
    background: var(--gray-light);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 8px 14px;
    margin-bottom: 8px;
  }
  .company-bar .cb-name {
    font-size: 12px; font-weight: 800;
    color: var(--text); letter-spacing: -0.2px; margin-bottom: 3px;
  }
  .company-bar .cb-details {
    font-size: 10px; color: var(--text-muted); line-height: 1.7;
  }

  /* ── CLIENTE ── */
  .client-block {
    border: 1px solid var(--border);
    border-radius: 3px; overflow: hidden; margin-bottom: 8px;
  }
  .block-header {
    background: var(--gray-dark); color: #fff;
    font-size: 10px; font-weight: 700;
    letter-spacing: 1px; padding: 5px 12px; text-transform: uppercase;
  }
  .block-body {
    padding: 8px 14px; font-size: 11px;
    color: var(--text); line-height: 1.6;
  }
  .block-body strong { font-weight: 700; }

  /* ── PERÍODO ── */
  .period-bar {
    background: var(--gray-light); border: 1px solid var(--border);
    border-radius: 3px; padding: 8px 16px; margin-bottom: 10px;
    font-size: 11px; color: var(--text-muted); line-height: 1.5;
  }
  .period-bar strong { color: var(--text); }

  /* ── TÍTULOS DE SEÇÃO ── */
  .section-title {
    font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase; color: var(--green);
    border-bottom: 2px solid var(--green-light);
    padding-bottom: 4px; margin-bottom: 6px; margin-top: 0;
  }
  .st-pagamento { text-align: center; }

  /* ── TABELAS ── */
  table {
    width: 100%; border-collapse: collapse;
    font-size: 11px; margin-bottom: 6px; table-layout: fixed;
    page-break-inside: avoid;
  }
  .tbl-section-header td {
    background: var(--gray-dark); color: #fff;
    font-weight: 700; font-size: 10.5px; letter-spacing: 0.6px;
    text-align: center; padding: 4px 8px;
    text-transform: uppercase; border: none;
  }
  .tbl-section-header td.th-green { background: var(--green); border: none; }
  .tbl-col-header th {
    background: #444; color: #fff; font-size: 10px; font-weight: 600;
    padding: 4px 8px; text-align: center; border: 1px solid #E0E0E0;
  }
  .tbl-col-header th.th-green { background: var(--green); }
  tbody tr { background: var(--gray-light); }
  td {
    padding: 4px 8px; border: 1px solid #E0E0E0;
    text-align: center; color: var(--text);
    background: var(--gray-light);
  }
  td.td-label { text-align: left; font-weight: 600; }
  td.td-green {
    background: var(--green-light); font-weight: 700; color: var(--gray-dark);
  }
  .subtotal-row td {
    background: #ECECEC; font-weight: 700; font-size: 11px;
  }
  .subtotal-row td.td-green { background: var(--green); color: #fff; }

  /* ── TOTAL GERAL ── */
  .total-final {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--green); border-radius: 3px;
    padding: 9px 20px 9px 24px; margin-top: 2px; margin-bottom: 10px;
  }
  .total-final .tf-label {
    font-size: 11px; font-weight: 600; letter-spacing: 1px;
    text-transform: uppercase; color: #fff; opacity: 0.85;
  }
  .total-final .tf-value {
    font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #fff;
  }

  /* ── PAGAMENTO ── */
  .payment-table th {
    background: var(--gray-dark); color: #fff;
    font-size: 10px; padding: 6px 10px; font-weight: 600;
  }
  .badge-pix {
    background: #00C4B4; color: #fff; font-size: 9px; font-weight: 700;
    padding: 2px 6px; border-radius: 2px; letter-spacing: 0.5px;
  }
  .badge-boleto {
    background: #F59E0B; color: #fff; font-size: 9px; font-weight: 700;
    padding: 2px 6px; border-radius: 2px; letter-spacing: 0.5px;
  }
"""


def _fmt_doc(raw: str) -> str:
    d = "".join(c for c in (raw or "") if c.isdigit())
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return raw or ""


def _brl(v) -> str:
    v = v or 0
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _num(v) -> str:
    if not v:
        return "0"
    return f"{int(v):,}".replace(",", ".")


def generate_client_invoice_pdf(
    cycle, agg_rows, summary, adjustments,
    client=None, asaas_cust=None, nome_override=None, cpf_cnpj_override=None,
    asaas_invoice_number=None, itau_nosso_numero=None,
) -> io.BytesIO:

    today = datetime.date.today()
    mes_ext = f"{MESES[cycle.month]} {cycle.year}"
    # Nº da cobrança: usa o número que o cliente reconhece no boleto —
    # fatura do Asaas ou nº do boleto Itaú, o que existir (Asaas tem
    # prioridade se o cliente tiver os dois). Sem nenhum, cai no id do ciclo.
    if asaas_invoice_number:
        numero = escape(str(asaas_invoice_number))
    elif itau_nosso_numero:
        numero = escape(str(itau_nosso_numero))
    else:
        numero = str(getattr(cycle, "id", 0)).zfill(6)
    data_emissao = today.strftime("%d/%m/%Y")

    def _ac(field):
        """Lê campo de asaas_cust (Row namedtuple ou dict)."""
        if asaas_cust is None:
            return None
        if hasattr(asaas_cust, field):
            return getattr(asaas_cust, field)
        if hasattr(asaas_cust, "_mapping"):
            return asaas_cust._mapping.get(field)
        return None

    # Prioridade: Asaas > nome_override (summary/billing) > client local > fallback
    razao    = escape(_ac("name") or nome_override or getattr(client, "nome", None) or "")
    cnpj_raw = cpf_cnpj_override or getattr(client, "cpf_cnpj", None) or ""
    cnpj     = escape(_fmt_doc(cnpj_raw))

    email_raw = _ac("email") or getattr(client, "email", None) or ""
    email     = escape(email_raw or "—")

    phone_raw = _ac("mobile_phone") or _ac("phone") or getattr(client, "telefone", None) or ""
    telefone  = escape(phone_raw or "—")

    # Monta endereço a partir dos campos do Asaas
    parts = []
    if _ac("address"):
        parts.append(_ac("address"))
        if _ac("address_number"):
            parts[-1] += f", {_ac('address_number')}"
        if _ac("complement"):
            parts.append(_ac("complement"))
    if _ac("province"):
        parts.append(_ac("province"))
    city_state = " / ".join(filter(None, [_ac("city"), _ac("state")]))
    if city_state:
        parts.append(city_state)
    if _ac("postal_code"):
        pc = _ac("postal_code")
        pc = pc.replace("-", "")
        if len(pc) == 8:
            pc = f"{pc[:5]}-{pc[5:]}"
        parts.append(f"CEP {pc}")
    endereco = escape(" — ".join(parts) if parts else (getattr(client, "endereco", None) or "—"))
    total    = (summary.total_final or 0) if summary else 0

    # Vencimento: do summary (campo due_date) ou padrão do dia 5
    due_date = None
    if summary:
        due_date = getattr(summary, "due_date", None) or getattr(summary, "vencimento", None)
    if due_date is None:
        dia = getattr(client, "dia_vencimento", None) or 5
        venc_m = cycle.month + 1 if cycle.month < 12 else 1
        venc_y = cycle.year if cycle.month < 12 else cycle.year + 1
        import calendar
        last_day = calendar.monthrange(venc_y, venc_m)[1]
        dia = min(dia, last_day)
        due_date = datetime.date(venc_y, venc_m, dia)
    vencimento = due_date.strftime("%d/%m/%Y") if hasattr(due_date, "strftime") else str(due_date)

    # ── Agrega linhas pré-computadas pelo SQL GROUP BY ───────────
    # agg_rows: (grupo, operadora, qtd, mens, atv, mb_exc, qtd_sms)
    by_op = defaultdict(lambda: {"qtd": 0, "mens": 0.0, "atv": 0.0})
    by_st = defaultdict(lambda: {"qtd": 0, "valor": 0.0})
    qtd_mb = 0.0
    qtd_sms = 0
    qtd_frete = 0
    qtd_msg = 0

    def _attr(row, name, idx):
        v = getattr(row, name, None)
        if v is None:
            try:
                v = row[idx]
            except Exception:
                v = None
        return v

    for row in agg_rows:
        grupo    = str(_attr(row, "grupo",    0) or "").strip()
        operadora = str(_attr(row, "operadora", 1) or "OUTROS").upper().strip()
        qtd      = int(_attr(row, "qtd",    2) or 0)
        mens     = float(_attr(row, "mens",  3) or 0)
        atv      = float(_attr(row, "atv",   4) or 0)
        mb_exc   = float(_attr(row, "mb_exc", 5) or 0)
        sms_qtd  = int(_attr(row, "qtd_sms", 6) or 0)

        key = next((o for o in OPERADORAS if operadora.startswith(o)), "OUTROS")

        if grupo == "ativo":
            by_op[key]["qtd"]  += qtd
            by_op[key]["mens"] += mens
            by_op[key]["atv"]  += atv
            qtd_mb  += mb_exc
            qtd_sms += sms_qtd
        elif grupo == "cancelamento":
            by_st["Cancelamento"]["qtd"] += qtd
        elif grupo == "pre_ativo":
            by_st["Pré-ativo"]["qtd"] += qtd
        elif grupo == "frete":
            qtd_frete += qtd
        elif grupo == "mensageria":
            qtd_msg += qtd

    val_exc    = (summary.total_excedente    or 0) if summary else 0
    val_sms    = (summary.total_sms          or 0) if summary else 0
    val_frete  = (summary.total_frete        or 0) if summary else 0
    val_msg    = (summary.total_mensageria   or 0) if summary else 0
    val_cancel = (summary.total_cancelamento or 0) if summary else 0
    val_multa  = (summary.total_multa        or 0) if summary else 0

    # ── Operadoras table rows ───────────────────────────────
    op_rows = []
    tot_ativos = 0.0
    for op in OPERADORAS:
        d    = by_op.get(op, {})
        qtd  = d.get("qtd",  0)
        mens = d.get("mens", 0.0)
        atv  = d.get("atv",  0.0)
        sub  = mens + atv
        tot_ativos += sub
        op_rows.append(
            f"<tr><td>{op}</td><td>{_num(qtd)}</td>"
            f"<td>{_brl(mens)}</td><td>{_brl(atv)}</td>"
            f"<td class='td-green'>{_brl(sub)}</td></tr>"
        )

    # ── Outros serviços ─────────────────────────────────────
    outros_total = val_cancel + val_multa + val_exc + val_sms + val_frete + val_msg

    logo_uri = f"file://{_LOGO_PATH}"

    html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Cobrança Gestora Smart</title>
<style>{_CSS}</style>
</head>
<body>

  <div class="header">
    <div class="logo-block">
      <img class="logo-img" src="{logo_uri}">
    </div>
    <div class="doc-id">
      <div class="doc-number">COBRANÇA Nº {numero}</div>
      <div class="doc-date">Emissão: {data_emissao}</div>
    </div>
  </div>

  <div class="company-bar">
    <div class="cb-name">Gestora Smart Sim Card, Hardware e Software Ltda</div>
    <div class="cb-details">
      Rua das Bandeiras, 35 - 2º Andar - Jardim - Santo André/SP - CEP: 09090-780<br>
      CNPJ: 35.775.152/0001-40 &nbsp;|&nbsp; financeiro@gestorasmart.com.br &nbsp;|&nbsp; (11) 8977-0913
    </div>
  </div>

  <div class="client-block">
    <div class="block-header">Dados do Cliente</div>
    <div class="block-body">
      <strong>Razão Social:</strong> {razao}<br>
      <strong>CNPJ/CPF:</strong> {cnpj}<br>
      <strong>Endereço:</strong> {endereco}<br>
      <strong>E-mail:</strong> {email} &nbsp;|&nbsp; <strong>Tel:</strong> {telefone}
    </div>
  </div>

  <div class="period-bar">
    <strong>[ Competência {mes_ext} ]</strong> — Serviço de Valor Adicionado para gestão de
    Conectividade M2M &amp; IoT — Pode haver valores relacionados a Mensalidades,
    Taxas de ativação, Cancelamentos, Fretes e Dados adicionais.
  </div>

  <div class="section-title st-discriminacao">Discriminação dos Serviços</div>

  <table>
    <colgroup>
      <col style="width:28%;"><col style="width:16%;">
      <col style="width:22%;"><col style="width:16%;"><col style="width:18%;">
    </colgroup>
    <tr class="tbl-section-header">
      <td colspan="5">SIMCARDs Ativos</td>
    </tr>
    <tr class="tbl-col-header">
      <th>Operadora</th><th>Quantidade</th>
      <th>Valor</th><th>Ativação</th>
      <th class="th-green">Subtotal</th>
    </tr>
    <tbody>
      {"".join(op_rows)}
      <tr class="subtotal-row">
        <td colspan="4" style="text-align:left;padding-left:24px;">SUBTOTAL</td>
        <td class="td-green">{_brl(tot_ativos)}</td>
      </tr>
    </tbody>
  </table>

  <table>
    <colgroup>
      <col style="width:46%;"><col style="width:16%;">
      <col style="width:20%;"><col style="width:18%;">
    </colgroup>
    <tr class="tbl-section-header">
      <td colspan="4">Outros Serviços</td>
    </tr>
    <tr class="tbl-col-header">
      <th>Item</th><th>Quantidade</th>
      <th>Valor</th><th class="th-green">Subtotal</th>
    </tr>
    <tbody>
      <tr><td class="td-label">Cancelamento</td>
          <td>{_num(by_st["Cancelamento"]["qtd"])}</td>
          <td>{_brl(val_cancel + val_multa)}</td>
          <td class="td-green">{_brl(val_cancel + val_multa)}</td></tr>
      <tr><td class="td-label">Pré-Ativo</td>
          <td>{_num(by_st["Pré-ativo"]["qtd"])}</td>
          <td>{_brl(0)}</td>
          <td class="td-green">{_brl(0)}</td></tr>
      <tr><td class="td-label">Excedente de Dados (MB)</td>
          <td>{f"{qtd_mb:,.0f} MB".replace(",",".")}</td>
          <td>{_brl(val_exc)}</td>
          <td class="td-green">{_brl(val_exc)}</td></tr>
      <tr><td class="td-label">SMS</td>
          <td>{_num(qtd_sms)}</td>
          <td>{_brl(val_sms)}</td>
          <td class="td-green">{_brl(val_sms)}</td></tr>
      <tr><td class="td-label">Frete</td>
          <td>{_num(qtd_frete)}</td>
          <td>{_brl(val_frete)}</td>
          <td class="td-green">{_brl(val_frete)}</td></tr>
      <tr><td class="td-label">Pacote Mensageria</td>
          <td>{_num(qtd_msg)}</td>
          <td>{_brl(val_msg)}</td>
          <td class="td-green">{_brl(val_msg)}</td></tr>
      <tr class="subtotal-row">
        <td colspan="3" style="text-align:left;padding-left:24px;">SUBTOTAL</td>
        <td class="td-green">{_brl(outros_total)}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-final">
    <span class="tf-label">Total Geral</span>
    <span class="tf-value">{_brl(total)}</span>
  </div>

  <div class="section-title st-pagamento">Condições de Pagamento</div>

  <table class="payment-table">
    <tr>
      <th>Nº</th><th>Vencimento</th><th>Valor (R$)</th>
      <th>Forma</th><th>Observações</th>
    </tr>
    <tbody>
      <tr>
        <td>1</td>
        <td>{vencimento}</td>
        <td><strong>{_brl(total)}</strong></td>
        <td><span class="badge-boleto">BOLETO</span> &nbsp;<span class="badge-pix">PIX</span></td>
        <td>{mes_ext}</td>
      </tr>
    </tbody>
  </table>

</body>
</html>"""

    buf = io.BytesIO()
    HTML(string=html_content).write_pdf(buf, zoom=0.88)
    buf.seek(0)
    return buf
