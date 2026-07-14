"""
Integração com a API do Asaas — somente leitura.
Consulta boletos e atualiza status no banco.
"""
import asyncio
import httpx
from typing import Optional
from datetime import datetime, timezone
from app.config import settings

# ─── Cache em memória (TTL 30 minutos) ────────────────────────────────────────
_cache: dict = {}  # key → {"data": [...], "ts": timestamp}
_CACHE_TTL = 1800  # segundos


def _cache_get(key: str):
    entry = _cache.get(key)
    if not entry:
        return None
    age = (datetime.now(timezone.utc).timestamp() - entry["ts"])
    if age > _CACHE_TTL:
        del _cache[key]
        return None
    return entry["data"]


def _cache_set(key: str, data):
    _cache[key] = {"data": data, "ts": datetime.now(timezone.utc).timestamp()}


class AsaasClient:
    def __init__(self, api_key: str = None, base_url: str = None):
        self.base_url = base_url or settings.ASAAS_BASE_URL
        self.headers  = {
            "access_token": api_key or settings.ASAAS_API_KEY or "",
            "Content-Type": "application/json",
        }

    async def get_customer(self, cpf_cnpj: str) -> Optional[dict]:
        """Busca cliente no Asaas por CPF/CNPJ."""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/customers",
                params={"cpfCnpj": cpf_cnpj},
                headers=self.headers,
                timeout=10.0,
            )
            r.raise_for_status()
            data = r.json()
            if data.get("data"):
                return data["data"][0]
            return None

    async def get_customer_by_id(self, customer_id: str) -> Optional[dict]:
        """Busca cliente no Asaas pelo ID (com cache de 30 min)."""
        cache_key = f"customer_{customer_id}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{self.base_url}/customers/{customer_id}",
                headers=self.headers,
            )
            if r.status_code == 404:
                return None
            r.raise_for_status()
            data = r.json()
        _cache_set(cache_key, data)
        return data

    async def get_payment(self, payment_id: str) -> Optional[dict]:
        """Busca uma cobrança pelo ID."""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/payments/{payment_id}",
                headers=self.headers,
                timeout=10.0,
            )
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()

    async def list_payments(
        self,
        cpf_cnpj: str = None,
        customer_id: str = None,
        due_date_gte: str = None,
        due_date_lte: str = None,
    ) -> list:
        """Lista cobranças com filtros."""
        params = {}
        if customer_id:
            params["customer"] = customer_id
        if due_date_gte:
            params["dueDate[ge]"] = due_date_gte
        if due_date_lte:
            params["dueDate[le]"] = due_date_lte

        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/payments",
                params=params,
                headers=self.headers,
                timeout=15.0,
            )
            r.raise_for_status()
            return r.json().get("data", [])

    async def get_month_payments(self, year: int, month: int) -> list:
        """
        Busca TODOS os pagamentos do Asaas para o mês/ano informado.
        Busca a página 0, calcula o total de páginas e faz fetch paralelo das demais.
        Cache de 30 minutos.
        """
        import calendar
        cache_key = f"month_{year}_{month}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        last_day = calendar.monthrange(year, month)[1]
        due_gte  = f"{year}-{month:02d}-01"
        due_lte  = f"{year}-{month:02d}-{last_day:02d}"
        limit    = 100

        base_params = {
            "dueDate[ge]": due_gte,
            "dueDate[le]": due_lte,
            "limit":       limit,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Página 0 — obtém dados + totalCount
            r0 = await client.get(
                f"{self.base_url}/payments",
                params={**base_params, "offset": 0},
                headers=self.headers,
            )
            r0.raise_for_status()
            body0 = r0.json()
            all_payments = list(body0.get("data", []))
            total_count  = body0.get("totalCount", len(all_payments))

            # Calcula offsets das páginas restantes
            remaining_offsets = list(range(limit, total_count, limit))

            if remaining_offsets:
                sem = asyncio.Semaphore(5)  # máx 5 requests simultâneos ao Asaas

                async def fetch_page(offset: int) -> list:
                    async with sem:
                        r = await client.get(
                            f"{self.base_url}/payments",
                            params={**base_params, "offset": offset},
                            headers=self.headers,
                        )
                        r.raise_for_status()
                        return r.json().get("data", [])

                pages = await asyncio.gather(*[fetch_page(off) for off in remaining_offsets])
                for page in pages:
                    all_payments.extend(page)

        _cache_set(cache_key, all_payments)
        return all_payments

    async def get_boleto_url(self, payment_id: str) -> Optional[str]:
        """Retorna a URL do boleto bancário."""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/payments/{payment_id}/identificationField",
                headers=self.headers,
                timeout=10.0,
            )
            if r.status_code != 200:
                return None
            data = r.json()
            return data.get("invoiceUrl") or data.get("bankSlipUrl")


# ─── Dependency ───────────────────────────────────────────────────────────────

def get_asaas_client(db=None) -> AsaasClient:
    """
    Fábrica que lê a chave e URL do banco (system_settings).
    Usa o .env como fallback se não houver nada no banco.
    """
    if db is None:
        return AsaasClient()
    try:
        from app.routers.settings import _get as _get_setting
        key = _get_setting(db, "asaas_api_key") or settings.ASAAS_API_KEY
        url = _get_setting(db, "asaas_base_url") or settings.ASAAS_BASE_URL
        return AsaasClient(api_key=key, base_url=url)
    except Exception:
        return AsaasClient()


# ─── Router ───────────────────────────────────────────────────────────────────
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, BillingClientSummary
from app.routers.auth import get_current_user

router = APIRouter(prefix="/asaas", tags=["Asaas"])


@router.get("/payments/{id_smart}")
async def get_client_payments(
    id_smart: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Busca pagamentos do cliente no Asaas pelo ss_ID."""
    client = get_asaas_client(db)
    cpf_cnpj = id_smart.replace("ss_", "")
    customer = await client.get_customer(cpf_cnpj)
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado no Asaas")

    payments = await client.list_payments(customer_id=customer["id"])
    return {
        "customer": {
            "id":     customer["id"],
            "name":   customer.get("name"),
            "email":  customer.get("email"),
        },
        "payments": [
            {
                "id":         p["id"],
                "value":      p["value"],
                "netValue":   p.get("netValue"),
                "dueDate":    p["dueDate"],
                "status":     p["status"],
                "invoiceUrl": p.get("invoiceUrl"),
                "bankSlipUrl": p.get("bankSlipUrl"),
                "description": p.get("description"),
            }
            for p in payments
        ]
    }


@router.get("/month-summary")
async def get_month_summary(
    year:  int = Query(...),
    month: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Resumo financeiro do mês a partir dos dados reais do Asaas.
    """
    from datetime import date, timedelta
    import calendar

    asaas = get_asaas_client(db)
    payments = await asaas.get_month_payments(year, month)

    hoje = date.today()
    last_day = calendar.monthrange(year, month)[1]

    # Normaliza billingType: UNDEFINED → PIX
    def billing_type(p):
        bt = p.get("billingType") or "UNDEFINED"
        return "PIX" if bt in ("UNDEFINED", None, "") else bt

    # ── Totais base ────────────────────────────────────────────
    emitido   = sum(p.get("value", 0) for p in payments)
    qtd_emitido = len(payments)

    received_statuses = ("RECEIVED", "CONFIRMED")
    recebidos  = [p for p in payments if p.get("status") in received_statuses]
    vencidos   = [p for p in payments if p.get("status") == "OVERDUE"]
    pendentes  = [p for p in payments if p.get("status") == "PENDING"]

    recebido = sum(p.get("netValue") or p.get("value", 0) for p in recebidos)
    vencido  = sum(p.get("value", 0) for p in vencidos)
    pendente = sum(p.get("value", 0) for p in pendentes)
    qtd_recebido = len(recebidos)
    qtd_vencido  = len(vencidos)

    # ── Por instrumento ────────────────────────────────────────
    por_instrumento: dict = {}
    for p in payments:
        bt = billing_type(p)
        if bt not in por_instrumento:
            por_instrumento[bt] = {"recebido": 0.0, "vencido": 0.0, "pendente": 0.0}
        status = p.get("status")
        if status in received_statuses:
            por_instrumento[bt]["recebido"] += p.get("netValue") or p.get("value", 0)
        elif status == "OVERDUE":
            por_instrumento[bt]["vencido"] += p.get("value", 0)
        elif status == "PENDING":
            por_instrumento[bt]["pendente"] += p.get("value", 0)

    # ── Por dia de crédito ─────────────────────────────────────
    por_dia: dict = {}
    for p in recebidos:
        cd = p.get("creditDate") or ""
        if cd and cd.startswith(f"{year}-{month:02d}"):
            dia = cd[8:10]
            por_dia[dia] = round(por_dia.get(dia, 0) + (p.get("netValue") or p.get("value", 0)), 2)

    por_dia_credito = [{"dia": k, "valor": v} for k, v in sorted(por_dia.items())]

    # ── Comportamento de pagamento ─────────────────────────────
    antes_qtd = nodia_qtd = apos_qtd = 0
    for p in recebidos:
        credit_str = p.get("creditDate") or p.get("paymentDate") or ""
        due_str    = p.get("dueDate") or ""
        if not credit_str or not due_str:
            continue
        try:
            credit_date = date.fromisoformat(credit_str[:10])
            due_date    = date.fromisoformat(due_str[:10])
            diff = (due_date - credit_date).days
            if diff > 0:
                antes_qtd += 1
            elif diff == 0:
                nodia_qtd += 1
            else:
                apos_qtd += 1
        except Exception:
            continue

    total_pag = (antes_qtd + nodia_qtd + apos_qtd) or 1
    comportamento = {
        "antes_pct": round(antes_qtd / total_pag * 100, 1),
        "nodia_pct": round(nodia_qtd / total_pag * 100, 1),
        "apos_pct":  round(apos_qtd  / total_pag * 100, 1),
        "antes_qtd": antes_qtd,
        "nodia_qtd": nodia_qtd,
        "apos_qtd":  apos_qtd,
    }

    # ── Donut ──────────────────────────────────────────────────
    donut = [
        {"name": "Recebida",  "value": round(recebido, 2), "color": "#1E9B6B"},
        {"name": "Vencida",   "value": round(vencido,  2), "color": "#ef4444"},
        {"name": "Pendente",  "value": round(pendente, 2), "color": "#f59e0b"},
    ]

    # ── Aging ──────────────────────────────────────────────────
    BUCKETS = [
        {"label": "1–3 dias",  "min": 1,  "max": 3,    "acao": "Disparo de régua automática"},
        {"label": "4–7 dias",  "min": 4,  "max": 7,    "acao": "Contato direto por telefone"},
        {"label": "8–15 dias", "min": 8,  "max": 15,   "acao": "Bloqueio de serviço"},
        {"label": "> 30 dias", "min": 30, "max": 9999,  "acao": "Escalonamento jurídico"},
    ]
    aging = []
    for b in BUCKETS:
        bucket = []
        for p in vencidos:
            due_str = p.get("dueDate") or ""
            if not due_str:
                continue
            try:
                due_date = date.fromisoformat(due_str[:10])
                dias = (hoje - due_date).days
                if b["min"] <= dias <= b["max"]:
                    bucket.append(p)
            except Exception:
                continue
        val = sum(p.get("value", 0) for p in bucket)
        aging.append({
            "bucket": b["label"],
            "qtd":    len(bucket),
            "valor":  round(val, 2),
            "pct":    round(val / vencido * 100, 1) if vencido else 0,
            "acao":   b["acao"],
        })

    # ── Por semana ─────────────────────────────────────────────
    def week_of_day(day: int) -> str:
        if day <= 7:  return "W1"
        if day <= 14: return "W2"
        if day <= 21: return "W3"
        return "W4"

    por_semana: dict = {
        "W1": {"planejado": 0.0, "realizado": 0.0, "label": "01–07"},
        "W2": {"planejado": 0.0, "realizado": 0.0, "label": "08–14"},
        "W3": {"planejado": 0.0, "realizado": 0.0, "label": "15–21"},
        "W4": {"planejado": 0.0, "realizado": 0.0, "label": f"22–{last_day:02d}"},
    }

    for p in payments:
        due_str = p.get("dueDate") or ""
        if not due_str:
            continue
        try:
            due_date = date.fromisoformat(due_str[:10])
            if due_date.year == year and due_date.month == month:
                wk = week_of_day(due_date.day)
                por_semana[wk]["planejado"] += p.get("value", 0)
        except Exception:
            continue

    for p in recebidos:
        cd = p.get("creditDate") or ""
        if cd and cd.startswith(f"{year}-{month:02d}"):
            try:
                day = int(cd[8:10])
                wk = week_of_day(day)
                por_semana[wk]["realizado"] += p.get("netValue") or p.get("value", 0)
            except Exception:
                continue

    # Round
    for wk in por_semana.values():
        wk["planejado"] = round(wk["planejado"], 2)
        wk["realizado"] = round(wk["realizado"], 2)

    # ── Acumulado diário ───────────────────────────────────────
    # Planejado = soma cumulativa de dueDate por dia
    # Realizado = soma cumulativa de creditDate por dia
    plan_por_dia: dict = {}
    real_por_dia: dict = {}

    for p in payments:
        due_str = p.get("dueDate") or ""
        if due_str.startswith(f"{year}-{month:02d}"):
            day = int(due_str[8:10])
            plan_por_dia[day] = plan_por_dia.get(day, 0) + p.get("value", 0)

    for p in recebidos:
        cd = p.get("creditDate") or ""
        if cd.startswith(f"{year}-{month:02d}"):
            day = int(cd[8:10])
            real_por_dia[day] = real_por_dia.get(day, 0) + (p.get("netValue") or p.get("value", 0))

    acumulado_diario = []
    cum_plan = 0.0
    cum_real = 0.0
    for d in range(1, last_day + 1):
        cum_plan += plan_por_dia.get(d, 0)
        cum_real += real_por_dia.get(d, 0)
        acumulado_diario.append({
            "dia":       f"{d:02d}",
            "Planejado": round(cum_plan, 2),
            "Realizado": round(cum_real, 2),
        })

    return {
        "periodo":         f"{month:02d}/{year}",
        "emitido":         round(emitido, 2),
        "recebido":        round(recebido, 2),
        "vencido":         round(vencido, 2),
        "pendente":        round(pendente, 2),
        "qtd_emitido":     qtd_emitido,
        "qtd_recebido":    qtd_recebido,
        "qtd_vencido":     qtd_vencido,
        "por_instrumento": por_instrumento,
        "por_dia_credito": por_dia_credito,
        "comportamento":   comportamento,
        "donut":           donut,
        "aging":           aging,
        "por_semana":      por_semana,
        "acumulado_diario": acumulado_diario,
    }


@router.post("/cycles/{cycle_id}/sync-boletos")
async def sync_boletos(
    cycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Sincroniza o status dos boletos do Asaas para um ciclo.
    Busca por CPF/CNPJ de cada cliente (não depende de asaas_boleto_id).
    Atualiza boleto_status, boleto_url e asaas_boleto_id em BillingClientSummary.
    """
    from app.models import BillingCycle
    cycle = db.query(BillingCycle).filter(BillingCycle.id == cycle_id).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Ciclo não encontrado")

    asaas = get_asaas_client(db)

    summaries = db.query(BillingClientSummary).filter(
        BillingClientSummary.cycle_id == cycle_id,
        BillingClientSummary.total_final > 0,
    ).all()

    if not summaries:
        return {"message": "Nenhum cliente para sincronizar", "updated": 0, "not_found": 0}

    # Janela de vencimento: mês do ciclo ± 60 dias para cobrir boletos emitidos
    from datetime import date
    import calendar
    last_day = calendar.monthrange(cycle.year, cycle.month)[1]
    due_gte  = date(cycle.year, cycle.month, 1).isoformat()
    due_lte  = date(cycle.year, cycle.month, last_day).isoformat()

    updated   = 0
    not_found = 0

    for summary in summaries:
        if not summary.id_smart:
            continue
        cpf_cnpj = summary.id_smart.replace("ss_", "")
        try:
            customer = await asaas.get_customer(cpf_cnpj)
            if not customer:
                not_found += 1
                continue

            payments = await asaas.list_payments(
                customer_id=customer["id"],
                due_date_gte=due_gte,
                due_date_lte=due_lte,
            )
            if not payments:
                not_found += 1
                continue

            # Pega o boleto mais recente do período
            p = payments[0]
            summary.asaas_boleto_id = p.get("id")
            summary.boleto_status   = p.get("status")
            summary.boleto_url      = p.get("invoiceUrl") or p.get("bankSlipUrl")
            updated += 1
        except Exception:
            not_found += 1
            continue

    db.commit()
    return {"message": f"{updated} boletos sincronizados", "updated": updated, "not_found": not_found}
