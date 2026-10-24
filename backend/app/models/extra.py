"""
Modelos adicionais — Gestora Smart v1.2
Adiciona ao models/__init__.py existente
"""
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Date, Text, ForeignKey, Enum, JSON, LargeBinary, UniqueConstraint
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
    date_created     = Column(Date)   # dateCreated do Asaas: quando o boleto foi criado (aviso de lançamento da régua)
    original_due_date = Column(Date)   # vencimento ORIGINAL (originalDueDate do Asaas) — usado só pelo Comissionamento dos analistas
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


# ══════════════════════════════════════════════════════════════
# RÉGUA DE COBRANÇA (e-mail / lembretes) — aba "Cobrança" do Faturamento
# ══════════════════════════════════════════════════════════════

class CobrancaEtapa(Base):
    """Uma etapa da régua (lembrete, vence hoje, atraso, bloqueio, tarefa). Prazo, canal e texto editáveis."""
    __tablename__ = "cobranca_etapas"

    chave       = Column(String(30), primary_key=True)
    nome        = Column(String(80), nullable=False)
    ordem       = Column(Integer, default=0)
    ativa       = Column(Boolean, default=True)
    dias        = Column(Integer, default=0)          # relativo ao vencimento: -5 = 5 dias antes, 3 = 3 dias depois
    canais      = Column(String(60), default="email") # lista separada por vírgula: email | tarefa
    modo        = Column(String(12), default="aprovar")  # aprovar = analista aprova cada envio | automatico
    assunto     = Column(String(200))
    texto       = Column(Text)                        # corpo (texto puro, com {campos})
    anexa_boleto = Column(Boolean, default=False)     # a etapa leva o boleto (PDF do Itaú / link do Asaas) e segura o envio sem ele
    wa_template_id = Column(String(80))               # ID do template aprovado na Umbler (WhatsApp)
    wa_params   = Column(String(200))                 # ordem dos campos enviados ao template: "nome,valor,vencimento"
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by  = Column(Integer)


class CobrancaEnvio(Base):
    """Item da fila/histórico: uma mensagem (ou tarefa) de uma etapa para um boleto.
    Chave de idempotência: etapa + boleto_ref + canal — a mesma etapa nunca é gerada/enviada duas vezes para o mesmo boleto."""
    __tablename__ = "cobranca_envios"

    id           = Column(Integer, primary_key=True, index=True)
    etapa        = Column(String(30), nullable=False, index=True)
    canal        = Column(String(10), nullable=False)               # email | tarefa
    boleto_ref   = Column(String(120), nullable=False)              # asaas:<id>:<vencimento> | itau:<nosso_numero>:<vencimento>
    origem       = Column(String(10))                               # asaas | itau
    id_smart     = Column(String(40), index=True)
    cnpj         = Column(String(20))
    nome         = Column(String(300))
    destino      = Column(String(400))                              # e-mail(s) do cliente (separados por vírgula)
    destino_origem = Column(String(20))                             # cadastro | asaas
    vencimento   = Column(Date)
    valor        = Column(Float)
    link         = Column(String(500))
    descricao    = Column(String(300))
    # pendente → aprovado → enviando → enviado | falhou | cancelado | resolvido (pagou) | sem_contato | concluido (tarefa)
    status       = Column(String(14), nullable=False, default="pendente", index=True)
    erro         = Column(Text)
    tentativas   = Column(Integer, default=0)
    assunto_enviado = Column(String(300))
    corpo_enviado   = Column(Text)
    destino_efetivo = Column(String(400))                           # para onde realmente foi (modo teste muda)
    message_id   = Column(String(200))
    gerado_em    = Column(DateTime(timezone=True), server_default=func.now())
    aprovado_por = Column(Integer)
    aprovado_em  = Column(DateTime(timezone=True))
    enviado_em   = Column(DateTime(timezone=True))
    # WhatsApp (Umbler): telefone e acompanhamento do estado da mensagem
    telefone     = Column(String(20))                               # E.164 do cliente (+5511…)
    provider_msg_id  = Column(String(100), index=True)
    provider_chat_id = Column(String(100))
    entrega      = Column(String(14))                               # processando | enviada | entregue | lida | falhou
    entrega_em   = Column(DateTime(timezone=True))
    entrega_erro = Column(Text)
    entrega_checada_em = Column(DateTime(timezone=True))
    modo_teste   = Column(Boolean, default=False)                   # enviado em MODO TESTE (não conta como cobrança real)
    reservado_em = Column(DateTime(timezone=True))                  # quando o envio foi reservado (relógio do "envio interrompido")

    __table_args__ = (UniqueConstraint("etapa", "boleto_ref", "canal", name="uq_cobranca_envio_etapa_boleto_canal"),)


class CobrancaPausa(Base):
    """Cliente fora da régua (negociação, promessa de pagamento). ate nulo = sem prazo."""
    __tablename__ = "cobranca_pausas"

    id         = Column(Integer, primary_key=True, index=True)
    id_smart   = Column(String(40), nullable=False, index=True)
    ate        = Column(Date)
    motivo     = Column(String(300))
    ativa      = Column(Boolean, default=True)
    criado_por = Column(Integer)
    criado_em  = Column(DateTime(timezone=True), server_default=func.now())


class CobrancaWhatsConsent(Base):
    """Autorização do cliente para receber cobrança por WhatsApp (uma por cliente).
    Sem linha = ainda não perguntamos. Com ela o e-mail continua sendo o canal obrigatório."""
    __tablename__ = "cobranca_whatsapp_consent"

    id_smart     = Column(String(40), primary_key=True)
    # pedido_enviado | aceitou | recusou | sem_whatsapp | respondeu_outro
    status       = Column(String(16), nullable=False, default="pedido_enviado")
    telefone     = Column(String(20))
    chat_id      = Column(String(100))
    pedido_em    = Column(DateTime(timezone=True))
    respondido_em = Column(DateTime(timezone=True))
    resposta_texto = Column(String(400))                            # última resposta do cliente que não era sim/não
    origem       = Column(String(12), default="resposta")           # resposta | manual
    atualizado_por = Column(Integer)
    motivo       = Column(String(300))                              # decisão manual: como/quando o cliente respondeu
    checado_em   = Column(DateTime(timezone=True))                  # última vez que lemos o chat (rodízio)
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CobrancaEmailInvalido(Base):
    """Endereço que DEVOLVEU (falha permanente). A régua não gera nem envia para ele até alguém corrigir o cadastro."""
    __tablename__ = "cobranca_emails_invalidos"

    email        = Column(String(200), primary_key=True)
    motivo       = Column(String(400))
    codigo       = Column(String(20))                   # ex.: 5.1.1
    envio_id     = Column(Integer)
    detectado_em = Column(DateTime(timezone=True), server_default=func.now())
    liberado     = Column(Boolean, default=False)       # o analista confirmou que o endereço voltou a funcionar


class CobrancaDevolucaoLida(Base):
    """Mensagens de devolução já processadas (pelo Message-ID da própria devolução) — a caixa nunca é alterada."""
    __tablename__ = "cobranca_devolucoes_lidas"

    message_id = Column(String(300), primary_key=True)
    lida_em    = Column(DateTime(timezone=True), server_default=func.now())


class CobrancaBoletoItau(Base):
    """PDF do boleto do Itaú, enviado pelo analista e vinculado ao boleto (nosso_numero de itau_boletos).
    Guardado no banco (vai junto no backup). É o que a régua anexa no e-mail das cobranças do Itaú."""
    __tablename__ = "cobranca_boletos_itau"

    id             = Column(Integer, primary_key=True)
    nosso_numero   = Column(String(50), nullable=False, unique=True, index=True)
    arquivo_nome   = Column(String(255))
    tamanho        = Column(Integer)
    sha256         = Column(String(64))
    linha_digitavel = Column(String(80))
    pdf            = Column(LargeBinary, nullable=False)
    valor_pdf      = Column(Float)                            # valor/vencimento do boleto NO MOMENTO do vínculo (detecta PDF desatualizado)
    venc_pdf       = Column(Date)
    vinculo        = Column(String(10), default="dados")      # nosso | dados | manual
    enviado_por    = Column(Integer)
    enviado_em     = Column(DateTime(timezone=True), server_default=func.now())


class CobrancaEnvioBoleto(Base):
    """Boletos incluídos num e-mail de LANÇAMENTO (um e-mail por cliente com todos os boletos novos dele).
    boleto_ref único: o mesmo boleto nunca entra em dois avisos de lançamento."""
    __tablename__ = "cobranca_envio_boletos"

    id          = Column(Integer, primary_key=True)
    envio_id    = Column(Integer, nullable=False, index=True)
    boleto_ref  = Column(String(120), nullable=False, unique=True)     # asaas:<id>:<venc> | itau:<nosso>:<venc>
    origem      = Column(String(10))                                   # asaas | itau
    ref_id      = Column(String(60))                                   # asaas_id ou nosso_numero
    vencimento  = Column(Date)
    valor       = Column(Float)
    link        = Column(String(500))
