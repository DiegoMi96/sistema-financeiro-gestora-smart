"""
Modelos do Módulo de Contestação — Gestora Smart
"""
from sqlalchemy import (
    Column, String, Integer, Float, Boolean,
    DateTime, Date, Text, ForeignKey, Enum, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ContestationCycleStatus(str, enum.Enum):
    RASCUNHO        = "rascunho"        # em processamento
    REVISAO         = "revisao"         # gerado, Miranda revisando
    APROVADO        = "aprovado"        # aprovado, pronto para enviar
    ENVIADO         = "enviado"         # e-mail enviado ao fornecedor
    CREDITO_PARCIAL = "credito_parcial" # fornecedor aceitou parcialmente
    CREDITO_TOTAL   = "credito_total"   # fornecedor aceitou tudo
    ENCERRADO       = "encerrado"       # ciclo encerrado


class ContestationItemType(str, enum.Enum):
    VALOR_ACIMA_CONTRATO   = "valor_acima_contrato"    # supplier cobrou mais do que o contrato
    PCTE_ADICIONAL_INDEVIDO = "pcte_adicional_indevido" # pacote adicional em operadora não-Claro
    LINHA_NAO_IDENTIFICADA = "linha_nao_identificada"  # MSISDN fora do nosso inventário
    TRANSFERENCIA          = "transferencia"            # linha transferida — investigar
    CS                     = "cs"                      # licença CS — informativo


class ContestationItemStatus(str, enum.Enum):
    DETECTADO   = "detectado"    # identificado pelo motor
    CONTESTAR   = "contestar"    # Miranda aprovou para contestar
    IGNORAR     = "ignorar"      # Miranda optou por não contestar
    ENVIADO     = "enviado"      # incluído no e-mail ao fornecedor
    ACEITO      = "aceito"       # fornecedor aceitou
    REJEITADO   = "rejeitado"    # fornecedor rejeitou


class ContestationCycle(Base):
    """Um ciclo mensal de contestação."""
    __tablename__ = "contestation_cycles"

    id          = Column(Integer, primary_key=True, index=True)
    year        = Column(Integer, nullable=False)
    month       = Column(Integer, nullable=False)
    status      = Column(Enum(ContestationCycleStatus), default=ContestationCycleStatus.RASCUNHO)

    # Totais calculados
    total_itens_detectados   = Column(Integer, default=0)
    total_itens_contestar    = Column(Integer, default=0)
    valor_total_contestado   = Column(Float, default=0.0)
    valor_total_credito      = Column(Float, default=0.0)

    # Arquivos usados
    arquivo_faturamento  = Column(String(255))
    arquivo_fornecedor   = Column(String(255))
    arquivo_contratos    = Column(String(255))

    # CS informativo
    valor_cs             = Column(Float, default=0.0)

    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    created_by  = Column(Integer, ForeignKey("users.id"))
    approved_at = Column(DateTime(timezone=True))
    approved_by = Column(Integer, ForeignKey("users.id"))
    sent_at     = Column(DateTime(timezone=True))

    # Relacionamentos
    items   = relationship("ContestationItem",   back_populates="cycle", cascade="all, delete-orphan")
    credits = relationship("ContestationCredit", back_populates="cycle")

    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_contestation_cycle_month"),
    )


class ContestationItem(Base):
    """
    Um item de contestação — uma linha divergente encontrada pelo motor.
    """
    __tablename__ = "contestation_items"

    id         = Column(Integer, primary_key=True, index=True)
    cycle_id   = Column(Integer, ForeignKey("contestation_cycles.id"), nullable=False, index=True)

    # Identificação
    type       = Column(Enum(ContestationItemType), nullable=False)
    status     = Column(Enum(ContestationItemStatus), default=ContestationItemStatus.DETECTADO)

    # Dados da linha
    msisdn         = Column(String(20), index=True)
    iccid          = Column(String(30))
    operadora      = Column(String(50))         # da nossa base
    operadora_forn = Column(String(50))         # do arquivo do fornecedor
    id_pedido      = Column(String(30))         # ID do pedido no contrato
    nome_pedido    = Column(String(255))        # nome/descrição do pedido
    pacote_forn    = Column(String(255))        # nome do pacote no fornecedor
    status_forn    = Column(String(50))         # status no arquivo do fornecedor
    dias_forn      = Column(Integer)            # dias faturados pelo fornecedor

    # Valores
    valor_contrato    = Column(Float, default=0.0)  # mensalidade contratada (custo)
    valor_esperado    = Column(Float, default=0.0)  # valor_contrato × (dias/total_dias)
    valor_produto     = Column(Float, default=0.0)  # Valor Produto do fornecedor
    valor_faturado    = Column(Float, default=0.0)  # Valor Faturado do fornecedor
    valor_excedente   = Column(Float, default=0.0)  # Valor Excedente do fornecedor
    valor_diferenca   = Column(Float, default=0.0)  # valor_faturado - valor_esperado

    # Observações
    observacao        = Column(Text)            # observação automática do motor
    observacao_manual = Column(Text)            # observação da Miranda ao revisar

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True))
    reviewed_by = Column(Integer, ForeignKey("users.id"))

    # Relacionamento
    cycle = relationship("ContestationCycle", back_populates="items")

    __table_args__ = (
        Index("ix_cont_items_cycle_msisdn", "cycle_id", "msisdn"),
        Index("ix_cont_items_cycle_type",   "cycle_id", "type"),
        Index("ix_cont_items_cycle_status", "cycle_id", "status"),
    )


class ContestationCredit(Base):
    """
    Crédito recebido após o fornecedor aceitar a contestação.
    Registrado no mês seguinte quando o desconto aparece na fatura.
    """
    __tablename__ = "contestation_credits"

    id          = Column(Integer, primary_key=True, index=True)
    cycle_id    = Column(Integer, ForeignKey("contestation_cycles.id"), nullable=False, index=True)

    # De qual contestação originou
    ref_year    = Column(Integer)   # mês/ano da contestação original
    ref_month   = Column(Integer)

    # Crédito
    valor_contestado = Column(Float, nullable=False)  # quanto foi contestado
    valor_recebido   = Column(Float, nullable=False)  # quanto veio de desconto
    data_recebimento = Column(Date, nullable=False)
    observacao       = Column(Text)
    comprovante      = Column(String(500))            # referência na fatura do fornecedor

    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    created_by  = Column(Integer, ForeignKey("users.id"))

    cycle = relationship("ContestationCycle", back_populates="credits")


class AllcomPedido(Base):
    """Pedidos a pagar recebidos da Allcom — upload mensal."""
    __tablename__ = "allcom_pedidos"

    id              = Column(Integer, primary_key=True, index=True)
    pedido_id       = Column(Integer, unique=True, nullable=False, index=True)  # coluna ID da planilha
    descricao       = Column(Text)
    contrato        = Column(String(255))
    tipo_compartilhamento = Column(String(100))
    franquia_mb     = Column(Float)
    mensalidade     = Column(Float)
    preco_ativacao  = Column(Float)
    preco_exc_mb    = Column(Float)
    data_ativacao   = Column(Date)
    pre_ativacao_dias = Column(Integer)
    bloqueio_automatico = Column(String(10))
    roaming         = Column(String(10))
    status          = Column(String(50))
    upload_ref      = Column(String(7), index=True)   # "2026-06" — mês do upload
    uploaded_at     = Column(DateTime(timezone=True), server_default=func.now())
    uploaded_by     = Column(Integer, ForeignKey("users.id"))

    __table_args__ = (
        Index("ix_allcom_upload_ref", "upload_ref"),
    )
