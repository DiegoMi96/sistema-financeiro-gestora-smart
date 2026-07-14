"""
Motor de Contestação — Gestora Smart
Processa os três arquivos mensais e identifica divergências para contestação.
"""
import io
import re
import calendar
import warnings
from datetime import datetime
from typing import Optional

import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

# Operadoras da família Claro — pacote adicional é permitido apenas para elas
CLARO_OPERADORAS = {"CLARO", "CLARO BL", "CLARO CATM1", "CLARO NBIOT", "CLARO 4G"}

# Palavras-chave que identificam uma transferência no nome do pedido
TRANSFER_KEYWORDS = ["TRANSFERÊNCIA", "TRANSFERENCIA", "TRANSFER", "TITULARIDADE"]


def _normalize_msisdn(val) -> Optional[str]:
    """Remove caracteres não-numéricos do MSISDN."""
    if pd.isna(val) or not val:
        return None
    return re.sub(r"\D", "", str(val))


def _extract_order_id(nome_pedido: str) -> Optional[str]:
    """Extrai o número do pedido de strings como 'Pedido/ Transferência - #4038857'."""
    if not nome_pedido:
        return None
    match = re.search(r"#?(\d{5,})", str(nome_pedido))
    return match.group(1) if match else None


def _is_transfer(nome_pedido: str) -> bool:
    """Verifica se o pedido é uma transferência."""
    if not nome_pedido:
        return False
    upper = str(nome_pedido).upper()
    return any(kw in upper for kw in TRANSFER_KEYWORDS)


def _is_claro(operadora: str) -> bool:
    """Verifica se a operadora é da família Claro."""
    if not operadora:
        return False
    return str(operadora).upper().strip() in CLARO_OPERADORAS


class ContestationEngine:

    def __init__(self, year: int, month: int):
        self.year       = year
        self.month      = month
        self.total_dias = calendar.monthrange(year, month)[1]

    def run(self, files_bytes: dict) -> dict:
        """
        files_bytes: {
            "faturamento": bytes,   # nossa base de faturamento (05_Maio format)
            "fornecedor":  bytes,   # detalhamento do fornecedor (.xlsb)
            "contratos":   bytes,   # inventory export do fornecedor (preços de custo)
        }
        Retorna dict com listas de itens por tipo de contestação.
        """
        print(f"Motor de Contestação — {self.month:02d}/{self.year}")
        print(f"  Carregando arquivos...")
        import sys
        for _nome, _key in [("faturamento","faturamento"),("contratos","contratos")]:
            try:
                _xf = pd.ExcelFile(io.BytesIO(files_bytes[_key]))
                print(f"  [{_nome}] abas: {_xf.sheet_names}", flush=True)
            except Exception as _e:
                print(f"  [{_nome}] erro ao abrir: {_e}", flush=True)
        try:
            from pyxlsb import open_workbook as _owb
            with _owb(io.BytesIO(files_bytes["fornecedor"])) as _wb:
                print(f"  [fornecedor]  abas (xlsb): {_wb.sheets}", flush=True)
        except Exception as _e:
            try:
                _xf2 = pd.ExcelFile(io.BytesIO(files_bytes["fornecedor"]))
                print(f"  [fornecedor]  abas (xlsx): {_xf2.sheet_names}", flush=True)
            except Exception as _e2:
                print(f"  [fornecedor]  erro ao abrir: {_e} / {_e2}", flush=True)
        sys.stdout.flush()

        df_billing    = self._load_billing(files_bytes["faturamento"])
        df_supplier   = self._load_supplier(files_bytes["fornecedor"])
        df_contracts  = self._load_contracts(files_bytes["contratos"])
        df_sms        = self._load_supplier_sms(files_bytes["fornecedor"])
        valor_cs      = self._load_cs_value(files_bytes["fornecedor"])

        print(f"  Base faturamento : {len(df_billing):,} linhas")
        print(f"  Fornecedor BILLING: {len(df_supplier):,} linhas")
        print(f"  Contratos        : {len(df_contracts):,} linhas")
        print(f"  CS               : R$ {valor_cs:,.2f}")

        # ── Dicionários de lookup ──────────────────────────────
        # MSISDN → dados da nossa base
        billing_map = df_billing.set_index("msisdn_norm").to_dict("index") if "msisdn_norm" in df_billing.columns else {}

        # MSISDN → dados do contrato (custo)
        contract_map = df_contracts.set_index("msisdn_norm").to_dict("index") if "msisdn_norm" in df_contracts.columns else {}

        # Mapa de ID do pedido para matchmaking de transferências
        billing_order_map = {}
        if "id_pedido" in df_billing.columns and "msisdn_norm" in df_billing.columns:
            for _, row in df_billing.iterrows():
                if row.get("id_pedido"):
                    billing_order_map[str(row["id_pedido"])] = row.to_dict()

        # ── Processar cada linha do fornecedor ────────────────
        results = {
            "valor_acima_contrato":    [],
            "pcte_adicional_indevido": [],
            "linha_nao_identificada":  [],
            "transferencia":           [],
            "cs_valor":                valor_cs,
        }

        for _, row in df_supplier.iterrows():
            msisdn      = row.get("msisdn_norm")
            tipo_item   = str(row.get("tipo_item", "")).strip()
            vl_faturado = float(row.get("valor_faturado") or 0)
            vl_produto  = float(row.get("valor_produto") or 0)
            vl_excedente= float(row.get("valor_excedente") or 0)
            pacote      = str(row.get("pacote", ""))
            operadora_f = str(row.get("operadora", ""))
            dias_forn   = int(row.get("dias_faturados") or self.total_dias)
            status_forn = str(row.get("status_terminal", ""))

            # ── Busca na nossa base por MSISDN ────────────────
            billing_row  = billing_map.get(msisdn) if msisdn else None
            contract_row = contract_map.get(msisdn) if msisdn else None

            operadora_nossa = (billing_row.get("operadora") if billing_row else "") or ""
            iccid           = (billing_row or contract_row or {}).get("iccid", "")
            id_pedido       = (contract_row or billing_row or {}).get("id_pedido", "")
            nome_pedido     = (contract_row or billing_row or {}).get("nome_pedido", "")

            # ── Regra 1: Pacote Adicional ──────────────────────
            if tipo_item == "Pcte.Adicional":
                if not _is_claro(operadora_nossa):
                    results["pcte_adicional_indevido"].append({
                        "msisdn":        msisdn,
                        "iccid":         iccid,
                        "operadora":     operadora_nossa or operadora_f,
                        "operadora_forn": operadora_f,
                        "id_pedido":     id_pedido,
                        "nome_pedido":   nome_pedido,
                        "pacote_forn":   pacote,
                        "status_forn":   status_forn,
                        "dias_forn":     dias_forn,
                        "valor_contrato": 0,
                        "valor_esperado": 0,
                        "valor_produto":  vl_produto,
                        "valor_faturado": vl_faturado,
                        "valor_excedente": vl_excedente,
                        "valor_diferenca": vl_faturado,
                        "observacao": f"Pcte.Adicional cobrado para operadora {operadora_nossa or operadora_f} (não é Claro)",
                    })
                continue  # Pcte.Adicional não passa pelas demais regras

            # ── Regra 2: Linha não encontrada / Transferência ──
            if not billing_row and not contract_row:
                # Tenta identificar pela ordem de pedido
                order_id = _extract_order_id(pacote) or _extract_order_id(nome_pedido)
                order_billing = billing_order_map.get(str(order_id)) if order_id else None

                if _is_transfer(pacote) or _is_transfer(nome_pedido) or order_billing:
                    results["transferencia"].append({
                        "msisdn":         msisdn,
                        "operadora_forn": operadora_f,
                        "id_pedido":      order_id or id_pedido,
                        "pacote_forn":    pacote,
                        "status_forn":    status_forn,
                        "dias_forn":      dias_forn,
                        "valor_faturado": vl_faturado,
                        "valor_produto":  vl_produto,
                        "observacao":     f"Possível transferência — verificar manualmente. Order: {order_id}",
                    })
                else:
                    results["linha_nao_identificada"].append({
                        "msisdn":         msisdn,
                        "operadora_forn": operadora_f,
                        "id_pedido":      id_pedido,
                        "pacote_forn":    pacote,
                        "status_forn":    status_forn,
                        "dias_forn":      dias_forn,
                        "valor_faturado": vl_faturado,
                        "valor_produto":  vl_produto,
                        "observacao":     "MSISDN não encontrado no inventário ou contratos",
                    })
                continue

            # ── Regra 3: Valor acima do contrato ──────────────
            mensalidade_custo = float((contract_row or {}).get("mensalidade", 0) or 0)

            if mensalidade_custo > 0 and self.total_dias > 0:
                # Valor esperado = mensalidade × (dias_faturados / total_dias_mês)
                valor_esperado = round(mensalidade_custo / self.total_dias * dias_forn, 4)
            else:
                valor_esperado = 0

            diferenca = round(vl_faturado - valor_esperado, 4)

            # Tolera diferença de até 1 centavo (arredondamentos)
            if diferenca > 0.01:
                results["valor_acima_contrato"].append({
                    "msisdn":          msisdn,
                    "iccid":           iccid,
                    "operadora":       operadora_nossa,
                    "operadora_forn":  operadora_f,
                    "id_pedido":       id_pedido,
                    "nome_pedido":     nome_pedido,
                    "pacote_forn":     pacote,
                    "status_forn":     status_forn,
                    "dias_forn":       dias_forn,
                    "valor_contrato":  mensalidade_custo,
                    "valor_esperado":  valor_esperado,
                    "valor_produto":   vl_produto,
                    "valor_faturado":  vl_faturado,
                    "valor_excedente": vl_excedente,
                    "valor_diferenca": diferenca,
                    "observacao": (
                        f"Valor faturado R${vl_faturado:.2f} > esperado R${valor_esperado:.2f} "
                        f"(contrato R${mensalidade_custo:.2f} × {dias_forn}/{self.total_dias} dias)"
                    ),
                })

        # ── Totais ────────────────────────────────────────────
        def sum_diff(items):
            return round(sum(float(i.get("valor_diferenca") or i.get("valor_faturado") or 0) for i in items), 2)

        results["totais"] = {
            "valor_acima_contrato":    sum_diff(results["valor_acima_contrato"]),
            "pcte_adicional_indevido": sum_diff(results["pcte_adicional_indevido"]),
            "linha_nao_identificada":  sum_diff(results["linha_nao_identificada"]),
            "transferencia":           sum_diff(results["transferencia"]),
            "total_contestado": round(
                sum_diff(results["valor_acima_contrato"]) +
                sum_diff(results["pcte_adicional_indevido"]) +
                sum_diff(results["linha_nao_identificada"]),
                2
            ),
        }

        print(f"\n  === RESULTADO ===")
        print(f"  Valor acima contrato   : {len(results['valor_acima_contrato']):,} itens — R$ {results['totais']['valor_acima_contrato']:,.2f}")
        print(f"  Pcte.Adicional indevido: {len(results['pcte_adicional_indevido']):,} itens — R$ {results['totais']['pcte_adicional_indevido']:,.2f}")
        print(f"  Linha não identificada : {len(results['linha_nao_identificada']):,} itens — R$ {results['totais']['linha_nao_identificada']:,.2f}")
        print(f"  Transferências         : {len(results['transferencia']):,} itens (verificar)")
        print(f"  CS informativo         : R$ {valor_cs:,.2f}")
        print(f"  TOTAL A CONTESTAR      : R$ {results['totais']['total_contestado']:,.2f}")

        return results

    # ── Loaders ───────────────────────────────────────────────

    def _load_billing(self, data: bytes) -> pd.DataFrame:
        """Carrega nossa base de faturamento — extrai MSISDN, operadora, ID pedido."""
        df = pd.read_excel(io.BytesIO(data), sheet_name="Inventário", engine="openpyxl",
                           dtype={"MSISDN": str, "ICCID": str, "CPF/CNPJ": str})
        df = df.rename(columns={
            "MSISDN":           "msisdn",
            "Operadora":        "operadora",
            "ICCID":            "iccid",
            "ID":               "id_linha",
            "Nome do pedido":   "nome_pedido",
        })
        df["msisdn_norm"] = df["msisdn"].apply(_normalize_msisdn)
        df["id_pedido"]   = df["nome_pedido"].apply(_extract_order_id)
        return df[["msisdn_norm", "operadora", "iccid", "id_linha", "nome_pedido", "id_pedido"]].dropna(subset=["msisdn_norm"])

    def _load_supplier(self, data: bytes) -> pd.DataFrame:
        """Carrega a aba BILLING do arquivo xlsb do fornecedor."""
        df = pd.DataFrame()
        try:
            from pyxlsb import open_workbook
            rows = []
            headers = None
            with open_workbook(io.BytesIO(data)) as wb:
                sheet_name = "BILLING" if "BILLING" in wb.sheets else wb.sheets[0]
                with wb.get_sheet(sheet_name) as ws:
                    for i, row in enumerate(ws.rows()):
                        vals = [c.v for c in row]
                        if i == 0:
                            headers = vals
                        else:
                            rows.append(vals)
            df = pd.DataFrame(rows, columns=headers)
            print(f"  [fornecedor BILLING] {len(df)} linhas (xlsb/{sheet_name})", flush=True)
        except Exception as _e1:
            try:
                xl = pd.ExcelFile(io.BytesIO(data))
                sheet_name = "BILLING" if "BILLING" in xl.sheet_names else xl.sheet_names[0]
                df = pd.read_excel(io.BytesIO(data), sheet_name=sheet_name, engine="openpyxl")
                print(f"  [fornecedor BILLING] {len(df)} linhas (xlsx/{sheet_name})", flush=True)
            except Exception as _e2:
                print(f"  [fornecedor BILLING] erro: {_e1} / {_e2}", flush=True)

        # Normaliza nomes de colunas
        col_map = {
            "Msisdn":            "msisdn",
            "Simcard":           "iccid",
            "Status Terminal":   "status_terminal",
            "Dias Faturados":    "dias_faturados",
            "Pacote":            "pacote",
            "Valor Produto":     "valor_produto",
            "Valor Faturado":    "valor_faturado",
            "Valor Excedente":   "valor_excedente",
            "Operadora":         "operadora",
            "Tipo Item":         "tipo_item",
            "Contrato":          "contrato",
        }
        df = df.rename(columns=col_map)

        for col in ["valor_faturado", "valor_produto", "valor_excedente"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        if "dias_faturados" in df.columns:
            df["dias_faturados"] = pd.to_numeric(df["dias_faturados"], errors="coerce").fillna(self.total_dias)

        df["msisdn_norm"] = df["msisdn"].apply(_normalize_msisdn) if "msisdn" in df.columns else None
        return df

    def _load_contracts(self, data: bytes) -> pd.DataFrame:
        """
        Carrega a tabela de contratos (inventory export do fornecedor).
        Colunas chave: MSISDN, ID do pedido, Mensalidade (custo), Operadora, ICCID.
        """
        df = pd.read_excel(io.BytesIO(data), sheet_name="Inventário", engine="openpyxl",
                           dtype={"MSISDN": str, "ICCID": str})
        col_map = {
            "MSISDN":         "msisdn",
            "Mensalidade":    "mensalidade",
            "Operadora":      "operadora",
            "ICCID":          "iccid",
            "Nome do pedido": "nome_pedido",
            "ID do pedido":   "id_pedido",
        }
        df = df.rename(columns=col_map)

        if "mensalidade" in df.columns:
            df["mensalidade"] = pd.to_numeric(df["mensalidade"], errors="coerce").fillna(0)

        df["msisdn_norm"] = df["msisdn"].apply(_normalize_msisdn) if "msisdn" in df.columns else None
        df["id_pedido"]   = df.get("id_pedido", pd.Series(dtype=str)).apply(
            lambda x: str(int(float(x))) if pd.notna(x) and str(x).replace('.','').isdigit() else str(x) if pd.notna(x) else None
        )
        return df[["msisdn_norm", "mensalidade", "operadora", "iccid", "nome_pedido", "id_pedido"]].dropna(subset=["msisdn_norm"])

    def _load_supplier_sms(self, data: bytes) -> pd.DataFrame:
        """Carrega a aba SMS do arquivo do fornecedor."""
        try:
            from pyxlsb import open_workbook
            rows = []
            headers = None
            with open_workbook(io.BytesIO(data)) as wb:
                with wb.get_sheet("SMS") as ws:
                    for i, row in enumerate(ws.rows()):
                        vals = [c.v for c in row]
                        if i == 0:
                            headers = vals
                        else:
                            rows.append(vals)
            return pd.DataFrame(rows, columns=headers) if rows else pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    def _load_cs_value(self, data: bytes) -> float:
        """Extrai o valor de CS da aba TOTAL."""
        try:
            from pyxlsb import open_workbook
            with open_workbook(io.BytesIO(data)) as wb:
                with wb.get_sheet("TOTAL") as ws:
                    for row in ws.rows():
                        vals = [c.v for c in row]
                        if vals and str(vals[0]).upper() == "CS":
                            return float(vals[1] or 0)
        except Exception:
            pass
        return 0.0
