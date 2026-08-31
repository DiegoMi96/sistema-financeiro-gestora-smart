"""
Modelos adicionais — Gestora Smart v1.2
Adiciona ao models/__init__.py existente
"""
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Date, Text, ForeignKey, Enum, JSON, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base
import enum


class PaymentStatus(str, enum.Enum):
    PENDENTE   = "PENDENTE"
    PAGO       = "PAGO"
    VENCIDO    = "VENCIDO"
    PARCIAL    = "PARCIAL"
    NEGOCIADO  = "NEGOCIADO"


class PaymentRecord(Base):
    """
    Registro manual de pagamento recebido fora do Asaas.
    O status automático vem da sincronização com Asaas;
    este modelo cobre PIX avulso, depósito, negociação direta.
    """
    __tablename__ = "payment_records"

    id              = Column(Integer, primary_key=True, index=True)
    cycle_id        = Column(Integer, ForeignKey("billing_cycles.id"), nullable=False, index=True)
    id_smart        = Column(String(30), nullable=False, index=True)
    valor_fatura    = Column(Float, nullable=False)
    valor_recebido  = Column(Float, nullable=False)
    data_pagamento  = Column(Date, nullable=False)
    forma           = Column(String(30))   # PIX | boleto | deposito | negociacao
    observacao      = Column(Text)
    comprovante_url = Column(String(500))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    created_by_id   = Column(Integer, ForeignKey("users.id"), nullable=False)


class AIAnalysis(Base):
    """Cache de análises de IA por ciclo — evita rechamar a API desnecessariamente."""
    __tablename__ = "ai_analyses"

    id          = Column(Integer, primary_key=True)
    cycle_id    = Column(Integer, ForeignKey("billing_cycles.id"), nullable=False, index=True)
    type        = Column(String(30), default="diagnostico")   # diagnostico | alerta | projecao
    content     = Column(Text, nullable=False)    # resposta da IA em markdown
    model_used  = Column(String(50))
    input_hash  = Column(String(64))              # hash dos dados de entrada (detecta se mudou)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    created_by  = Column(Integer, ForeignKey("users.id"))


class OperationalDiagnosis(Base):
    """
    Cache do Diagnóstico Operacional e de Cobrança — diferente do AIAnalysis
    (que é por ciclo de faturamento), este é por período (mês/ano) e cobre
    comportamento de pagamento dos clientes + uso da plataforma pelos
    usuários internos. Tabela própria porque AIAnalysis.cycle_id é
    obrigatório e este diagnóstico não pertence a um ciclo específico.
    """
    __tablename__ = "operational_diagnoses"

    id          = Column(Integer, primary_key=True)
    month       = Column(Integer, nullable=False)
    year        = Column(Integer, nullable=False)
    content     = Column(Text, nullable=False)
    model_used  = Column(String(50))
    input_hash  = Column(String(64))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    created_by  = Column(Integer, ForeignKey("users.id"))


class ControladoriaInsight(Base):
    """
    Cache do "Insights do mês" na visão de Fechamento da Controladoria.
    Sem created_by (FK pra users) porque o Controladoria não tem sessão
    JWT — autentica via x-api-key, sem usuário vinculado (ver
    routers/controladoria_insights.py).
    """
    __tablename__ = "controladoria_insights"

    id          = Column(Integer, primary_key=True)
    month       = Column(Integer, nullable=False)
    year        = Column(Integer, nullable=False)
    content     = Column(Text, nullable=False)
    model_used  = Column(String(50))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class AsaasPaymentSync(Base):
    """Espelho local dos pagamentos do Asaas — atualizado a cada 20 minutos."""
    __tablename__ = "asaas_payments_sync"

    id               = Column(Integer, primary_key=True)
    asaas_id         = Column(String(50), unique=True, nullable=False, index=True)
    customer_id      = Column(String(50), index=True)
    customer_name    = Column(String(300))
    customer_cpf_cnpj = Column(String(20))
    value            = Column(Float)
    value_original   = Column(Float)   # preenchido pelo Asaas quando há juros/multa (originalValue)
    net_value        = Column(Float)
    due_date         = Column(Date, index=True)
    payment_date     = Column(Date)
    credit_date      = Column(Date)
    status           = Column(String(30), index=True)   # PENDING, RECEIVED, CONFIRMED, OVERDUE…
    billing_type     = Column(String(30))
    description      = Column(Text)
    external_reference = Column(String(100))            # id_smart (ss_CNPJ)
    invoice_number   = Column(String(50))               # nº da fatura no Asaas (invoiceNumber)
    invoice_url      = Column(String(500))
    synced_at        = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ItauBoleto(Base):
    """Boletos Itaú importados via planilha do relatório de cobrança."""
    __tablename__ = "itau_boletos"

    id              = Column(Integer, primary_key=True)
    carteira        = Column(String(20))
    pagador         = Column(String(300))
    cpf_cnpj        = Column(String(20), index=True)
    tipo            = Column(String(50))
    nosso_numero    = Column(String(50), unique=True, nullable=False)
    seu_numero      = Column(String(50))
    data_emissao    = Column(Date)
    data_vencimento = Column(Date, index=True)
    data_pagamento  = Column(Date)
    data_baixa      = Column(Date)
    valor_titulo    = Column(Float)
    valor_pago      = Column(Float)
    status          = Column(String(30), index=True)   # paga | a vencer | vencida
    description     = Column(Text, nullable=True)
    uploaded_at     = Column(DateTime(timezone=True), server_default=func.now())
    upload_ref      = Column(String(7), index=True)    # "2026-06" — mês do upload


class AsaasCustomerSync(Base):
    """Espelho local dos clientes do Asaas — atualizado junto com o sync de pagamentos."""
    __tablename__ = "asaas_customers_sync"

    id                 = Column(Integer, primary_key=True)
    asaas_id           = Column(String(50), unique=True, nullable=False, index=True)
    external_reference = Column(String(100), index=True)  # = id_smart (ss_CNPJ)
    name               = Column(String(300))
    cpf_cnpj           = Column(String(20), index=True)
    email              = Column(String(200))
    phone         = Column(String(30))
    mobile_phone  = Column(String(30))
    postal_code   = Column(String(10))
    address       = Column(String(300))
    address_number= Column(String(200))
    complement    = Column(String(300))
    province      = Column(String(300))
    city          = Column(String(100))
    state         = Column(String(2))
    synced_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())



class VencidoNota(Base):
    """Notas de acompanhamento de vencidos: vencimento planejado e observação por cliente/mês."""
    __tablename__ = "vencido_notas"
    __table_args__ = (UniqueConstraint('cnpj', 'mes', 'ano', name='uq_vencido_nota_cnpj_mes_ano'),)

    id                   = Column(Integer, primary_key=True)
    cnpj                 = Column(String(20), nullable=False, index=True)
    mes                  = Column(Integer, nullable=False)
    ano                  = Column(Integer, nullable=False)
    vencimento_planejado = Column(Date, nullable=True)
    observacao           = Column(Text, nullable=True)
    updated_at           = Column(DateTime(timezone=True), server_default=func.now())
