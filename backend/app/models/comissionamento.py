"""
Comissionamento — persistência do extrato pós-cálculo (por colaborador/mês/aba).

Guarda só o que já foi processado e cruzado (não a planilha crua importada, que
pode ter centenas de milhares de linhas) — o mesmo dado que hoje monta o extrato
`.xlsx` no navegador (`exportVendedor`/`exportEntity`/`exportInd` no protótipo),
mas persistido pra sobreviver a F5 e ficar disponível por até 1 ano (retenção em
app/services/comissionamento_retention.py).
"""
from sqlalchemy import Column, String, Integer, JSON, DateTime, Boolean, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base


class ComissaoExtrato(Base):
    __tablename__ = "comissao_extratos"

    id               = Column(Integer, primary_key=True, index=True)
    # id interno do protótipo (ex: "v3", "d1", "i2", "p3") — mesma chave que o
    # localStorage já usa pra identificar o colaborador dentro de cada categoria.
    colaborador_id   = Column(String(50), nullable=False, index=True)
    # Snapshot do nome no momento do processamento (o cadastro pode mudar depois).
    colaborador_nome = Column(String(150), nullable=False)
    # vendedor | dealer | indicador | projeto
    tipo             = Column(String(20), nullable=False)
    # "YYYY-MM" — mês de referência do comissionamento (mês de pagamento).
    mes_referencia   = Column(String(7), nullable=False, index=True)
    # Aba/categoria do detalhe: simcard | gps (Smart GPS/Placas) | equip | vendas
    # | cancelamento — mesma chave que o front já usa em impSetRaw (ver
    # vendedor.html/dealer.html/indicadores.html/projeto_especial.html).
    aba              = Column(String(20), nullable=False)

    # Colunas exatas da planilha, na ordem — lista de strings.
    headers          = Column(JSON, nullable=False)
    # Linhas exatas, na mesma ordem dos headers — lista de listas.
    linhas           = Column(JSON, nullable=False)

    criado_em        = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        # Reprocessar o mesmo mês sobrescreve a aba (upsert), não duplica.
        UniqueConstraint("colaborador_id", "mes_referencia", "aba", name="uq_comissao_extrato"),
    )


class ComissaoCiclo(Base):
    """
    Lançamentos mensais dos 3 perfis de acompanhamento de ciclo (Diretor
    Administrativo, Diretor Comercial, Gestor de Operações) — cada um tem seu
    próprio conjunto de campos por mês (ex: "resultado" no Diretor
    Administrativo; "volume"/"cresc"/"hw"/"sat" no Diretor Comercial), então
    guarda o objeto `mdata` inteiro (todos os meses) como JSON, igual ao que já
    vive hoje em `localStorage['da1_m'/'dc1_m'/'go1_m']`. Sem isso, o dado só
    existe no navegador de quem lançou — perdido ao trocar de máquina/limpar
    o navegador.
    """
    __tablename__ = "comissao_ciclos"

    id            = Column(Integer, primary_key=True, index=True)
    # diretor_adm | diretor_comercial | gestor_operacoes
    perfil        = Column(String(30), nullable=False, unique=True, index=True)
    # Mesmo formato do mdata local: { "2026-09": {resultado: 123, meta: 456}, ... }
    dados         = Column(JSON, nullable=False)
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CadastroParceiro(Base):
    """
    Caixa de entrada dos cadastros enviados pelo link público (/cadastro/<categoria>).

    Antes o formulário gravava só no localStorage do navegador de QUEM PREENCHIA,
    então o cadastro nunca chegava ao sistema. Agora o servidor guarda tudo; a tela
    "Cadastro de Parceiros" busca os `novo` ao abrir, coloca nas listas e confirma
    (`importado`). A linha nunca é apagada: é o registro oficial do que o parceiro
    enviou (inclusive a ciência do envio de Nota Fiscal) e permite recuperar o
    cadastro se o navegador de quem usa o sistema for limpo.
    """
    __tablename__ = "comissao_cadastros_parceiros"

    id            = Column(Integer, primary_key=True, index=True)
    # indicador | indicador_n2 | dealer | projeto
    categoria     = Column(String(20), nullable=False, index=True)
    nome          = Column(String(150), nullable=False)
    cpf           = Column(String(20), nullable=False, index=True)
    # Formulário completo, já validado e sanitizado (mesmos campos que a tela de cadastro usa).
    dados         = Column(JSON, nullable=False)
    ciente_nf     = Column(Boolean, nullable=False, default=False)
    ciente_nf_em  = Column(DateTime(timezone=True))
    # novo (ainda não puxado pela tela) | importado
    status        = Column(String(12), nullable=False, default="novo", index=True)
    # Só pra limitar abuso do endpoint público (rate limit por IP).
    ip            = Column(String(64), index=True)
    criado_em     = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    importado_em  = Column(DateTime(timezone=True))
    importado_por = Column(Integer)
