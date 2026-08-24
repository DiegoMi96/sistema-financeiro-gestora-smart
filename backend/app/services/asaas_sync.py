"""
Sync periódico Asaas → banco local.
Roda como background task a cada 20 minutos.
Sincroniza os últimos 3 meses de pagamentos e os clientes referenciados.
"""
import asyncio
import calendar
from datetime import date, datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal

SYNC_INTERVAL = 60 * 60   # 1 hora
MONTHS_BACK   = 2          # mês atual + anterior
PAGE_SIZE     = 100
MAX_PARALLEL  = 3          # semáforo para requests paralelos ao Asaas

# Uvicorn roda com --workers 2 (ver Dockerfile) — cada worker é um processo
# separado que chama sync_loop() de forma independente no startup. Sem esse
# lock, os 2 workers disparavam o sync AO MESMO TEMPO, dobrando as chamadas
# ao Asaas bem no momento de maior risco (todo restart/deploy) — causa raiz
# dos 429 "toda hora" relatados pelo Diego em 01/08/2026. Advisory lock do
# Postgres garante que só um worker de cada vez executa o sync de verdade;
# o outro só constata que já está rodando e sai sem fazer nenhuma chamada.
_SYNC_LOCK_KEY = 727272


async def _get_with_backoff(client: httpx.AsyncClient, url: str, *, headers: dict,
                             params: dict | None = None, timeout: float = 15.0,
                             max_retries: int = 3) -> httpx.Response:
    """GET com retry/backoff em 429 (rate limit do Asaas). Antes, um 429 no meio
    do sync era só descartado silenciosamente (ver asyncio.gather com
    return_exceptions=True) — o dado daquela página/cliente simplesmente
    sumia sem re-tentativa nenhuma."""
    wait = 3.0
    r = None
    for attempt in range(max_retries + 1):
        r = await client.get(url, headers=headers, params=params, timeout=timeout)
        if r.status_code != 429 or attempt == max_retries:
            return r
        retry_after = r.headers.get("Retry-After")
        await asyncio.sleep(float(retry_after) if retry_after else wait)
        wait *= 2
    return r


# ─── helpers ───────────────────────────────────────────────────────────────

def _get_api_key(db: Session) -> Optional[str]:
    try:
        row = db.execute(text(
            "SELECT value FROM system_settings WHERE key = 'asaas_api_key' LIMIT 1"
        )).fetchone()
        if row and row.value:
            return row.value
    except Exception:
        pass
    from app.config import settings
    return getattr(settings, "ASAAS_API_KEY", None)


def _get_base_url(db: Session) -> str:
    try:
        row = db.execute(text(
            "SELECT value FROM system_settings WHERE key = 'asaas_base_url' LIMIT 1"
        )).fetchone()
        if row and row.value:
            return row.value.rstrip("/")
    except Exception:
        pass
    from app.config import settings
    return getattr(settings, "ASAAS_BASE_URL", "https://api.asaas.com/v3")


def _months_to_sync():
    today = date.today()
    result = []
    y, m = today.year, today.month
    for _ in range(MONTHS_BACK):
        result.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return result


# ─── fetch helpers ─────────────────────────────────────────────────────────

async def _fetch_payments_month(client: httpx.AsyncClient, headers: dict,
                                base_url: str, year: int, month: int) -> list:
    last_day = calendar.monthrange(year, month)[1]
    params = {
        "dueDate[ge]": f"{year}-{month:02d}-01",
        "dueDate[le]": f"{year}-{month:02d}-{last_day:02d}",
        "limit": PAGE_SIZE,
        "offset": 0,
    }
    r0 = await _get_with_backoff(client, f"{base_url}/payments", params=params, headers=headers, timeout=30.0)
    r0.raise_for_status()
    body0 = r0.json()
    all_payments = list(body0.get("data", []))
    total = body0.get("totalCount", len(all_payments))

    offsets = list(range(PAGE_SIZE, total, PAGE_SIZE))
    if offsets:
        sem = asyncio.Semaphore(MAX_PARALLEL)
        async def _page(off):
            async with sem:
                r = await _get_with_backoff(
                    client,
                    f"{base_url}/payments",
                    params={**params, "offset": off},
                    headers=headers,
                    timeout=30.0,
                )
                r.raise_for_status()
                return r.json().get("data", [])
        pages = await asyncio.gather(*[_page(o) for o in offsets], return_exceptions=True)
        for p in pages:
            if isinstance(p, list):
                all_payments.extend(p)

    return all_payments


async def _fetch_customer(client: httpx.AsyncClient, headers: dict,
                          base_url: str, customer_id: str) -> Optional[dict]:
    try:
        r = await _get_with_backoff(client, f"{base_url}/customers/{customer_id}", headers=headers, timeout=10.0)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


# ─── upsert ────────────────────────────────────────────────────────────────

def _upsert_customers(db: Session, customers: dict):
    """customers: {asaas_id: {name, cpfCnpj, email, phone, address, ...}}"""
    if not customers:
        return
    now = datetime.now(timezone.utc)
    for cid, info in customers.items():
        i = info or {}
        db.execute(text("""
            INSERT INTO asaas_customers_sync (
                asaas_id, external_reference, name, cpf_cnpj, email,
                phone, mobile_phone, postal_code,
                address, address_number, complement, province, city, state,
                synced_at
            )
            VALUES (
                :asaas_id, :ext_ref, :name, :cpf_cnpj, :email,
                :phone, :mobile_phone, :postal_code,
                :address, :address_number, :complement, :province, :city, :state,
                :now
            )
            ON CONFLICT (asaas_id) DO UPDATE SET
                external_reference = EXCLUDED.external_reference,
                name               = EXCLUDED.name,
                cpf_cnpj           = EXCLUDED.cpf_cnpj,
                email              = EXCLUDED.email,
                phone              = EXCLUDED.phone,
                mobile_phone       = EXCLUDED.mobile_phone,
                postal_code        = EXCLUDED.postal_code,
                address            = EXCLUDED.address,
                address_number     = EXCLUDED.address_number,
                complement         = EXCLUDED.complement,
                province           = EXCLUDED.province,
                city               = EXCLUDED.city,
                state              = EXCLUDED.state,
                synced_at          = EXCLUDED.synced_at
        """), {
            "asaas_id":       cid,
            "ext_ref":        i.get("externalReference"),
            "name":           i.get("name"),
            "cpf_cnpj":       i.get("cpfCnpj"),
            "email":          i.get("email"),
            "phone":          i.get("phone"),
            "mobile_phone":   i.get("mobilePhone"),
            "postal_code":    i.get("postalCode"),
            "address":        i.get("address"),
            "address_number": i.get("addressNumber"),
            "complement":     i.get("complement"),
            "province":       i.get("province"),
            "city":           i.get("cityName") or (str(i["city"]) if i.get("city") else None),
            "state":          i.get("state"),
            "now":            now,
        })


def _upsert_payments(db: Session, payments: list, customers: dict):
    now = datetime.now(timezone.utc)
    for p in payments:
        cid  = p.get("customer") or ""
        cust = customers.get(cid) or {}

        def _d(s):
            if not s:
                return None
            try:
                return date.fromisoformat(s[:10])
            except Exception:
                return None

        db.execute(text("""
            INSERT INTO asaas_payments_sync (
                asaas_id, customer_id, customer_name, customer_cpf_cnpj,
                value, value_original, net_value, due_date, payment_date, credit_date,
                status, billing_type, description, external_reference,
                invoice_url, invoice_number, synced_at
            ) VALUES (
                :asaas_id, :customer_id, :customer_name, :customer_cpf_cnpj,
                :value, :value_original, :net_value, :due_date, :payment_date, :credit_date,
                :status, :billing_type, :description, :external_reference,
                :invoice_url, :invoice_number, :now
            )
            ON CONFLICT (asaas_id) DO UPDATE SET
                customer_name     = EXCLUDED.customer_name,
                customer_cpf_cnpj = EXCLUDED.customer_cpf_cnpj,
                value             = EXCLUDED.value,
                value_original    = EXCLUDED.value_original,
                net_value         = EXCLUDED.net_value,
                due_date          = EXCLUDED.due_date,
                payment_date      = EXCLUDED.payment_date,
                credit_date       = EXCLUDED.credit_date,
                status            = EXCLUDED.status,
                billing_type      = EXCLUDED.billing_type,
                description       = EXCLUDED.description,
                external_reference= EXCLUDED.external_reference,
                invoice_url       = EXCLUDED.invoice_url,
                invoice_number    = EXCLUDED.invoice_number,
                synced_at         = EXCLUDED.synced_at
        """), {
            "asaas_id":          p.get("id"),
            "customer_id":       cid or None,
            "customer_name":     cust.get("name"),
            "customer_cpf_cnpj": cust.get("cpfCnpj"),
            "value":             p.get("value"),
            "value_original":    p.get("originalValue"),
            "net_value":         p.get("netValue"),
            "due_date":          _d(p.get("dueDate")),
            "payment_date":      _d(p.get("paymentDate")),
            "credit_date":       _d(p.get("creditDate")),
            "status":            p.get("status"),
            "billing_type":      p.get("billingType"),
            "description":       p.get("description"),
            "external_reference": p.get("externalReference"),
            "invoice_url":       p.get("invoiceUrl"),
            "invoice_number":    (str(p.get("invoiceNumber")) if p.get("invoiceNumber") is not None else None),
            "now":               now,
        })


def _delete_missing_payments(db: Session, months_payments: dict) -> int:
    """
    Remove de asaas_payments_sync os boletos que não vieram mais na resposta
    da API pra aquele mês. O Asaas não tem status "DELETED" — quando um
    boleto é excluído, ele simplesmente some da listagem de /payments. Como
    o sync antes só fazia upsert do que recebia, um boleto excluído no Asaas
    ficava congelado pra sempre no banco local (reportado pelo Diego em
    24/08/2026 — "Lista de Vencidos" e previsão continuavam mostrando
    boletos já excluídos). Mesmo padrão já usado pro upload do Itaú
    (analyst.py: DELETE ... WHERE nosso_numero NOT IN ...).

    Só compara meses cuja busca teve sucesso E devolveu pelo menos 1
    pagamento — nunca contra um mês vazio (falha silenciosa da API
    devolvendo 200 com lista vazia apagaria TODOS os boletos daquele mês).
    """
    total_deleted = 0
    for (y, m), payments in months_payments.items():
        if not payments:
            print(f"  ⚠️  {m:02d}/{y}: API devolveu 0 pagamentos — pulando limpeza de excluídos (possível falha silenciosa)", flush=True)
            continue
        fresh_ids = [p["id"] for p in payments if p.get("id")]
        last_day = calendar.monthrange(y, m)[1]
        result = db.execute(text("""
            DELETE FROM asaas_payments_sync
            WHERE due_date >= :start AND due_date <= :end
              AND NOT (asaas_id = ANY(:ids))
        """), {
            "start": date(y, m, 1),
            "end":   date(y, m, last_day),
            "ids":   fresh_ids,
        })
        if result.rowcount:
            print(f"  🗑️  {m:02d}/{y}: {result.rowcount} boleto(s) removido(s) — excluído(s) no Asaas", flush=True)
        total_deleted += result.rowcount
    return total_deleted


# ─── sync principal ────────────────────────────────────────────────────────

async def run_sync() -> dict:
    db = SessionLocal()
    got_lock = False
    try:
        got_lock = bool(db.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": _SYNC_LOCK_KEY}
        ).scalar())
        if not got_lock:
            return {"status": "skipped", "reason": "sync já em execução em outro worker"}

        api_key  = _get_api_key(db)
        base_url = _get_base_url(db)
        if not api_key:
            return {"status": "skipped", "reason": "sem api_key"}

        headers = {"access_token": api_key, "Content-Type": "application/json"}
        months  = _months_to_sync()

        all_payments: list = []
        months_payments: dict = {}   # (year, month) -> lista de pagamentos, só dos meses com sucesso
        errors: list = []

        async with httpx.AsyncClient() as client:
            # 1) Busca pagamentos de cada mês em paralelo
            results = await asyncio.gather(
                *[_fetch_payments_month(client, headers, base_url, y, m) for y, m in months],
                return_exceptions=True,
            )
            for (y, m), res in zip(months, results):
                if isinstance(res, Exception):
                    errors.append(f"{m:02d}/{y}: {res}")
                else:
                    all_payments.extend(res)
                    months_payments[(y, m)] = res

            # 2) Busca apenas clientes ainda não conhecidos no banco
            all_cids = {p["customer"] for p in all_payments if p.get("customer")}

            # Quais já estão em asaas_customers_sync?
            if all_cids:
                rows = db.execute(text(
                    "SELECT asaas_id FROM asaas_customers_sync WHERE asaas_id = ANY(:ids)"
                ), {"ids": list(all_cids)}).fetchall()
                known_cids = {r.asaas_id for r in rows}
            else:
                known_cids = set()

            new_cids = list(all_cids - known_cids)
            print(f"  👥 Clientes: {len(all_cids)} total, {len(known_cids)} já no banco, {len(new_cids)} novos a buscar", flush=True)

            sem = asyncio.Semaphore(MAX_PARALLEL)
            async def _cust(cid):
                async with sem:
                    return cid, await _fetch_customer(client, headers, base_url, cid)

            customers = {}
            if new_cids:
                cust_results = await asyncio.gather(*[_cust(c) for c in new_cids], return_exceptions=True)
                customers = {
                    cid: info
                    for res in cust_results
                    if not isinstance(res, Exception)
                    for cid, info in [res]
                    if info
                }

            # Carregar clientes já conhecidos do banco — apenas para lookup nos pagamentos,
            # NÃO para re-upsert (evitar sobrescrever campos completos com dados mínimos)
            all_customers_lookup = dict(customers)  # começa com os novos (dados completos)
            if known_cids:
                existing = db.execute(text(
                    "SELECT asaas_id, name, cpf_cnpj FROM asaas_customers_sync WHERE asaas_id = ANY(:ids)"
                ), {"ids": list(known_cids)}).fetchall()
                for r in existing:
                    all_customers_lookup[r.asaas_id] = {"name": r.name, "cpfCnpj": r.cpf_cnpj}

        # 3) Persiste no banco — só os NOVOS (dados completos vindos da API)
        _upsert_customers(db, customers)
        _upsert_payments(db, all_payments, all_customers_lookup)

        # 3b) Remove boletos excluídos no Asaas (ver docstring de _delete_missing_payments)
        deleted_count = _delete_missing_payments(db, months_payments)

        # 4) Preenche customer_name nos pagamentos que ficaram sem nome
        db.execute(text("""
            UPDATE asaas_payments_sync p
            SET customer_name     = c.name,
                customer_cpf_cnpj = c.cpf_cnpj
            FROM asaas_customers_sync c
            WHERE p.customer_id = c.asaas_id
              AND p.customer_name IS NULL
        """))

        # 4b) Enriquece value_original para pagamentos recebidos com atraso — endpoint individual
        #     A API de lista não retorna originalValue para juros manuais; busca individual retorna.
        missing_orig = db.execute(text("""
            SELECT asaas_id FROM asaas_payments_sync
            WHERE status = 'RECEIVED'
              AND value_original IS NULL
              AND payment_date IS NOT NULL
              AND due_date IS NOT NULL
              AND payment_date > due_date
            ORDER BY payment_date DESC
            LIMIT 300
        """)).fetchall()

        if missing_orig and api_key:
            ids_to_enrich = [r.asaas_id for r in missing_orig]
            print(f"  💰 Enriquecendo originalValue de {len(ids_to_enrich)} pagamentos atrasados sem juros registrado...", flush=True)
            sem_enrich = asyncio.Semaphore(5)
            enriched = 0

            async with httpx.AsyncClient() as c_enrich:
                async def _fetch_payment_detail(asaas_id: str):
                    async with sem_enrich:
                        try:
                            r = await _get_with_backoff(
                                c_enrich,
                                f"{base_url}/payments/{asaas_id}",
                                headers=headers,
                                timeout=10.0,
                            )
                            if r.status_code == 200:
                                return asaas_id, r.json()
                        except Exception:
                            pass
                        return asaas_id, None

                detail_results = await asyncio.gather(
                    *[_fetch_payment_detail(pid) for pid in ids_to_enrich],
                    return_exceptions=True,
                )

            for res in detail_results:
                if isinstance(res, Exception):
                    continue
                asaas_id, detail = res
                if not detail:
                    continue
                orig_val = detail.get("originalValue")
                if orig_val and orig_val > 0:
                    val = detail.get("value") or 0
                    if val > orig_val:
                        db.execute(text("""
                            UPDATE asaas_payments_sync
                            SET value_original = :orig
                            WHERE asaas_id = :aid
                        """), {"orig": orig_val, "aid": asaas_id})
                        enriched += 1

            if enriched:
                print(f"  ✅ {enriched} pagamentos enriquecidos com originalValue", flush=True)

        # 5) Clientes do billing sem match por external_reference — busca pelo id_smart na API
        #    (garante que o cliente certo do Asaas é vinculado, mesmo que outro cliente
        #     com o mesmo cpf_cnpj já esteja no sync)
        missing_ids = db.execute(text("""
            SELECT DISTINCT bcs.id_smart
            FROM billing_client_summaries bcs
            LEFT JOIN asaas_customers_sync acs ON acs.external_reference = bcs.id_smart
            WHERE acs.external_reference IS NULL
        """)).fetchall()

        if missing_ids and api_key:
            missing_list = [r.id_smart for r in missing_ids]
            print(f"  🔍 Buscando {len(missing_list)} clientes de billing sem sync Asaas...", flush=True)
            async with httpx.AsyncClient() as c2:
                async def _by_ext_ref(id_smart):
                    try:
                        r = await _get_with_backoff(
                            c2,
                            f"{base_url}/customers",
                            headers=headers,
                            params={"externalReference": id_smart, "limit": 1},
                            timeout=10.0,
                        )
                        r.raise_for_status()
                        data = r.json().get("data") or []
                        return data[0] if data else None
                    except Exception:
                        return None

                sem2 = asyncio.Semaphore(MAX_PARALLEL)
                async def _safe_by_ext_ref(id_smart):
                    async with sem2:
                        return await _by_ext_ref(id_smart)

                found = await asyncio.gather(*[_safe_by_ext_ref(s) for s in missing_list])
                extra_customers = {
                    r["id"]: r
                    for r in found if r and r.get("id")
                }
                if extra_customers:
                    _upsert_customers(db, extra_customers)
                    print(f"  ✅ {len(extra_customers)} clientes sincronizados pelo externalReference", flush=True)

        # 6) Backfill de clientes existentes sem dados de contato — 200 por ciclo
        stale = db.execute(text("""
            SELECT asaas_id FROM asaas_customers_sync
            WHERE city IS NULL
            ORDER BY synced_at ASC
            LIMIT 200
        """)).fetchall()

        if stale and api_key:
            stale_ids = [r.asaas_id for r in stale]
            print(f"  🔄 Atualizando dados de contato de {len(stale_ids)} clientes existentes...", flush=True)
            sem3 = asyncio.Semaphore(MAX_PARALLEL)
            async with httpx.AsyncClient() as c3:
                async def _refresh(cid):
                    async with sem3:
                        return cid, await _fetch_customer(c3, headers, base_url, cid)

                refresh_results = await asyncio.gather(
                    *[_refresh(cid) for cid in stale_ids], return_exceptions=True
                )
            refresh_customers = {
                cid: info
                for res in refresh_results
                if not isinstance(res, Exception)
                for cid, info in [res]
                if info
            }
            if refresh_customers:
                _upsert_customers(db, refresh_customers)
                print(f"  ✅ {len(refresh_customers)} clientes atualizados com dados completos", flush=True)

        db.commit()

        print(f"✅ Asaas sync: {len(all_payments)} pagamentos, {len(customers)} clientes, "
              f"{deleted_count} removido(s) (excluídos no Asaas) | erros: {errors or 'nenhum'}")
        return {
            "status": "ok", "payments": len(all_payments), "customers": len(customers),
            "deleted": deleted_count, "errors": errors,
        }

    except Exception as e:
        db.rollback()
        print(f"❌ Asaas sync falhou: {e}")
        return {"status": "error", "error": str(e)}
    finally:
        if got_lock:
            try:
                db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _SYNC_LOCK_KEY})
                db.commit()
            except Exception:
                pass
        db.close()


# ─── loop de background ────────────────────────────────────────────────────

async def sync_loop():
    """Roda run_sync() imediatamente e depois a cada SYNC_INTERVAL segundos."""
    while True:
        try:
            await run_sync()
        except Exception as e:
            print(f"❌ sync_loop erro inesperado: {e}")
        await asyncio.sleep(SYNC_INTERVAL)
