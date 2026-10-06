"""
Cadastro de parceiros — endpoint PÚBLICO (sem login) que recebe o formulário do
link enviado ao parceiro (/cadastro/<categoria>).

É a única rota que aceita escrita de quem não está logado, então o que vale aqui é
defesa em camadas: tamanho máximo do corpo, validação de tudo no servidor (o
navegador pode ser burlado), texto sanitizado (os dados depois são mostrados em
telas que montam HTML), limite por IP, anti-duplicidade e um campo-isca para robôs.
O endpoint só ESCREVE — nada do que foi cadastrado é devolvido a quem não tem login.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comissionamento import CadastroParceiro

router = APIRouter(prefix="/public/cadastro-parceiros", tags=["cadastro-publico"])

MAX_BODY_BYTES = 20_000
MAX_POR_IP_POR_HORA = 8
CATEGORIAS = {"indicador", "indicador_n2", "dealer", "projeto"}

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _limpa(v: Optional[str], limite: int) -> str:
    """Tira caracteres de controle, '<' e '>' e troca aspas duplas por tipográficas:
    esses textos entram em telas que montam HTML (inclusive dentro de atributos)."""
    if v is None:
        return ""
    v = _CTRL.sub("", str(v)).replace("<", "").replace(">", "").replace('"', "”")
    return " ".join(v.split())[:limite]


def _digitos(v: str) -> str:
    return re.sub(r"\D", "", v or "")


class CadastroIn(BaseModel):
    categoria: str
    nome: str
    empresa: str = ""
    cpf: str
    cnpj: str = ""
    celular: str
    telefone: str = ""
    email: str
    email2: str = ""
    endereco: str
    bairro: str = ""
    cidade: str
    estado: str = ""
    cep: str
    comercial: str
    ajudaCusto: float = 0
    contaBanco: str
    contaAgencia: str
    contaNumero: str
    contaPix: str
    cienteNotaFiscal: bool = False
    # Campo-isca: um humano nunca vê nem preenche. Robô que preenche tudo cai aqui.
    website: str = ""


def _validar_e_limpar(c: CadastroIn) -> dict:
    """Devolve o dicionário final, já limpo, ou levanta ValueError com a mensagem."""
    if c.categoria not in CATEGORIAS:
        raise ValueError("Categoria inválida.")
    nome = _limpa(c.nome, 150)
    if len(nome) < 3:
        raise ValueError("Informe seu nome completo.")
    cpf = _digitos(c.cpf)
    if len(cpf) != 11:
        raise ValueError("O CPF precisa ter 11 números.")
    cnpj = _digitos(c.cnpj)
    if cnpj and len(cnpj) != 14:
        raise ValueError("O CNPJ precisa ter 14 números.")
    cel = _digitos(c.celular)
    if len(cel) not in (10, 11):
        raise ValueError("Informe o celular com DDD.")
    tel = _digitos(c.telefone)
    if tel and len(tel) not in (10, 11):
        raise ValueError("Informe o telefone com DDD.")
    email = _limpa(c.email, 150).lower()
    if not _EMAIL.match(email):
        raise ValueError("Confira o e-mail informado.")
    email2 = _limpa(c.email2, 150).lower()
    if email2 and not _EMAIL.match(email2):
        raise ValueError("Confira o e-mail secundário.")
    cep = _digitos(c.cep)
    if len(cep) != 8:
        raise ValueError("O CEP precisa ter 8 números.")
    estado = re.sub(r"[^A-Za-z]", "", c.estado).upper()
    if estado and len(estado) != 2:
        raise ValueError("Informe o estado com 2 letras.")
    endereco = _limpa(c.endereco, 200)
    cidade = _limpa(c.cidade, 100)
    comercial = _limpa(c.comercial, 100)
    banco, agencia = _limpa(c.contaBanco, 80), _limpa(c.contaAgencia, 30)
    numero, pix = _limpa(c.contaNumero, 40), _limpa(c.contaPix, 120)
    for rotulo, valor in (("o endereço", endereco), ("a cidade", cidade), ("o executivo", comercial),
                          ("o banco", banco), ("a agência", agencia), ("o número da conta", numero),
                          ("a chave PIX", pix)):
        if not valor:
            raise ValueError(f"Informe {rotulo}.")
    if not c.cienteNotaFiscal:
        raise ValueError("É preciso estar ciente do envio da Nota Fiscal para concluir o cadastro.")
    ajuda = c.ajudaCusto if (c.categoria == "indicador_n2" and 0 <= c.ajudaCusto <= 100_000) else 0

    def fmt_cpf(d): return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    def fmt_cnpj(d): return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    def fmt_cel(d): return f"({d[:2]}) {d[2:7]}-{d[7:]}" if len(d) == 11 else f"({d[:2]}) {d[2:6]}-{d[6:]}"

    return {
        "categoria": c.categoria, "nome": nome, "empresa": _limpa(c.empresa, 150),
        "cpf": fmt_cpf(cpf), "cnpj": fmt_cnpj(cnpj) if cnpj else "",
        "celular": fmt_cel(cel), "telefone": fmt_cel(tel) if tel else "",
        "email": email, "email2": email2,
        "endereco": endereco, "bairro": _limpa(c.bairro, 100), "cidade": cidade,
        "estado": estado, "cep": f"{cep[:5]}-{cep[5:]}", "comercial": comercial,
        "ajudaCusto": ajuda,
        "contaBanco": banco, "contaAgencia": agencia, "contaNumero": numero, "contaPix": pix,
        "conta": f"Banco {banco}, Ag. {agencia}, Conta {numero}, Chave PIX: {pix}",
        "apelido": "",   # a equipe preenche depois
    }


async def _ler_corpo_limitado(request: Request) -> bytes:
    declarado = request.headers.get("content-length")
    if declarado and declarado.isdigit() and int(declarado) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Dados grandes demais.")
    corpo = b""
    async for pedaco in request.stream():      # também protege contra corpo sem Content-Length
        corpo += pedaco
        if len(corpo) > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Dados grandes demais.")
    return corpo


@router.post("", status_code=201)
async def receber_cadastro(request: Request, db: Session = Depends(get_db)):
    corpo = await _ler_corpo_limitado(request)
    try:
        bruto = json.loads(corpo.decode("utf-8"))
        dados_in = CadastroIn(**bruto)
    except (ValueError, ValidationError, TypeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Não foi possível ler os dados enviados. Confira os campos e tente de novo.")

    # Robô: preencheu o campo escondido. Responde "ok" para ele não insistir, e não grava.
    if dados_in.website.strip():
        return {"ok": True, "id": 0}

    try:
        dados = _validar_e_limpar(dados_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ip = (request.headers.get("x-real-ip") or (request.client.host if request.client else "") or "")[:64]
    agora = datetime.now(timezone.utc)

    # Mesmo CPF nos últimos 10 min = reenvio/duplo clique: devolve o que já existe.
    recente = (
        db.query(CadastroParceiro)
        .filter(CadastroParceiro.cpf == dados["cpf"], CadastroParceiro.categoria == dados["categoria"],
                CadastroParceiro.criado_em >= agora - timedelta(minutes=10))
        .first()
    )
    if recente:
        return {"ok": True, "id": recente.id}

    if ip:
        enviados = (
            db.query(CadastroParceiro)
            .filter(CadastroParceiro.ip == ip, CadastroParceiro.criado_em >= agora - timedelta(hours=1))
            .count()
        )
        if enviados >= MAX_POR_IP_POR_HORA:
            raise HTTPException(status_code=429, detail="Muitos envios deste endereço. Tente novamente em alguns minutos ou fale com o seu executivo.")

    novo = CadastroParceiro(
        categoria=dados["categoria"], nome=dados["nome"], cpf=dados["cpf"], dados=dados,
        ciente_nf=True, ciente_nf_em=agora, status="novo", ip=ip,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return {"ok": True, "id": novo.id}
