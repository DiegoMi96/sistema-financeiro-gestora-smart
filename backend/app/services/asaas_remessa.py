"""
Criação de cobranças no Asaas a partir da aba "Importação" do ciclo.

- O ambiente (sandbox/produção) vem de `get_asaas_creation_client` — padrão sandbox, chave própria.
- Idempotente: cada cobrança leva externalReference = "<id_smart>|<AAAA-MM>" e, antes de criar, o executor
  procura item já criado (outro job) e cobrança já existente no Asaas com a mesma referência.
- Progresso e resultado de cada cliente ficam em asaas_remessa_itens (o backend tem mais de um worker).
- Cliente de PRODUÇÃO nunca é criado automaticamente (tem que estar cadastrado no Asaas); no sandbox,
  se o cliente não existir, é criado sem notificações, só para permitir o teste.
"""
import asyncio
import json
import re
from datetime import datetime, timezone

from sqlalchemy import text

from app.database import SessionLocal
from app.models import AsaasRemessaJob, AsaasRemessaItem, BillingCycle, BillingClientSummary
from app.services.asaas_client import get_asaas_creation_client

PAUSA_ENTRE_COBRANCAS = 0.25      # segundos; o 429 (limite de ritmo do Asaas) é tratado no cliente


def referencia_externa(cycle, id_smart: str) -> str:
    return f"{id_smart}|{cycle.year}-{cycle.month:02d}"


def _agora():
    return datetime.now(timezone.utc)


def _recontar(db, job):
    linhas = db.execute(text(
        "SELECT status, count(*) FROM asaas_remessa_itens WHERE job_id = :j GROUP BY status"), {"j": job.id}).fetchall()
    c = {st: n for st, n in linhas}
    job.criadas = c.get("criada", 0)
    job.existentes = c.get("existente", 0)
    job.erros = c.get("erro", 0)
    job.feitos = job.total - c.get("pendente", 0)


async def _cliente_asaas(db, cliente, ambiente, it, nome, simular):
    """Id do cliente no Asaas. Devolve (id, aviso). Produção: só usa quem já está cadastrado."""
    dig = re.sub(r"\D", "", it.id_smart)
    cid = None
    if ambiente == "producao":
        row = db.execute(text("""
            SELECT asaas_id FROM asaas_customers_sync
             WHERE external_reference = :e OR regexp_replace(cpf_cnpj, '\\D', '', 'g') = :d
             ORDER BY synced_at DESC LIMIT 1"""), {"e": it.id_smart, "d": dig}).fetchone()
        cid = row[0] if row else None
    if not cid:
        c = await cliente.find_customer(cpf_cnpj=dig)
        cid = c["id"] if c else None
    if cid:
        return cid, None
    if ambiente == "sandbox":
        if simular:
            return None, "cliente não existe no sandbox (seria criado só para o teste)"
        novo = await cliente.create_customer({
            "name": (nome or f"Cliente {it.id_smart}")[:100], "cpfCnpj": dig,
            "externalReference": it.id_smart, "notificationDisabled": True,
        })
        return novo["id"], None
    return None, "cliente não encontrado no Asaas (precisa estar cadastrado)"


async def _processar_item(db, cliente, ambiente, job, cycle, it, nomes):
    dados = json.loads(it.dados or "{}")
    ref = it.external_reference or referencia_externa(cycle, it.id_smart)
    it.external_reference = ref
    it.erro = None

    # 1) já criada em outra execução (mesmo ciclo, cliente e ambiente)?
    antes = db.query(AsaasRemessaItem).filter(
        AsaasRemessaItem.cycle_id == it.cycle_id, AsaasRemessaItem.id_smart == it.id_smart,
        AsaasRemessaItem.ambiente == ambiente, AsaasRemessaItem.id != it.id,
        AsaasRemessaItem.status.in_(("criada", "existente")),
    ).first()
    if antes:
        it.status, it.asaas_payment_id, it.invoice_url = "existente", antes.asaas_payment_id, antes.invoice_url
        it.erro = "já criada em execução anterior"
        return

    cid, aviso = await _cliente_asaas(db, cliente, ambiente, it, nomes.get(it.id_smart), job.simular)
    it.asaas_customer_id = cid

    # 2) já existe no Asaas com esta referência?
    if cid:
        p = await cliente.find_payment_by_external_ref(ref)
        if p:
            it.status, it.asaas_payment_id, it.invoice_url = "existente", p.get("id"), p.get("invoiceUrl")
            it.erro = "já existia no Asaas com esta referência"
            return

    if job.simular:
        it.status = "simulada"
        it.erro = aviso            # None quando está tudo certo para criar
        return
    if not cid:
        it.status, it.erro = "erro", aviso
        return

    forma = (dados.get("forma") or "Boleto").strip().lower()
    if forma not in ("boleto",):
        it.status, it.erro = "erro", f"forma de pagamento '{dados.get('forma')}' não suportada na criação (só Boleto)"
        return
    payload = {
        "customer": cid, "billingType": "BOLETO", "value": round(float(it.valor), 2),
        "dueDate": it.vencimento.isoformat(), "externalReference": ref,
    }
    if dados.get("descricao"):
        payload["description"] = dados["descricao"][:500]
    if dados.get("juros") is not None:
        payload["interest"] = {"value": float(dados["juros"])}
    if dados.get("multa") not in (None, 0, 0.0):
        tipo = "FIXED" if str(dados.get("tmulta", "")).upper().startswith("FIX") else "PERCENTAGE"
        payload["fine"] = {"value": float(dados["multa"]), "type": tipo}
    r = await cliente.create_payment(payload)
    it.status, it.asaas_payment_id, it.invoice_url = "criada", r.get("id"), r.get("invoiceUrl")


async def executar_job(job_id: int):
    db = SessionLocal()
    try:
        job = db.get(AsaasRemessaJob, job_id)
        if not job:
            return
        try:
            cliente, ambiente = get_asaas_creation_client(db)
        except ValueError as e:
            job.status, job.mensagem, job.finished_at = "erro", str(e), _agora()
            db.commit()
            return
        if ambiente != job.ambiente:
            job.status, job.finished_at = "erro", _agora()
            job.mensagem = f"O ambiente mudou de {job.ambiente} para {ambiente} durante a execução; nada foi enviado."
            db.commit()
            return
        cycle = db.query(BillingCycle).filter(BillingCycle.id == job.cycle_id).first()
        nomes = {s.id_smart: s.nome_cliente for s in
                 db.query(BillingClientSummary).filter(BillingClientSummary.cycle_id == job.cycle_id).all()}
        job.status = "rodando"
        db.commit()

        while True:
            db.refresh(job)
            if job.status == "cancelado":
                break
            it = (db.query(AsaasRemessaItem)
                  .filter(AsaasRemessaItem.job_id == job.id, AsaasRemessaItem.status == "pendente")
                  .order_by(AsaasRemessaItem.id).first())
            if not it:
                break
            try:
                await _processar_item(db, cliente, ambiente, job, cycle, it, nomes)
            except Exception as e:                      # falha de um cliente não derruba a remessa
                it.status, it.erro = "erro", str(e)[:480]
            db.flush()
            _recontar(db, job)
            db.commit()
            await asyncio.sleep(PAUSA_ENTRE_COBRANCAS)

        db.refresh(job)
        if job.status == "rodando":
            job.status, job.finished_at = "concluido", _agora()
        _recontar(db, job)
        db.commit()
    except Exception as e:
        db.rollback()
        try:
            job = db.get(AsaasRemessaJob, job_id)
            job.status, job.mensagem, job.finished_at = "erro", f"{type(e).__name__}: {e}"[:500], _agora()
            db.commit()
        except Exception:
            pass
    finally:
        db.close()
