"""
Modelos do banco de dados — Gestora Smart
"""
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Date,
    Text, ForeignKey, Enum, JSON, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


# ══════════════════════════════════════════════════════════════
# ENUMS
# ══════════════════════════════════════════════════════════════

class UserRole(str, enum.Enum):
    ADMIN           = "admin"
    GESTOR          = "gestor"
    CONTAS_RECEBER  = "contas_receber"
    SUPORTE_TECNICO = "suporte_tecnico"
    LOGISTICA       = "logistica"
    BACKOFFICE      = "backoffice"
    COMERCIAL       = "comercial"


class BillingStatus(str, enum.Enum):
    RASCUNHO   = "rascunho"    # em processamento
    REVISAO    = "revisao"     # gerado, aguardando revisão
    APROVADO   = "aprovado"    # aprovado, boletos emitidos
    FECHADO    = "fechado"     # mês encerrado


class AdjustmentType(str, enum.Enum):
    DESCONTO    = "desconto"
    ACRESCIMO   = "acrescimo"
    ISENCAO     = "isencao"
    CORRECAO    = "correcao"


class LineStatus(str, enum.Enum):
    ATIVO        = "Ativo"
    PRE_ATIVO    = "Pré-ativo"
    SUSPENSO     = "Suspenso"
    CANCELAMENTO = "Cancelamento"
    FRETE        = "Frete"
    MENSAGERIA   = "Pacote Mensageira"


# ══════════════════════════════════════════════════════════════
# USUÁRIOS
# ══════════════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(120), nullable=False)
    email           = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(Enum(UserRole), nullable=False, default=UserRole.CONTAS_RECEBER)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    # Perfil personalizado (sobrescreve o role padrão na resolução de permissões)
    custom_role_key       = Column(String(100), nullable=True)

    # Permissões granulares (sobrescrevem o padrão do role)
    can_edit_billing      = Column(Boolean, default=None)  # None = segue o role
    can_approve_billing   = Column(Boolean, default=None)
    can_view_dashboard    = Column(Boolean, default=None)
    can_manage_users      = Column(Boolean, default=None)
    can_view_contestacao  = Column(Boolean, default=None)
    can_view_comissao     = Column(Boolean, default=None)
    can_view_smt          = Column(Boolean, default=None)

    # Relacionamentos
    adjustments = relationship("BillingAdjustment", foreign_keys="BillingAdjustment.created_by_id", back_populates="created_by_user")
    audit_logs  = relationship("AuditLog", back_populates="user")


# ══════════════════════════════════════════════════════════════
# CLIENTES
# ══════════════════════════════════════════════════════════════

class Client(Base):
    __tablename__ = "clients"

    id           = Column(Integer, primary_key=True, index=True)
    id_smart     = Column(String(30), unique=True, index=True, nullable=False)  # ss_CNPJ
    cpf_cnpj     = Column(String(20), index=True, nullable=False)
    nome         = Column(String(255), nullable=False)
    tipo         = Column(String(20), default="cnpj")  # cnpj | cpf

    # Dados financeiros
    dia_vencimento = Column(Integer)        # dia do mês de vencimento padrão
    reajuste_pct   = Column(Float, default=0.0)
    reajuste_ano   = Column(Integer)        # ano do reajuste aplicado
    is_anuidade    = Column(Boolean, default=False)
    cancel_proporcional = Column(Boolean, default=False)
    ativ_proporcional   = Column(Boolean, default=False)

    # Asaas
    asaas_id     = Column(String(50), index=True)  # ID do cliente no Asaas

    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())

    # Relacionamentos
    billing_lines   = relationship("BillingLine", back_populates="client")
    due_dates       = relationship("ClientDueDate", back_populates="client")
    reajuste_history = relationship("ClientReajuste", back_populates="client")


class ClientDueDate(Base):
    """Vencimento por cliente por mês (pode mudar a cada ciclo)."""
    __tablename__ = "client_due_dates"

    id         = Column(Integer, primary_key=True)
    client_id  = Column(Integer, ForeignKey("clients.id"), nullable=False)
    year       = Column(Integer, nullable=False)
    month      = Column(Integer, nullable=False)
    due_date   = Column(Date, nullable=False)

    client = relationship("Client", back_populates="due_dates")

    __table_args__ = (
        UniqueConstraint("client_id", "year", "month", name="uq_client_due_date"),
    )


class ClientReajuste(Base):
    """Histórico de reajuste por cliente por ano."""
    __tablename__ = "client_reajustes"

    id         = Column(Integer, primary_key=True)
    client_id  = Column(Integer, ForeignKey("clients.id"), nullable=False)
    year       = Column(Integer, nullable=False)
    pct        = Column(Float, nullable=False)
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    applied_by = Column(Integer, ForeignKey("users.id"))

    client = relationship("Client", back_populates="reajuste_history")

    __table_args__ = (
        UniqueConstraint("client_id", "year", name="uq_client_reajuste_year"),
    )


# ══════════════════════════════════════════════════════════════
# BANCOS E PERFIS DE CLIENTES
# ══════════════════════════════════════════════════════════════

class Bank(Base):
    """Banco/plataforma para roteamento de boletos."""
    __tablename__ = "banks"

    id             = Column(Integer, primary_key=True)
    nome           = Column(String(100), nullable=False, unique=True)   # ex: "Itaú", "Asaas"
    agencia        = Column(String(20),  nullable=True)
    conta          = Column(String(30),  nullable=True)
    digito         = Column(String(5),   nullable=True)
    tipo_chave_pix = Column(String(20),  nullable=True)                 # cpf/cnpj/email/telefone/aleatoria
    chave_pix      = Column(String(150), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())

    profiles = relationship("ClientProfile", back_populates="bank")


class ClientProfile(Base):
    """Dados cadastrais e de contato do cliente — usados no PDF e no roteamento de boleto."""
    __tablename__ = "client_profiles"

    id_smart    = Column(String(50),  primary_key=True)          # ss_CNPJDIGITS
    nome        = Column(String(255), nullable=True)              # read-only (vem do Asaas/billing)
    cnpj        = Column(String(20),  nullable=True, index=True) # read-only
    telefone    = Column(String(30),  nullable=True)
    email       = Column(String(150), nullable=True)
    logradouro  = Column(String(200), nullable=True)
    numero      = Column(String(20),  nullable=True)
    complemento = Column(String(100), nullable=True)
    bairro      = Column(String(100), nullable=True)
    cep         = Column(String(10),  nullable=True)
    cidade      = Column(String(100), nullable=True)
    estado      = Column(String(2),   nullable=True)
    banco_id    = Column(Integer, ForeignKey("banks.id"), nullable=True)
    asaas_id    = Column(String(50),  nullable=True)             # ID do cliente no Asaas
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    bank = relationship("Bank", back_populates="profiles")


# ══════════════════════════════════════════════════════════════
# CICLO DE FATURAMENTO
# ══════════════════════════════════════════════════════════════

class BillingCycle(Base):
    """Um ciclo mensal de faturamento."""
    __tablename__ = "billing_cycles"

    id           = Column(Integer, primary_key=True, index=True)
    year         = Column(Integer, nullable=False)
    month        = Column(Integer, nullable=False)
    status       = Column(Enum(BillingStatus), default=BillingStatus.RASCUNHO)
    total_lines  = Column(Integer, default=0)
    total_value  = Column(Float, default=0.0)
    total_boletos = Column(Integer, default=0)

    # Arquivos de entrada usados
    base_filename          = Column(String(255))
    cancelamentos_filename = Column(String(255))
    fretes_filename        = Column(String(255))
    sms_filename           = Column(String(255))

    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    created_by   = Column(Integer, ForeignKey("users.id"))
    approved_at  = Column(DateTime(timezone=True))
    approved_by  = Column(Integer, ForeignKey("users.id"))
    closed_at    = Column(DateTime(timezone=True))

    # Relacionamentos
    lines       = relationship("BillingLine", back_populates="cycle",
                               cascade="all, delete-orphan")
    adjustments = relationship("BillingAdjustment", back_populates="cycle")

    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_billing_cycle_month"),
    )


class BillingLine(Base):
    """Uma linha do faturamento (por SIM card / item)."""
    __tablename__ = "billing_lines"
    __table_args__ = (
        # Índice composto: busca por cliente dentro de um ciclo (query mais frequente)
        Index("ix_bl_cycle_smart",  "cycle_id", "id_smart"),
        # Índice para breakdown por status
        Index("ix_bl_cycle_status", "cycle_id", "status"),
    )

    id         = Column(Integer, primary_key=True, index=True)
    cycle_id   = Column(Integer, ForeignKey("billing_cycles.id"), nullable=False, index=True)
    client_id  = Column(Integer, ForeignKey("clients.id"), index=True)

    # Identificação
    id_smart   = Column(String(30), index=True)   # ss_CNPJ
    iccid      = Column(String(30), index=True)
    msisdn     = Column(String(20))
    operadora  = Column(String(50))
    status     = Column(String(30), nullable=False)

    # Campos extras da base crua
    nome_pedido           = Column(String(255))
    id_pedido             = Column(String(255))
    nome_contrato         = Column(String(255))
    id_contrato           = Column(String(255))
    bloqueio_automatico   = Column(String(50))
    fornecedor            = Column(String(100))
    bloqueio_imei         = Column(String(50))
    imsi                  = Column(String(30))
    status_bloqueio_rede  = Column(String(50))
    apelido               = Column(String(255))
    observacao            = Column(String(500))
    tipo_compartilhamento = Column(String(50))
    operadora_especifica  = Column(String(100))
    elegivel_suspensao    = Column(String(50))
    ultima_apn            = Column(String(255))
    imei                  = Column(String(30))
    ultima_conexao        = Column(String(50))
    status_rede           = Column(String(50))
    operadora_conectada   = Column(String(100))

    # Datas
    data_ativacao          = Column(Date)
    data_cancelamento      = Column(Date)
    data_inicio_bloqueio   = Column(Date)
    data_fim_bloqueio_rede = Column(Date)
    data_inicio_suspensao  = Column(Date)
    data_fim_suspensao     = Column(Date)
    data_fim_pre_ativacao  = Column(Date)

    # Valores base
    mensalidade_base    = Column(Float, default=0.0)
    preco_ativacao      = Column(Float, default=0.0)
    preco_mb_excedente  = Column(Float, default=0.0)
    credito_simcard_kb  = Column(Float, default=0.0)
    franquia_mb         = Column(Float)
    credito_contrato    = Column(Float, default=0.0)
    tipo_fidelidade     = Column(String(30))
    multa_contrato      = Column(Float, default=0.0)
    dias_pre_ativacao   = Column(Integer, default=0)
    porcentagem_consumo = Column(Float)
    consumo_total_kb    = Column(Float)

    # Cálculos
    reajuste_pct         = Column(Float, default=0.0)
    mensalidade_reaj     = Column(Float, default=0.0)
    dias                 = Column(Integer, default=0)
    mensalidade_cobrada  = Column(Float, default=0.0)
    ativacao_cobrada     = Column(Float, default=0.0)
    excedente_cobrado    = Column(Float, default=0.0)
    multa_cobrada        = Column(Float, default=0.0)
    sms_cobrado          = Column(Float, default=0.0)
    total_linha          = Column(Float, default=0.0)

    # Relacionamentos
    cycle  = relationship("BillingCycle", back_populates="lines")
    client = relationship("Client", back_populates="billing_lines")


class BillingClientSummary(Base):
    """Resumo consolidado por cliente no ciclo (para boleto e fatura)."""
    __tablename__ = "billing_client_summaries"

    id         = Column(Integer, primary_key=True, index=True)
    cycle_id   = Column(Integer, ForeignKey("billing_cycles.id"), nullable=False, index=True)
    client_id  = Column(Integer, ForeignKey("clients.id"), index=True)
    id_smart   = Column(String(30), index=True)

    # Totais
    total_mensalidade  = Column(Float, default=0.0)
    total_ativacao     = Column(Float, default=0.0)
    total_excedente    = Column(Float, default=0.0)
    total_multa         = Column(Float, default=0.0)
    total_sms           = Column(Float, default=0.0)
    total_frete         = Column(Float, default=0.0)
    total_mensageria    = Column(Float, default=0.0)
    total_ajustes       = Column(Float, default=0.0)   # soma de descontos/acréscimos
    total_cancelamento  = Column(Float, default=0.0)   # mensalidade + multa dos cancelamentos
    total_final         = Column(Float, default=0.0)   # valor do boleto

    # Nome pré-computado para evitar JOINs lentos no endpoint de clientes
    nome_cliente  = Column(String(300))

    # Boleto
    due_date      = Column(Date)
    asaas_boleto_id  = Column(String(50))
    boleto_url    = Column(String(500))
    boleto_status = Column(String(30))    # puxado do Asaas

    # Linha de qtd
    qtd_linhas_ativas       = Column(Integer, default=0)
    qtd_ativacoes           = Column(Integer, default=0)
    qtd_cancelamentos       = Column(Integer, default=0)
    qtd_suspensoes          = Column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("cycle_id", "client_id", name="uq_summary_cycle_client"),
        Index("ix_summary_cycle", "cycle_id"),
    )


# ══════════════════════════════════════════════════════════════
# AJUSTES E JUSTIFICATIVAS
# ══════════════════════════════════════════════════════════════

class BillingAdjustment(Base):
    """
    Ajuste manual em uma fatura de cliente.
    Rastreia quem ajustou, quando, por quê e qual o impacto.
    """
    __tablename__ = "billing_adjustments"

    id              = Column(Integer, primary_key=True, index=True)
    cycle_id        = Column(Integer, ForeignKey("billing_cycles.id"), nullable=False)
    client_id       = Column(Integer, ForeignKey("clients.id"), nullable=True)
    id_smart        = Column(String(30))

    type            = Column(Enum(AdjustmentType), nullable=False)
    component       = Column(String(30))        # mensalidade | ativacao | excedente | total
    valor_original  = Column(Float, nullable=False)
    valor_ajustado  = Column(Float, nullable=False)
    valor_diferenca = Column(Float)             # ajustado - original

    justificativa   = Column(Text, nullable=False)
    observacao      = Column(Text)

    # Campos do processo de contas a receber (espelham a planilha de ajuste)
    analista        = Column(String(100))       # analista responsável pelo ajuste
    consultor       = Column(String(150))       # consultor/parceiro do cliente
    num_fatura      = Column(String(50))        # N.° da fatura no Asaas
    data_vencimento = Column(Date)              # data de vencimento da fatura
    ofensor         = Column(String(50))        # categoria: Sistema | Financeiro | Proporcional | Logística | Comercial | Pacote | Transferência | Anuidade | Payments

    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    created_by_id   = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Aprovação
    requires_approval = Column(Boolean, default=False)
    approved_at       = Column(DateTime(timezone=True))
    approved_by_id    = Column(Integer, ForeignKey("users.id"))

    # Relacionamentos
    cycle           = relationship("BillingCycle", back_populates="adjustments")
    created_by_user = relationship("User", foreign_keys=[created_by_id],
                                   back_populates="adjustments")


# ══════════════════════════════════════════════════════════════
# AUDITORIA
# ══════════════════════════════════════════════════════════════

class AuditLog(Base):
    """Trilha de auditoria de todas as ações críticas."""
    __tablename__ = "audit_logs"

    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"), index=True)
    action     = Column(String(100), nullable=False)   # ex: billing.approve, adjustment.create
    entity     = Column(String(50))                    # billing_cycle | client | user
    entity_id  = Column(Integer)
    details    = Column(JSON)                          # dados adicionais
    ip_address = Column(String(45))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="audit_logs")


# ══════════════════════════════════════════════════════════════
# ORGANOGRAMA
# ══════════════════════════════════════════════════════════════

class OrgMember(Base):
    """Membro do organograma (colaborador, parceiro ou vaga)."""
    __tablename__ = "org_members"

    id            = Column(Integer, primary_key=True)
    name          = Column(String(200), nullable=False)
    role_title    = Column(String(200), nullable=False)
    department    = Column(String(100), nullable=True)

    # CLT | PJ | Parceiro | Dealer | Indicador1 | Indicador2 | ProjEspecial | Outro | Vaga
    member_type   = Column(String(50), default="CLT")

    parent_id     = Column(Integer, ForeignKey("org_members.id"), nullable=True)
    photo_path    = Column(String(500), nullable=True)

    is_active     = Column(Boolean, default=True)
    is_vacancy    = Column(Boolean, default=False)

    show_in_institucional = Column(Boolean, default=True)
    show_in_comercial     = Column(Boolean, default=True)

    sort_order    = Column(Integer, default=0)
    notes         = Column(String(500), nullable=True)

    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())

    children = relationship(
        "OrgMember",
        back_populates="parent",
        foreign_keys="[OrgMember.parent_id]",
        lazy="select",
    )
    parent = relationship(
        "OrgMember",
        back_populates="children",
        foreign_keys="[OrgMember.parent_id]",
        remote_side="[OrgMember.id]",
    )


# ══════════════════════════════════════════════════════════════
# INDICADORES — sync com Google Sheets
# ══════════════════════════════════════════════════════════════

class SheetIndicator(Base):
    __tablename__ = "sheet_indicators"
    id         = Column(Integer, primary_key=True, index=True)
    chave      = Column(String(100), nullable=False)
    year       = Column(Integer, nullable=False)
    month      = Column(Integer, nullable=False)   # 1=Jan … 12=Dez
    value      = Column(Float, nullable=True)
    source     = Column(String(20), default="system")  # "system" | "sheet"
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("chave", "year", "month", name="uq_indicator"),
    )
