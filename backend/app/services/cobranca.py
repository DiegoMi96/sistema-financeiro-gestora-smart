"""
Régua de cobrança — lembretes por e-mail dos boletos em aberto (Asaas + Itaú).

Princípios (integridade / segurança):
  • GERAR a fila e ENVIAR são coisas separadas. Gerar só cria linhas; nada sai sem aprovação do analista
    (ou etapa marcada como automática) E sem a chave geral `regua_envio_ativo = 1`.
  • Modo teste (padrão LIGADO): toda mensagem vai para o e-mail de teste, nunca para o cliente.
  • Idempotência: (etapa, boleto, canal) é único — a mesma etapa nunca é gerada nem enviada duas vezes.
  • Antes de enviar, o boleto é conferido de novo: pagou, foi cancelado, mudou o vencimento ou o cliente foi
    pausado → a mensagem é descartada. Dados de pagamento desatualizados (sync do Asaas / planilha do Itaú
    antigos) bloqueiam a geração/envio daquela origem.
  • Limite diário de envios e ritmo de ~1 mensagem/s. Falhas não são reenviadas sozinhas.
  • A senha do e-mail nunca é gravada em log nem devolvida pela API.
"""
import json
import os
import re
import smtplib
import ssl
import logging
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from html import escape
from zoneinfo import ZoneInfo

from sqlalchemy import text as _t
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
TZ = ZoneInfo("America/Sao_Paulo")

ETAPAS_PADRAO = [
    # Aviso de LANÇAMENTO do ciclo: um e-mail por cliente com todos os boletos novos dele (PDF do Itaú anexado / link do Asaas).
    # Disparado pela EMISSÃO do boleto (Itaú: data de emissão; Asaas: data de criação). Texto provisório — o Diego define depois.
    dict(chave="lancamento", nome="Lançamento do ciclo", ordem=0, dias=0, canais="email", ativa=True, anexa_boleto=True,
         assunto="Seu boleto da Gestora Smart já está disponível — {competencia}",
         texto=("Olá, {nome}.\n\n"
                "O boleto referente a {competencia} já foi emitido e está disponível para pagamento.\n\n"
                "{link}\n\n"
                "Qualquer dúvida, é só responder este e-mail.")),
    dict(chave="lembrete", nome="Lembrete", ordem=1, dias=-5, canais="email", ativa=False, anexa_boleto=False,
         assunto="Lembrete: boleto de {competencia} vence em {vencimento}",
         texto=("Olá, {nome}.\n\n"
                "Este é um lembrete de que o boleto referente a {competencia}, no valor de {valor}, vence em {vencimento}.\n\n"
                "{link}\n\n"
                "Se o pagamento já foi feito, pode desconsiderar esta mensagem.\n\n"
                "Qualquer dúvida, é só responder este e-mail.")),
    dict(chave="vence_hoje", nome="Vencimento", ordem=2, dias=0, canais="email", ativa=True, anexa_boleto=True,
         assunto="Hoje vence o seu boleto com a Gestora Smart",
         texto=("Olá, {nome}.\n\n"
                "Hoje vence o seu boleto com a Gestora Smart, no valor de {valor} (vencimento {vencimento}). "
                "Caso não tenha acesso ao boleto, estamos deixando ele em anexo.\n\n"
                "{link}\n\n"
                "Se o pagamento já foi feito, pode desconsiderar esta mensagem.")),
    dict(chave="atraso", nome="Em atraso", ordem=3, dias=3, canais="email", ativa=True, anexa_boleto=False,
         assunto="Boleto de {competencia} em atraso",
         texto=("Olá, {nome}.\n\n"
                "Não identificamos o pagamento do boleto referente a {competencia}, no valor de {valor}, que venceu em {vencimento}.\n\n"
                "{link}\n\n"
                "Se o pagamento já foi feito, pode desconsiderar esta mensagem. Se precisar negociar, responda este e-mail.")),
    dict(chave="bloqueio", nome="Aviso de bloqueio", ordem=4, dias=7, canais="email", ativa=True, anexa_boleto=False,
         assunto="Aviso: risco de bloqueio das linhas — boleto de {competencia}",
         texto=("Olá, {nome}.\n\n"
                "O boleto referente a {competencia}, no valor de {valor}, venceu em {vencimento} e segue em aberto.\n\n"
                "Para evitar o bloqueio das linhas, regularize até {data_limite}.\n\n"
                "{link}\n\n"
                "Se o pagamento já foi feito, envie o comprovante respondendo este e-mail.")),
    dict(chave="tarefa", nome="Tarefa para o analista", ordem=5, dias=10, canais="tarefa", ativa=False, anexa_boleto=False,
         assunto="", texto=""),
    # Pedido de autorização do WhatsApp (não é etapa da régua: vai uma vez por cliente, antes da 1ª mensagem por WhatsApp)
    dict(chave="consentimento", nome="Pedido de autorização (WhatsApp)", ordem=9, dias=0, canais="whatsapp", ativa=True, anexa_boleto=False,
         assunto="", texto="Olá, {nome}! Aqui é a Gestora Smart. Podemos enviar lembretes e avisos dos seus boletos por este WhatsApp? Responda SIM ou NÃO. Você continua recebendo por e-mail de qualquer forma."),
]
ETAPA_CONSENTIMENTO = "consentimento"
ETAPA_LANCAMENTO = "lancamento"

CAMPOS = ["nome", "valor", "vencimento", "competencia", "link", "dias_atraso", "data_limite"]
MESES = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
         "outubro", "novembro", "dezembro"]
STATUS_ABERTOS_ASAAS = ("PENDING", "OVERDUE")
TIPOS_ASAAS = ("BOLETO", "UNDEFINED", "PIX")
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$")

_DEFAULTS_CFG = {
    "regua_envio_ativo": "0",          # chave geral — desligada até o Diego ligar
    "regua_modo_teste": "1",           # tudo vai para o e-mail de teste
    "regua_email_teste": "financeiro@gestorasmart.com.br",
    "regua_limite_diario": "300",
    "regua_janela_dias": "3",          # tolerância para gerar uma etapa atrasada (ex.: fim de semana)
    "regua_prazo_bloqueio_dias": "3",  # {data_limite} = hoje + N dias
    "regua_geracao_automatica": "0",   # gera a fila todo dia de manhã (nunca envia sozinho) — nasce DESLIGADO; ligar depois da validação
    "regua_itau_max_dias": "3",        # planilha do Itaú mais velha que isso → não gera a partir do Itaú
    "regua_asaas_max_horas": "12",     # sync do Asaas mais velho que isso → não gera a partir do Asaas
    "cobranca_email_remetente": "financeiro@gestorasmart.com.br",
    "cobranca_email_nome": "Gestora Smart — Contas a Receber",
    "cobranca_smtp_host": "",
    "cobranca_smtp_porta": "587",
    "cobranca_smtp_seguranca": "starttls",   # starttls | ssl
    "cobranca_smtp_usuario": "",
    "cobranca_smtp_senha": "",
    # horário de envio (vale para e-mail e WhatsApp)
    "regua_horario_inicio": "09:00",
    "regua_horario_fim": "18:00",
    "regua_feriados_extra": "",         # datas extras sem envio (municipais/estaduais), separadas por vírgula: 08/04/2026, 25/01
    # WhatsApp (Umbler)
    "whatsapp_ativo": "0",             # chave própria do canal — desligada até o Diego ligar
    "whatsapp_pausado_motivo": "",     # preenchido pelo disjuntor quando o sistema pausa sozinho
    "whatsapp_limite_5min": "100",
    "whatsapp_limite_diario": "30",    # rampa: começa baixo e o Diego sobe aos poucos
    "whatsapp_max_falhas_seguidas": "3",
    "whatsapp_telefone_teste": "",     # no modo teste tudo vai para este número
    "umbler_token": "",
    "umbler_org_id": "",
    "umbler_from_phone": "",           # número do canal que envia (o oficial do financeiro)
    "umbler_base_url": "",
    "whatsapp_canal_estado": "",       # última leitura do estado do canal (informativo)
    # aviso de lançamento do ciclo: só notifica boletos EMITIDOS a partir desta data (vazio = desligado, nada é gerado)
    "regua_lancamento_desde": "",
    "regua_lancamento_janela_dias": "10",   # e só os emitidos nos últimos N dias
    # leitura da caixa de entrada para detectar e-mails devolvidos (IMAP, só leitura)
    "cobranca_imap_host": "",
    "cobranca_imap_porta": "993",
    "cobranca_imap_usuario": "",       # vazio = usa o mesmo usuário/senha do envio
    "cobranca_imap_senha": "",
    # layout dos e-mails (rodapé e contatos — valem para todas as etapas; editáveis na aba Régua)
    "email_duvida_titulo": "Ficou com alguma dúvida?",
    "email_duvida_texto": "Nossa equipe financeira está à disposição para qualquer suporte relacionado ao seu faturamento:",
    "email_contato_email": "contasareceber@gestorasmart.com.br",
    "email_contato_fone": "(11) 91731-2712",
    "email_redes_texto": "Acompanhe nossas novidades nas redes sociais",
    "email_url_instagram": "https://www.instagram.com/gestorasmart",
    "email_url_linkedin": "https://www.linkedin.com/company/gestora-smart/",
    "email_rodape_email": "comunicados@gestorasmart.com.br",
    "email_rodape_endereco": "R. das Bandeiras, 35 – Jardim Santo André – SP, 09090-780",
    "email_rodape_copyright": "Gestora SMART © {ano} · Todos os direitos reservados.",
    "email_rodape_descadastro": "Não quero mais receber estes e-mails",
    "email_rodape_slogan": "SIMCARD | HARDWARE | SOFTWARE",
}
SEGREDOS = {"cobranca_smtp_senha", "umbler_token", "cobranca_imap_senha"}


# ── configuração ───────────────────────────────────────────────────────────────

def carregar_cfg(db: Session) -> dict:
    cfg = dict(_DEFAULTS_CFG)
    try:
        rows = db.execute(_t("SELECT key, value FROM system_settings WHERE key = ANY(:ks)"), {"ks": list(cfg)}).fetchall()
    except Exception:
        return cfg
    for k, v in rows:
        if v is not None and (str(v).strip() != "" or k in ("cobranca_smtp_host", "cobranca_smtp_usuario", "cobranca_smtp_senha", "whatsapp_pausado_motivo", "whatsapp_telefone_teste", "umbler_token", "umbler_org_id", "umbler_from_phone", "umbler_base_url", "whatsapp_canal_estado", "regua_lancamento_desde", "regua_feriados_extra", "email_url_instagram", "email_url_linkedin", "cobranca_imap_host", "cobranca_imap_usuario", "cobranca_imap_senha")):
            cfg[k] = str(v).strip()
    return cfg


def _int(v, padrao):
    try:
        return int(float(str(v).replace(",", ".")))
    except (TypeError, ValueError):
        return padrao


def hoje_br() -> date:
    return datetime.now(TZ).date()


def _hhmm(v, padrao):
    try:
        h, m = str(v).strip().split(":")[:2]
        return int(h) * 60 + int(m)
    except (ValueError, TypeError):
        return padrao


def _pascoa(ano: int) -> date:
    """Domingo de Páscoa (algoritmo gregoriano anônimo)."""
    a, b, c = ano % 19, ano // 100, ano % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes, dia = divmod(h + l - 7 * m + 114, 31)
    return date(ano, mes, dia + 1)


def feriados_do_ano(ano: int, extras: str = "") -> set:
    """Datas SEM envio: feriados nacionais + Carnaval (seg/ter) + Sexta-feira Santa + Corpus Christi
    + as datas extras configuradas (municipais/estaduais): "08/04/2026, 25/01" (sem ano = todo ano)."""
    p = _pascoa(ano)
    fixos = [(1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (11, 20), (12, 25)]
    out = {date(ano, m, d) for m, d in fixos}
    out |= {p - timedelta(days=48), p - timedelta(days=47), p - timedelta(days=2), p + timedelta(days=60)}
    for t in re.split(r"[;,\s]+", extras or ""):
        m = re.fullmatch(r"(\d{1,2})/(\d{1,2})(?:/(\d{4}))?", t.strip())
        if m:
            try:
                dd, mm, aa = int(m.group(1)), int(m.group(2)), m.group(3)
                if aa is None or int(aa) == ano:
                    out.add(date(ano, mm, dd))
            except ValueError:
                pass
    return out


def eh_dia_util(d: date, extras: str = "") -> bool:
    """Segunda a sexta e fora de feriado. O cliente NUNCA recebe cobrança em fim de semana ou feriado."""
    return d.weekday() < 5 and d not in feriados_do_ano(d.year, extras)


def dentro_do_horario(cfg: dict, agora: datetime = None) -> bool:
    """Janela de envio (padrão 09:00–18:00) em dia útil. Vale para e-mail e WhatsApp; não há opção de enviar em fim de semana."""
    agora = agora or datetime.now(TZ)
    if not eh_dia_util(agora.date(), cfg.get("regua_feriados_extra", "")):
        return False
    minutos = agora.hour * 60 + agora.minute
    return _hhmm(cfg["regua_horario_inicio"], 540) <= minutos < _hhmm(cfg["regua_horario_fim"], 1080)


def proximo_envio(cfg: dict, agora: datetime = None) -> str:
    """Texto com a próxima janela em que o sistema pode enviar (ex.: 'segunda 26/10 às 09:00')."""
    agora = agora or datetime.now(TZ)
    ini = _hhmm(cfg["regua_horario_inicio"], 540)
    for i in range(0, 15):
        d = agora.date() + timedelta(days=i)
        if not eh_dia_util(d, cfg.get("regua_feriados_extra", "")):
            continue
        if i == 0 and agora.hour * 60 + agora.minute >= _hhmm(cfg["regua_horario_fim"], 1080):
            continue
        hora = max(ini, agora.hour * 60 + agora.minute) if i == 0 else ini
        nome = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"][d.weekday()]
        return f"{nome} {d.strftime('%d/%m')} às {hora // 60:02d}:{hora % 60:02d}"
    return "sem janela nos próximos 15 dias"


def imap_configurado(cfg: dict) -> bool:
    """A leitura de devoluções usa o usuário/senha do envio quando os do IMAP estão vazios."""
    usuario = cfg["cobranca_imap_usuario"] or cfg["cobranca_smtp_usuario"]
    senha = cfg["cobranca_imap_senha"] or cfg["cobranca_smtp_senha"]
    return bool(cfg["cobranca_imap_host"] and usuario and senha)


def whatsapp_configurado(cfg: dict) -> bool:
    return bool(cfg["umbler_token"] and cfg["umbler_org_id"] and cfg["umbler_from_phone"])


def smtp_configurado(cfg: dict) -> bool:
    return bool(cfg["cobranca_smtp_host"] and cfg["cobranca_smtp_usuario"] and cfg["cobranca_smtp_senha"])


def garantir_etapas(db: Session) -> None:
    """Cria as etapas-padrão que ainda não existem (nunca sobrescreve o que o analista editou)."""
    from app.models.extra import CobrancaEtapa
    existentes = {c for (c,) in db.query(CobrancaEtapa.chave).all()}
    novas = [e for e in ETAPAS_PADRAO if e["chave"] not in existentes]
    for e in novas:
        d = dict(e)
        d["wa_params"] = "nome" if d["chave"] == ETAPA_CONSENTIMENTO else None
        d.setdefault("anexa_boleto", False)
        db.execute(_t("""INSERT INTO cobranca_etapas (chave, nome, ordem, ativa, dias, canais, modo, assunto, texto, wa_params, anexa_boleto)
                          VALUES (:chave, :nome, :ordem, :ativa, :dias, :canais, 'aprovar', :assunto, :texto, :wa_params, :anexa_boleto)
                          ON CONFLICT (chave) DO NOTHING"""), d)
    if novas:
        db.commit()
    # migração única (24/10/2026): etapas que ninguém editou passam para os padrões novos (lançamento + vencimento levam o boleto;
    # lembrete desligado; atraso/bloqueio só texto). O que o Diego/analista já editou NÃO é tocado.
    if not db.execute(_t("SELECT 1 FROM system_settings WHERE key = 'cobranca_etapas_v2'")).fetchone():
        for e in ETAPAS_PADRAO:
            if e["chave"] in existentes:
                db.execute(_t("""UPDATE cobranca_etapas SET nome=:nome, ordem=:ordem, ativa=:ativa, assunto=:assunto, texto=:texto, anexa_boleto=:anexa_boleto
                                  WHERE chave=:chave AND updated_by IS NULL"""), {**e, "anexa_boleto": bool(e.get("anexa_boleto", False))})
        db.execute(_t("INSERT INTO system_settings (key, value) VALUES ('cobranca_etapas_v2', 'ok') ON CONFLICT (key) DO NOTHING"))
        db.commit()


# ── utilidades ─────────────────────────────────────────────────────────────────

def so_digitos(s) -> str:
    return re.sub(r"\D", "", str(s or ""))


def emails_validos(s) -> list:
    """Aceita 'a@x.com, b@y.com;c@z.com'. Devolve só os válidos, sem repetir (máx. 3)."""
    vistos, out = set(), []
    for p in re.split(r"[;,\s]+", str(s or "")):
        p = p.strip().lower()
        if p and _EMAIL_RE.match(p) and p not in vistos:
            vistos.add(p); out.append(p)
    return out[:3]


def brl(v) -> str:
    return "R$ " + f"{float(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def competencia_de(venc: date) -> str:
    """Competência = mês anterior ao vencimento (mesma regra da lista de vencidos)."""
    m, a = venc.month - 1, venc.year
    if m == 0:
        m, a = 12, a - 1
    return f"{MESES[m]}/{a}"


def renderizar(etapa_assunto: str, etapa_texto: str, e, hoje: date, prazo_bloqueio: int = 3, anexa: bool = True, link_txt: str = None) -> tuple:
    """Troca os {campos} (troca simples — campo desconhecido fica como está). Devolve (assunto, texto_puro)."""
    venc = e.vencimento
    atraso = max(0, (hoje - venc).days) if venc else 0
    origem = getattr(e, "origem", None)
    if origem == "itau" and anexa:
        link = "O boleto está anexado a este e-mail (PDF). Se preferir, copie a linha digitável abaixo e pague no aplicativo do seu banco."
    elif origem == "lancamento":
        link = link_txt or "Os boletos estão listados abaixo."
    elif origem == "itau":
        link = "Para receber a segunda via do boleto, responda este e-mail."
    elif e.link:
        link = f"Ver a fatura e pagar: {e.link}"
    else:
        link = "Para receber a segunda via do boleto, responda este e-mail."
    vals = {
        "nome": (e.nome or "").strip() or "cliente",
        "valor": brl(e.valor),
        "vencimento": venc.strftime("%d/%m/%Y") if venc else "",
        "competencia": competencia_de(venc) if venc else "",
        "link": link,
        "dias_atraso": str(atraso),
        "data_limite": (hoje + timedelta(days=prazo_bloqueio)).strftime("%d/%m/%Y"),
    }

    def aplicar(t):
        t = t or ""
        for k, v in vals.items():
            t = t.replace("{" + k + "}", v)
        return t
    assunto = re.sub(r"\s+", " ", aplicar(etapa_assunto)).strip()
    corpo = re.sub(r"\n{3,}", "\n\n", aplicar(etapa_texto)).strip()
    return assunto, corpo


def corpo_html(texto: str, rodape: str) -> str:
    paras = []
    for bloco in texto.split("\n\n"):
        h = escape(bloco).replace("\n", "<br>")
        h = re.sub(r"(https?://[^\s<]+)", r'<a href="\1">\1</a>', h)
        paras.append(f'<p style="margin:0 0 14px">{h}</p>')
    return ('<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">'
            + "".join(paras) + f'<p style="margin:18px 0 0;color:#777;font-size:12px">{escape(rodape)}</p></div>')


# Campos do layout editáveis POR ETAPA (cobranca_etapas.layout = JSON). Vazio = padrão. Aceitam {campos} como o texto.
LAYOUT_ETAPA = {"titulo": 200, "preheader": 200, "secao_titulo": 120, "secao_sub": 200, "card_valor": 120, "card_venc": 120}
# Campos GLOBAIS (rodapé/contatos) = chaves email_* de system_settings. Limite de tamanho de cada um:
LAYOUT_GLOBAL = {"duvida_titulo": 120, "duvida_texto": 400, "contato_email": 120, "contato_fone": 40, "redes_texto": 120,
                 "url_instagram": 200, "url_linkedin": 200, "rodape_email": 120, "rodape_endereco": 200,
                 "rodape_copyright": 200, "rodape_descadastro": 120, "rodape_slogan": 80}


def layout_etapa(et) -> dict:
    """Layout salvo da etapa, só com os campos conhecidos (texto vazio = usa o padrão)."""
    try:
        d = json.loads(getattr(et, "layout", None) or "{}")
        d = d if isinstance(d, dict) else {}
    except (ValueError, TypeError):
        d = {}
    return {k: str(d.get(k) or "").strip()[:n] for k, n in LAYOUT_ETAPA.items()}


def layout_global(cfg: dict) -> dict:
    return {k: str((cfg or {}).get("email_" + k, _DEFAULTS_CFG["email_" + k]) or "").strip() for k in LAYOUT_GLOBAL}


# ── identidade visual dos e-mails: modelo HTML da marca (email_assets/modelo_email.html) ──────────
# Imagens vão ANEXADAS ao e-mail (cid:) — não dependem de "carregar imagens" nem de hospedagem.
_ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "email_assets")
_CACHE: dict = {}
_IMAGENS = ("logo-topo", "cabecalho-decoracao", "icone-banco", "icone-calendario", "icone-email", "icone-instagram",
            "icone-linkedin", "icone-local", "logo-rodape-branco")


def _ler(nome: str) -> bytes:
    if nome not in _CACHE:
        try:
            with open(os.path.join(_ASSETS, nome), "rb") as f:
                _CACHE[nome] = f.read()
        except OSError:
            _CACHE[nome] = b""
    return _CACHE[nome]


def imagens_inline() -> list:
    """[(cid, bytes_png)] das imagens do modelo. Arquivo ausente = imagem some, o e-mail sai igual."""
    return [(n, _ler(n + ".png")) for n in _IMAGENS if _ler(n + ".png")]


def html_com_imagens(html: str, inline: list) -> str:
    """Troca cid:<nome> por data URI — para mostrar o e-mail numa prévia na tela (o e-mail enviado usa as imagens anexadas)."""
    import base64
    mapa = {n: "data:image/png;base64," + base64.b64encode(d).decode() for n, d in inline}
    return re.sub(r"cid:([a-z-]+)", lambda m: mapa.get(m.group(1), m.group(0)), html)


def exemplo_email(et, assunto: str, texto: str, cfg: dict, hoje: date, origem: str, layout: dict = None) -> dict:
    """E-mail COMPLETO (HTML) de exemplo da etapa, com os textos digitados e um cliente fictício — só para a prévia."""
    from types import SimpleNamespace as N
    dias = getattr(et, "dias", 0) or 0
    venc = hoje + timedelta(days=10) if et.chave == ETAPA_LANCAMENTO else hoje - timedelta(days=dias)
    e = N(nome="Cliente Exemplo LTDA", valor=1240.50, vencimento=venc, origem=origem,
          link="https://www.asaas.com/i/exemplo" if origem == "asaas" else None)
    ef = N(assunto=assunto, texto=texto, anexa_boleto=bool(getattr(et, "anexa_boleto", False)), chave=et.chave,
           layout=json.dumps(layout) if layout is not None else getattr(et, "layout", None))
    linha = "34191.09008 61207.727808 71234.567890 1 11110000124050"
    if et.chave == ETAPA_LANCAMENTO:
        b = {"valor": 1240.50, "venc": venc, "link": e.link, "anexo": None if origem == "asaas" else {"bytes": b"%PDF", "linha": linha}}
        m = montar_email_lancamento(e, ef, cfg, hoje, [b])
    else:
        m = montar_email(e, ef, cfg, hoje, {"bytes": b"%PDF", "linha": linha} if origem == "itau" else None)
    return {"assunto": m["assunto"], "html": html_com_imagens(m["html"], m["inline"])}


def _titulo_em_duas_linhas(t: str) -> tuple:
    """Divide o título como no modelo: começo em preto, final em verde."""
    p = t.split()
    if len(p) < 3:
        return t, ""
    k = max(1, round(len(p) * 0.6))
    return " ".join(p[:k]), " ".join(p[k:])


def secao_html(titulo: str, subtitulo: str, cartoes: list = None, extra: str = "") -> str:
    """Bloco 'O que muda' do modelo: barrinha verde, título, até 2 cartões (ícone, destaque, texto) e HTML extra."""
    out = ('<tr><td class="px" style="padding:36px 48px 0 48px;font-family:Arial,Helvetica,sans-serif;">'
           '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" style="width:36px;height:3px;line-height:3px;font-size:0;background-color:#3cc46a;">&nbsp;</td></tr></table>'
           f'<p style="margin:14px 0 4px 0;font-size:24px;line-height:30px;font-weight:bold;color:#111827;">{escape(titulo)}</p>'
           + (f'<p style="margin:0;font-size:15px;line-height:22px;color:#6b7280;">{escape(subtitulo)}</p>' if subtitulo else '') + '</td></tr>')
    if cartoes:
        def card(ic, destaque, txt, esq):
            pad = "4px 20px 4px 0px" if esq else "4px 0px 4px 20px"
            return (f'<td class="col" width="275" valign="top" style="width:255px;padding:{pad};">'
                    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
                    f'<td width="44" valign="top" style="width:36px;padding:0 8px 0 0;"><img src="cid:{ic}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;"></td>'
                    '<td valign="top" style="font-family:Arial,Helvetica,sans-serif;">'
                    f'<p style="margin:2px 0 4px 0;font-size:14px;line-height:19px;font-weight:bold;color:#111827;">{escape(destaque)}</p>'
                    f'<p style="margin:0;font-size:13px;line-height:19px;color:#5b6472;">{escape(txt)}</p></td></tr></table></td>')
        celulas = card(*cartoes[0], True)
        if len(cartoes) > 1:
            celulas += ('<td class="col-gap" width="1" style="width:1px;background-color:#e5e7eb;font-size:0;line-height:0;">&nbsp;</td>' + card(*cartoes[1], False))
        out += ('<tr><td class="cards" style="padding:24px 24px 0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">'
                f'<tr>{celulas}</tr></table></td></tr>')
    if extra:
        out += f'<tr><td class="px" style="padding:24px 48px 0 48px;font-family:Arial,Helvetica,sans-serif;">{extra}</td></tr>'
    return out


def layout_email(titulo: str, corpo_paras: str, secao: str, cfg: dict = None, preheader: str = "") -> str:
    """Monta o e-mail final a partir do modelo da marca. `corpo_paras` e `secao` já vêm com HTML seguro (escapado).
    Rodapé/contatos vêm das configurações (email_*); tudo é escapado aqui."""
    try:
        with open(os.path.join(_ASSETS, "modelo_email.html"), encoding="utf-8") as f:
            m = f.read()
    except OSError:
        return f"<html><body>{corpo_paras}{secao}</body></html>"
    g = layout_global(cfg)
    a, b = _titulo_em_duas_linhas(titulo)
    ano = str(datetime.now(ZoneInfo("America/Sao_Paulo")).year)
    from urllib.parse import quote_plus

    def url_ok(u):
        return u if re.match(r"^https://[^\s\"'<>]+$", u or "") else ""
    redes = ""
    for chave, cid, nome in (("url_instagram", "icone-instagram", "Instagram"), ("url_linkedin", "icone-linkedin", "LinkedIn")):
        u = url_ok(g[chave])
        if u:
            redes += (f'<td style="padding:0 14px 0 0;"><a href="{escape(u, quote=True)}" target="_blank" style="text-decoration:none;">'
                      f'<img src="cid:{cid}" width="22" height="22" alt="{nome}" style="display:block;width:22px;height:22px;border:0;"></a></td>')
    em = lambda v: escape(re.sub(r"[^A-Za-z0-9._%+@-]", "", v or ""), quote=True)
    slogan = escape(g["rodape_slogan"]).replace(" | ", "&nbsp;|&nbsp;")
    mapa = dict((("TITLE", escape(titulo)), ("PREHEADER", escape(preheader or titulo)), ("H1A", escape(a)),
                 ("H1B", escape(b)), ("CORPO", corpo_paras), ("SECAO", secao),
                 ("DUVIDA_TITULO", escape(g["duvida_titulo"])), ("DUVIDA_TEXTO", escape(g["duvida_texto"])),
                 ("CONTATO_EMAIL", em(g["contato_email"])), ("CONTATO_FONE", escape(g["contato_fone"])),
                 ("REDES_TEXTO", escape(g["redes_texto"])), ("TD_REDES", redes),
                 ("RODAPE_EMAIL", em(g["rodape_email"])), ("ENDERECO", escape(g["rodape_endereco"])),
                 ("MAPS_URL", "https://www.google.com/maps/search/?api=1&amp;query=" + quote_plus(g["rodape_endereco"])),
                 ("COPYRIGHT", escape(g["rodape_copyright"].replace("{ano}", ano))),
                 ("DESCADASTRO_TEXTO", escape(g["rodape_descadastro"])), ("SLOGAN", slogan)))
    return re.sub(r"\{\{([A-Z_0-9]+)\}\}", lambda x: mapa.get(x.group(1), x.group(0)), m)


def _kv(rotulo: str, valor: str) -> str:
    return (f'<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%">{escape(rotulo)}</td>'
            f'<td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">{escape(valor)}</td></tr>')


def montar_email(e, et, cfg: dict, hoje: date, anexo: dict = None, link_atual: str = None) -> dict:
    """Monta a notificação COMPLETA de cobrança: assunto, texto, HTML e anexo.
      • Itaú  → o boleto em PDF vai ANEXADO (+ linha digitável para copiar e colar, quando o PDF a traz);
      • Asaas → botão/link da fatura (invoice_url).
    O bloco de pagamento é sempre garantido, mesmo que o texto da etapa tenha sido editado sem o campo {link}.
    `anexo` = {'nome', 'bytes', 'linha'} do boleto do Itaú; `link_atual` = link mais recente do Asaas."""
    if link_atual and not e.link:
        e.link = link_atual
    levaboleto = bool(getattr(et, "anexa_boleto", False))
    assunto, corpo = renderizar(et.assunto, et.texto, e, hoje, _int(cfg["regua_prazo_bloqueio_dias"], 3), anexa=levaboleto)
    itau = getattr(e, "origem", None) == "itau" and levaboleto
    linha = (anexo or {}).get("linha")
    pagar_txt = ""
    if "{link}" not in (et.texto or ""):                      # garantia: o texto editado perdeu o campo — o bloco entra sozinho
        _, pagar_txt = renderizar("", "{link}", e, hoje, anexa=levaboleto)
    texto = corpo + (("\n\n" + pagar_txt) if pagar_txt else "")
    venc = e.vencimento
    resumo_txt = [f"Competência: {competencia_de(venc) if venc else '-'}", f"Valor: {brl(e.valor)}", f"Vencimento: {venc.strftime('%d/%m/%Y') if venc else '-'}"]
    if itau and linha:
        texto += f"\n\nLinha digitável:\n{linha}"
    texto += "\n\n— Resumo —\n" + "\n".join(resumo_txt)

    # HTML com a identidade da marca: texto, bloco de pagamento (botão Asaas / PDF + linha digitável Itaú) e dados do boleto
    paras = []
    for bloco in corpo.split("\n\n"):
        h = escape(bloco).replace("\n", "<br>")
        h = re.sub(r"(https?://[^\s<]+)", r'<a href="\1" style="color:#15803d">\1</a>', h)
        paras.append(f'<p style="margin:0 0 16px 0;">{h}</p>')
    if itau:
        cta = ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px"><tr><td style="padding:14px 18px;font-size:14px;color:#14532d">'
               '<b>O boleto está anexado a este e-mail (PDF).</b>'
               + (f'<div style="margin-top:10px;font-size:12px;color:#166534">Linha digitável (copie e cole no app do banco):</div>'
                  f'<div style="font-family:Consolas,Menlo,monospace;font-size:13px;color:#111827;word-break:break-all;margin-top:3px">{escape(linha)}</div>' if linha else '')
               + '</td></tr></table>')
    elif e.link:
        cta = (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="background:#16a34a;border-radius:8px">'
               f'<a href="{escape(e.link, quote=True)}" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px">Ver fatura e pagar</a></td></tr></table>')
    else:
        cta = ''
    lay = layout_etapa(et)
    prazo = _int(cfg["regua_prazo_bloqueio_dias"], 3)
    campo = lambda v: renderizar("", v, e, hoje, prazo, anexa=levaboleto)[1] if v else ""      # layout aceita {campos} como o texto
    cartoes = [("icone-banco", brl(e.valor), campo(lay["card_valor"]) or f"Boleto bancário · competência {competencia_de(venc) if venc else '-'}"),
               ("icone-calendario", venc.strftime("%d/%m/%Y") if venc else "-", campo(lay["card_venc"]) or "Data de vencimento")]
    secao = secao_html(campo(lay["secao_titulo"]) or "Dados do boleto", campo(lay["secao_sub"]) or "Confira as informações e a forma de pagamento:", cartoes, cta)
    html = layout_email(campo(lay["titulo"]) or assunto, "".join(paras), secao, cfg, preheader=campo(lay["preheader"]) or re.sub(r"\s+", " ", corpo)[:110])
    anexos = []
    if itau and anexo and anexo.get("bytes"):
        comp = (competencia_de(venc) if venc else "boleto").replace("/", "-")
        nome_cli = re.sub(r"[^A-Za-z0-9]+", "_", (e.nome or "cliente"))[:40].strip("_")
        anexos.append((f"Boleto_{comp}_{nome_cli}.pdf", anexo["bytes"], "application/pdf"))
    return {"assunto": assunto, "texto": texto, "html": html, "anexos": anexos, "inline": imagens_inline()}


# ── frescor dos dados de pagamento ─────────────────────────────────────────────

def frescor(db: Session, cfg: dict) -> dict:
    """Idade dos dados de onde sabemos se o boleto foi pago. Dado velho = risco de cobrar quem já pagou."""
    agora = datetime.now(timezone.utc)
    asaas_at = db.execute(_t("SELECT max(synced_at) FROM asaas_payments_sync")).scalar()
    itau_at = db.execute(_t("SELECT max(uploaded_at) FROM itau_boletos")).scalar()

    def idade_h(x):
        return None if x is None else (agora - x).total_seconds() / 3600.0
    ha, hi = idade_h(asaas_at), idade_h(itau_at)
    return {
        "asaas_em": asaas_at.isoformat() if asaas_at else None, "asaas_ok": ha is not None and ha <= _int(cfg["regua_asaas_max_horas"], 12),
        "itau_em": itau_at.isoformat() if itau_at else None, "itau_ok": hi is not None and hi <= _int(cfg["regua_itau_max_dias"], 3) * 24,
    }


# ── contatos ───────────────────────────────────────────────────────────────────

def mapa_contatos(db: Session) -> dict:
    """id_smart / cnpj → {'email': 'a@x, b@y', 'origem': 'cadastro'|'asaas'}. Cadastro (client_profiles) tem prioridade."""
    out = {}
    for r in db.execute(_t("""SELECT external_reference AS ref, regexp_replace(COALESCE(cpf_cnpj,''), '\\D', '', 'g') AS c, email
                                FROM asaas_customers_sync WHERE COALESCE(email,'') <> ''""")):
        for k in filter(None, (r.ref, r.c)):
            out.setdefault(k, {"email": r.email, "origem": "asaas"})
    for r in db.execute(_t("""SELECT id_smart, regexp_replace(COALESCE(cnpj,''), '\\D', '', 'g') AS c, email
                                FROM client_profiles WHERE COALESCE(email,'') <> ''""")):
        for k in filter(None, (r.id_smart, r.c)):
            out[k] = {"email": r.email, "origem": "cadastro"}
    return out


def _excluidos(db: Session) -> set:
    try:
        v = db.execute(_t("SELECT value FROM system_settings WHERE key = 'cnpj_excluidos'")).scalar()
    except Exception:
        v = None
    base = v if v else "22222222222\n24152616000146"
    return {so_digitos(x) for x in str(base).split() if so_digitos(x)}


def _pausados(db: Session, hoje: date) -> set:
    return {r[0] for r in db.execute(_t(
        "SELECT id_smart FROM cobranca_pausas WHERE ativa AND (ate IS NULL OR ate >= :h)"), {"h": hoje})}


# ── geração da fila ────────────────────────────────────────────────────────────

def _boletos_abertos(db: Session, de: date, ate: date, fresco: dict) -> list:
    """Boletos em aberto com vencimento em [de, ate], das origens com dados frescos."""
    itens = []
    if fresco["asaas_ok"]:
        for r in db.execute(_t("""
            SELECT asaas_id, customer_name, customer_cpf_cnpj, external_reference, value, due_date, invoice_url, description
              FROM asaas_payments_sync
             WHERE status = ANY(:st) AND COALESCE(billing_type,'BOLETO') = ANY(:bt)
               AND due_date BETWEEN :d AND :a AND COALESCE(value,0) > 0"""),
                {"st": list(STATUS_ABERTOS_ASAAS), "bt": list(TIPOS_ASAAS), "d": de, "a": ate}):
            cnpj = so_digitos(r.customer_cpf_cnpj)
            itens.append(dict(origem="asaas", ref=f"asaas:{r.asaas_id}:{r.due_date.isoformat()}", cnpj=cnpj,
                              id_smart=id_canonico(r.external_reference, cnpj), nome=r.customer_name,
                              valor=float(r.value), venc=r.due_date, link=r.invoice_url, desc=(r.description or "")[:300],
                              boleto_ok=bool((r.invoice_url or "").startswith("http"))))
    if fresco["itau_ok"]:
        for r in db.execute(_t("""
            SELECT i.nosso_numero, i.pagador, i.cpf_cnpj, i.valor_titulo, i.data_vencimento,
                   EXISTS (SELECT 1 FROM cobranca_boletos_itau b WHERE b.nosso_numero = i.nosso_numero) AS tem_pdf
              FROM itau_boletos i
             WHERE i.data_pagamento IS NULL AND i.data_baixa IS NULL AND COALESCE(i.status,'') NOT IN ('paga','cancelada')
               AND i.data_vencimento BETWEEN :d AND :a AND COALESCE(i.valor_titulo,0) > 0"""), {"d": de, "a": ate}):
            cnpj = so_digitos(r.cpf_cnpj)
            itens.append(dict(origem="itau", ref=f"itau:{r.nosso_numero}:{r.data_vencimento.isoformat()}", cnpj=cnpj,
                              id_smart=f"ss_{cnpj}" if cnpj else None, nome=r.pagador, valor=float(r.valor_titulo),
                              venc=r.data_vencimento, link=None, desc="", boleto_ok=bool(r.tem_pdf)))
    return itens


def mapa_telefones(db: Session) -> dict:
    """id_smart / cnpj → telefone de WhatsApp (E.164) ou ausente. Cadastro tem prioridade; depois celular do Asaas."""
    from app.services.umbler import normalizar_telefone
    out = {}
    for r in db.execute(_t("""SELECT external_reference AS ref, regexp_replace(COALESCE(cpf_cnpj,''), '\\D', '', 'g') AS c, mobile_phone, phone
                                FROM asaas_customers_sync""")):
        tel = normalizar_telefone(r.mobile_phone) or normalizar_telefone(r.phone)
        if tel:
            for k in filter(None, (r.ref, r.c)):
                out.setdefault(k, tel)
    for r in db.execute(_t("""SELECT id_smart, regexp_replace(COALESCE(cnpj,''), '\\D', '', 'g') AS c, telefone
                                FROM client_profiles WHERE COALESCE(telefone,'') <> ''""")):
        tel = normalizar_telefone(r.telefone)
        if tel:
            for k in filter(None, (r.id_smart, r.c)):
                out[k] = tel
    return out


def id_canonico(ref, cnpj: str):
    """'ss_12345678000199' (ignora sufixos como '|2026-10' do externalReference). Sem referência válida → 'ss_<cnpj>'."""
    m = re.match(r"ss_\d+", str(ref or ""))
    if m:
        return m.group(0)
    return f"ss_{cnpj}" if cnpj else None


def _inserir(db: Session, **v) -> bool:
    """Insere um item da fila. Falha de UM registro (dado ruim) nunca derruba a geração inteira: vai num savepoint."""
    for k, lim in (("id_smart", 40), ("cnpj", 20), ("nome", 300), ("destino", 400), ("destino_origem", 20), ("link", 500), ("desc", 300), ("telefone", 20)):
        if v.get(k) is not None:
            v[k] = str(v[k])[:lim]
    try:
        with db.begin_nested():
            return _inserir_sql(db, **v)
    except Exception as ex:
        logger.warning("cobranca: item ignorado (%s): %s", v.get("ref"), str(ex)[:120])
        return False


def _inserir_sql(db: Session, **v) -> bool:
    r = db.execute(_t("""
        INSERT INTO cobranca_envios (etapa, canal, boleto_ref, origem, id_smart, cnpj, nome, destino, destino_origem,
                                     vencimento, valor, link, descricao, status, tentativas, telefone, erro)
        VALUES (:etapa, :canal, :ref, :origem, :id_smart, :cnpj, :nome, :destino, :destino_origem,
                :venc, :valor, :link, :desc, :status, 0, :telefone, :erro)
        ON CONFLICT (etapa, boleto_ref, canal) DO NOTHING"""),
        {"destino": None, "destino_origem": None, "telefone": None, "origem": None, "link": None, "desc": None,
         "venc": None, "valor": None, "erro": None, **v})
    return bool(r.rowcount)


def gerar_fila(db: Session, hoje: date = None) -> dict:
    """Cria (sem enviar) os itens da fila de hoje. Idempotente: rodar de novo não duplica nada.
    E-mail é o canal obrigatório. WhatsApp é adicional: só para cliente que autorizou; quem ainda não foi
    perguntado recebe UM pedido de autorização (aprovado pelo analista como qualquer outro envio)."""
    from app.models.extra import CobrancaEtapa
    garantir_etapas(db)
    hoje = hoje or hoje_br()
    cfg = carregar_cfg(db)
    janela = max(0, _int(cfg["regua_janela_dias"], 3))
    fresco = frescor(db, cfg)
    todas = db.query(CobrancaEtapa).order_by(CobrancaEtapa.ordem).all()
    etapas = [e for e in todas if e.ativa and e.chave not in (ETAPA_CONSENTIMENTO, ETAPA_LANCAMENTO)]
    et_consent = next((e for e in todas if e.chave == ETAPA_CONSENTIMENTO), None)
    contatos, excl, pausados = mapa_contatos(db), _excluidos(db), _pausados(db, hoje)
    telefones = mapa_telefones(db)
    invalidos = {r[0] for r in db.execute(_t("SELECT email FROM cobranca_emails_invalidos WHERE NOT COALESCE(liberado, false)"))}
    consent = {r[0]: r[1] for r in db.execute(_t("SELECT id_smart, status FROM cobranca_whatsapp_consent"))}
    pedido_ja = {r[0] for r in db.execute(_t("SELECT id_smart FROM cobranca_envios WHERE etapa = :e AND NOT COALESCE(modo_teste, false)"), {"e": ETAPA_CONSENTIMENTO})}

    criados = {e.chave: 0 for e in etapas}
    criados[ETAPA_CONSENTIMENTO] = 0
    criados[ETAPA_LANCAMENTO] = 0
    sem_contato = ignorados = sem_telefone = sem_template = sem_autorizacao = 0
    for et in etapas:
        # offset = hoje - vencimento; a etapa é gerada só na sua faixa (vence hoje = só no dia; lembrete = só antes do vencimento)
        lo, hi = faixa_geracao(et, janela)
        d_ate = hoje - timedelta(days=lo)
        d_de = hoje - timedelta(days=hi)
        canais = [c for c in str(et.canais or "").split(",") if c in ("email", "tarefa", "whatsapp")]
        # etapa de e-mail mais avançada que também já "vale" para o boleto tem prioridade (ex.: boleto 7 dias vencido
        # recebe só "bloqueio", não também "vence hoje" e "atraso")
        mais_avancadas = [x.dias for x in etapas if x.chave != et.chave and x.dias > et.dias and envia_msg(x)]
        for b in _boletos_abertos(db, d_de, d_ate, fresco):
            offset = (hoje - b["venc"]).days
            if any(d <= offset for d in mais_avancadas):
                canais_b = [c for c in canais if c not in ("email", "whatsapp")]
            else:
                canais_b = canais
            if not canais_b:
                continue
            if not b["id_smart"] or b["cnpj"] in excl or b["id_smart"] in pausados:
                ignorados += 1
                continue
            c = contatos.get(b["id_smart"]) or contatos.get(b["cnpj"]) or {}
            bruta = emails_validos(c.get("email"))
            lista = [x for x in bruta if x not in invalidos]
            devolvido = bool(bruta and not lista)          # todos os endereços já devolveram antes
            base = dict(origem=b["origem"], id_smart=b["id_smart"], cnpj=b["cnpj"], nome=(b["nome"] or "")[:300],
                        venc=b["venc"], valor=b["valor"], link=b["link"], desc=b["desc"])
            for canal in canais_b:
                if canal == "whatsapp":
                    tel = telefones.get(b["id_smart"]) or telefones.get(b["cnpj"])
                    st = consent.get(b["id_smart"])
                    if st != "aceitou" and "email" not in canais:
                        sem_autorizacao += 1                   # etapa só de WhatsApp e o cliente ainda não autorizou: nada sai para ele
                    if not tel:
                        sem_telefone += 1
                    elif st == "aceitou":
                        if not et.wa_template_id:
                            sem_template += 1
                        elif _inserir(db, etapa=et.chave, canal="whatsapp", ref=b["ref"], status="pendente", telefone=tel, destino=tel, **base):
                            criados[et.chave] += 1
                    elif st is None and b["id_smart"] not in pedido_ja:
                        if not (et_consent and et_consent.ativa and et_consent.wa_template_id):
                            sem_template += 1
                        else:
                            pedido_ja.add(b["id_smart"])
                            if _inserir(db, etapa=ETAPA_CONSENTIMENTO, canal="whatsapp", ref=f"consent:{b['id_smart']}", status="pendente",
                                        telefone=tel, destino=tel, **base):
                                criados[ETAPA_CONSENTIMENTO] += 1
                    continue
                status = "pendente"
                destino = ", ".join(lista) if canal == "email" else None
                erro_novo = None
                if canal == "email":
                    if not lista:
                        status = "sem_contato"
                    elif et.anexa_boleto and not b.get("boleto_ok", True):   # etapa que leva boleto: Itaú = PDF, Asaas = link da fatura
                        status = "sem_boleto"
                        erro_novo = ("boleto do Itaú ainda não foi enviado ao sistema (aba Boletos Itaú)" if b["origem"] == "itau"
                                     else "fatura do Asaas sem link — conferir o boleto no Asaas")
                    # item que esperava contato/boleto e agora está completo (ou o contrário) é reavaliado
                    db.execute(_t("""UPDATE cobranca_envios SET status=:st, destino=COALESCE(:d, destino), destino_origem=COALESCE(:o, destino_origem), erro=:er
                                      WHERE etapa=:e AND boleto_ref=:r AND canal='email' AND status IN ('sem_contato','sem_boleto') AND status <> :st"""),
                               {"st": status, "d": (destino[:400] if destino else None), "o": c.get("origem") if lista else None, "er": erro_novo, "e": et.chave, "r": b["ref"]})
                if _inserir(db, etapa=et.chave, canal=canal, ref=b["ref"], status=status, destino=destino or (", ".join(bruta) if devolvido else None),
                            destino_origem=c.get("origem") if (lista or devolvido) else None,
                            erro=erro_novo or (("e-mail devolvido anteriormente: " + ", ".join(bruta)) if (canal == "email" and devolvido) else None), **base):
                    criados[et.chave] += 1
                    if status == "sem_contato":
                        sem_contato += 1
    # aviso de lançamento (1 e-mail por cliente com todos os boletos novos) + reavaliação dos que esperavam PDF/link/e-mail
    criados[ETAPA_LANCAMENTO] = gerar_lancamento(db, hoje, cfg, fresco, contatos, excl, pausados, invalidos)
    reavaliar_lancamentos(db)
    db.commit()
    return {"data": hoje.isoformat(), "criados": criados, "total_criados": sum(criados.values()),
            "sem_contato": sem_contato, "ignorados": ignorados, "sem_telefone": sem_telefone, "sem_template": sem_template,
            "sem_autorizacao": sem_autorizacao,
            "frescor": fresco}


# ── Aviso de LANÇAMENTO do ciclo ───────────────────────────────────────────────

def _data_cfg(v):
    try:
        return date.fromisoformat(str(v).strip()[:10]) if str(v or "").strip() else None
    except ValueError:
        return None


def _estado_boleto_lanc(db: Session, b) -> dict:
    """Situação ATUAL de um boleto do aviso: aberto? tem PDF/link? valor e vencimento de hoje."""
    if b["origem"] == "asaas":
        r = db.execute(_t("SELECT status, due_date, value, invoice_url FROM asaas_payments_sync WHERE asaas_id = :a"), {"a": b["ref_id"]}).fetchone()
        if not r:
            return {"aberto": False}
        link = r.invoice_url if (r.invoice_url or "").startswith("http") else None
        return {"aberto": r.status in STATUS_ABERTOS_ASAAS, "ok": bool(link), "motivo": "fatura do Asaas sem link", "link": link, "anexo": None,
                "valor": float(r.value or 0), "venc": r.due_date}
    r = db.execute(_t("SELECT status, data_pagamento, data_baixa, valor_titulo, data_vencimento FROM itau_boletos WHERE nosso_numero = :n"), {"n": b["ref_id"]}).fetchone()
    if not r or r.data_pagamento or r.data_baixa or (r.status or "") in ("paga", "cancelada"):
        return {"aberto": False}
    anexo, motivo = pdf_itau(db, b["ref_id"])
    return {"aberto": True, "ok": anexo is not None, "motivo": motivo, "link": None, "anexo": anexo, "valor": float(r.valor_titulo or 0), "venc": r.data_vencimento}


def _recalcular_grupo(db: Session, envio_id: int, emails: list, devolvido: bool = False) -> None:
    """Atualiza valor total, vencimento, descrição e situação do item de lançamento (só se ainda não foi aprovado)."""
    from app.models.extra import CobrancaEnvio
    e = db.get(CobrancaEnvio, envio_id)
    rows = db.execute(_t("SELECT origem, ref_id, vencimento, valor FROM cobranca_envio_boletos WHERE envio_id = :i ORDER BY vencimento, id"), {"i": envio_id}).mappings().all()
    if not e or not rows:
        return
    total, faltam = 0.0, []
    for b in rows:
        st = _estado_boleto_lanc(db, b)
        total += st.get("valor", b["valor"] or 0) if st.get("aberto") else 0
        if st.get("aberto") and not st.get("ok"):
            faltam.append(st.get("motivo") or "boleto indisponível")
    e.valor = round(total, 2)
    e.vencimento = min(b["vencimento"] for b in rows if b["vencimento"])
    e.descricao = f"{len(rows)} boleto(s)"
    if e.status in ("pendente", "sem_contato", "sem_boleto"):
        if not emails:
            e.status, e.erro = "sem_contato", ("e-mail devolvido anteriormente" if devolvido else None)
        elif faltam:
            e.status, e.erro = "sem_boleto", "; ".join(sorted(set(faltam)))[:300]
        else:
            e.status, e.erro = "pendente", None


def gerar_lancamento(db: Session, hoje: date, cfg: dict, fresco: dict, contatos: dict, excl: set, pausados: set, invalidos: set) -> int:
    """Um e-mail por CLIENTE com todos os boletos novos dele (parcelamento = vários boletos). Só boletos EMITIDOS a partir de
    `regua_lancamento_desde` (vazio = desligado) e nos últimos N dias, ainda em aberto e a vencer. Cada boleto entra em UM aviso só."""
    from app.models.extra import CobrancaEtapa
    desde = _data_cfg(cfg["regua_lancamento_desde"])
    et = db.get(CobrancaEtapa, ETAPA_LANCAMENTO)
    if not desde or not et or not et.ativa or "email" not in str(et.canais or ""):
        return 0
    ini = max(desde, hoje - timedelta(days=max(1, _int(cfg["regua_lancamento_janela_dias"], 10))))
    cands = []
    if fresco["asaas_ok"]:
        for r in db.execute(_t("""SELECT asaas_id, customer_name, customer_cpf_cnpj, external_reference, value, due_date
                                   FROM asaas_payments_sync
                                  WHERE status = ANY(:st) AND COALESCE(billing_type,'BOLETO') = ANY(:bt) AND date_created >= :i
                                    AND due_date >= :h AND COALESCE(value,0) > 0
                                    AND NOT EXISTS (SELECT 1 FROM cobranca_envio_boletos x WHERE x.boleto_ref = 'asaas:' || asaas_id || ':' || due_date::text)"""),
                              {"st": list(STATUS_ABERTOS_ASAAS), "bt": list(TIPOS_ASAAS), "i": ini, "h": hoje}):
            cnpj = so_digitos(r.customer_cpf_cnpj)
            cands.append(dict(origem="asaas", ref=f"asaas:{r.asaas_id}:{r.due_date.isoformat()}", ref_id=r.asaas_id, cnpj=cnpj,
                              id_smart=id_canonico(r.external_reference, cnpj), nome=r.customer_name, venc=r.due_date, valor=float(r.value), link=None))
    if fresco["itau_ok"]:
        for r in db.execute(_t("""SELECT nosso_numero, pagador, cpf_cnpj, valor_titulo, data_vencimento FROM itau_boletos
                                   WHERE data_pagamento IS NULL AND data_baixa IS NULL AND COALESCE(status,'') NOT IN ('paga','cancelada')
                                     AND data_emissao >= :i AND data_vencimento >= :h AND COALESCE(valor_titulo,0) > 0
                                     AND NOT EXISTS (SELECT 1 FROM cobranca_envio_boletos x WHERE x.boleto_ref = 'itau:' || nosso_numero || ':' || data_vencimento::text)"""),
                              {"i": ini, "h": hoje}):
            cnpj = so_digitos(r.cpf_cnpj)
            cands.append(dict(origem="itau", ref=f"itau:{r.nosso_numero}:{r.data_vencimento.isoformat()}", ref_id=r.nosso_numero, cnpj=cnpj,
                              id_smart=f"ss_{cnpj}" if cnpj else None, nome=r.pagador, venc=r.data_vencimento, valor=float(r.valor_titulo), link=None))
    por_cli = {}
    for b in cands:
        if b["id_smart"] and b["cnpj"] not in excl and b["id_smart"] not in pausados:
            por_cli.setdefault(b["id_smart"], []).append(b)
    criados = 0
    for id_smart, bols in por_cli.items():
        bols.sort(key=lambda x: (x["venc"], x["ref"]))
        c = contatos.get(id_smart) or contatos.get(bols[0]["cnpj"]) or {}
        bruta = emails_validos(c.get("email"))
        lista = [x for x in bruta if x not in invalidos]
        grupo = db.execute(_t("""SELECT id FROM cobranca_envios WHERE etapa = :e AND id_smart = :s AND canal = 'email'
                                  AND status IN ('pendente','sem_contato','sem_boleto') ORDER BY id DESC LIMIT 1"""), {"e": ETAPA_LANCAMENTO, "s": id_smart}).scalar()
        if grupo is None:
            n = (db.execute(_t("SELECT count(*) FROM cobranca_envios WHERE etapa = :e AND id_smart = :s"), {"e": ETAPA_LANCAMENTO, "s": id_smart}).scalar() or 0) + 1
            ok = _inserir(db, etapa=ETAPA_LANCAMENTO, canal="email", ref=f"lanc:{id_smart}:{hoje.isoformat()}:{n}", status="pendente", origem="lancamento",
                          id_smart=id_smart, cnpj=bols[0]["cnpj"], nome=(bols[0]["nome"] or "")[:300], venc=bols[0]["venc"], valor=sum(b["valor"] for b in bols),
                          destino=", ".join(lista) or None, destino_origem=c.get("origem") if lista else None, desc=f"{len(bols)} boleto(s)")
            if not ok:
                continue
            grupo = db.execute(_t("SELECT id FROM cobranca_envios WHERE etapa = :e AND boleto_ref = :r AND canal = 'email'"),
                               {"e": ETAPA_LANCAMENTO, "r": f"lanc:{id_smart}:{hoje.isoformat()}:{n}"}).scalar()
            criados += 1
        novos = 0
        for b in bols:
            novos += db.execute(_t("""INSERT INTO cobranca_envio_boletos (envio_id, boleto_ref, origem, ref_id, vencimento, valor, link)
                                       VALUES (:i, :r, :o, :f, :v, :val, :l) ON CONFLICT (boleto_ref) DO NOTHING"""),
                                {"i": grupo, "r": b["ref"], "o": b["origem"], "f": b["ref_id"], "v": b["venc"], "val": b["valor"], "l": b["link"]}).rowcount
        if lista:
            db.execute(_t("UPDATE cobranca_envios SET destino = :d, destino_origem = :o WHERE id = :i"), {"d": ", ".join(lista)[:400], "o": c.get("origem"), "i": grupo})
        _recalcular_grupo(db, grupo, lista, devolvido=bool(bruta and not lista))
    return criados


def reavaliar_lancamentos(db: Session) -> None:
    """Itens de lançamento ainda não aprovados voltam a 'pendente' quando o PDF/link/e-mail aparece (e o contrário)."""
    contatos = mapa_contatos(db)
    invalidos = {r[0] for r in db.execute(_t("SELECT email FROM cobranca_emails_invalidos WHERE NOT COALESCE(liberado, false)"))}
    for (eid, id_smart, cnpj) in db.execute(_t("""SELECT id, id_smart, cnpj FROM cobranca_envios WHERE etapa = :e AND canal = 'email'
                                                   AND status IN ('pendente','sem_contato','sem_boleto')"""), {"e": ETAPA_LANCAMENTO}).fetchall():
        c = contatos.get(id_smart) or contatos.get(cnpj) or {}
        bruta = emails_validos(c.get("email"))
        _recalcular_grupo(db, eid, [x for x in bruta if x not in invalidos], devolvido=bool(bruta and all(x in invalidos for x in bruta)))


def preparar_lancamento(db: Session, e, hoje: date) -> tuple:
    """Situação de um aviso de lançamento na hora do envio. ('ok', boletos) | ('segurar', motivo) | ('descartar', motivo)."""
    rows = db.execute(_t("SELECT origem, ref_id, vencimento, valor FROM cobranca_envio_boletos WHERE envio_id = :i ORDER BY vencimento, id"), {"i": e.id}).mappings().all()
    boletos, faltam = [], []
    for b in rows:
        st = _estado_boleto_lanc(db, b)
        if not st.get("aberto") or (st.get("venc") and st["venc"] < hoje):
            continue                                       # pagou/cancelou, ou já venceu (o aviso de vencimento cuida)
        if not st.get("ok"):
            faltam.append(st.get("motivo") or "boleto indisponível")
        boletos.append({**st, "origem": b["origem"], "ref_id": b["ref_id"]})
    if not boletos:
        return "descartar", "nenhum boleto em aberto e a vencer neste aviso"
    if faltam:
        return "segurar", "; ".join(sorted(set(faltam)))[:300]
    if sum(len(b["anexo"]["bytes"]) for b in boletos if b.get("anexo")) > 8 * 1024 * 1024:
        return "segurar", "anexos grandes demais (máx. 8 MB por e-mail)"
    return "ok", boletos


def montar_email_lancamento(e, et, cfg: dict, hoje: date, boletos: list) -> dict:
    """E-mail único do cliente com TODOS os boletos novos dele: lista (vencimento, valor), PDF anexado (Itaú) ou botão da fatura (Asaas)."""
    class _E:                                              # objeto mínimo para o texto da etapa
        pass
    x = _E()
    x.nome, x.valor, x.vencimento, x.link, x.origem = e.nome, round(sum(b["valor"] for b in boletos), 2), min(b["venc"] for b in boletos), None, "lancamento"
    so_pdf = all(b.get("anexo") and not b.get("link") for b in boletos)       # Itaú: boleto em PDF anexado
    so_link = all(b.get("link") for b in boletos)                             # Asaas: link da fatura
    plural = len(boletos) > 1
    if so_pdf:
        link_txt = ("Os boletos estão anexados a este e-mail (PDF)." if plural else "O boleto está anexado a este e-mail (PDF).")
    elif so_link:
        link_txt = ("O link de cada fatura está logo abaixo." if plural else "O link da fatura está logo abaixo.")
    else:
        link_txt = "Os boletos estão listados abaixo: PDF anexado (Itaú) ou link da fatura (Asaas)."
    assunto, corpo = renderizar(et.assunto, et.texto, x, hoje, anexa=True, link_txt=link_txt)
    n = len(boletos)
    txt = [corpo, "", "Seus boletos:"]
    linhas_html, anexos = [], []
    for i, b in enumerate(boletos, 1):
        rot = f"Boleto {i} de {n}" if n > 1 else "Boleto"
        txt.append(f"- {rot}: vencimento {b['venc'].strftime('%d/%m/%Y')} — {brl(b['valor'])}" + (f" — {b['link']}" if b.get("link") else " — PDF anexado"))
        if b.get("anexo") and b["anexo"].get("linha"):
            txt.append(f"  Linha digitável: {b['anexo']['linha']}")
        acao, linha_html = "", ""
        if b.get("link"):
            acao = (f'<a href="{escape(b["link"], quote=True)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;'
                    'font-weight:700;font-size:13px;padding:8px 16px;border-radius:6px">Ver fatura e pagar</a>')
        elif b.get("anexo"):
            acao = '<span style="color:#166534;font-size:13px"><b>PDF anexado</b></span>'
            if b["anexo"].get("linha"):
                linha_html = (f'<tr><td colspan="4" style="padding:0 0 10px 0"><div style="font-size:11px;color:#6b7280;margin:0 0 2px 0">Linha digitável (copie e cole no app do banco):</div>'
                              f'<div style="font-family:Consolas,Menlo,monospace;font-size:12px;color:#111827;word-break:break-all">{escape(b["anexo"]["linha"])}</div></td></tr>')
            nome_cli = re.sub(r"[^A-Za-z0-9]+", "_", (e.nome or "cliente"))[:30].strip("_")
            anexos.append((f"Boleto_{b['venc'].strftime('%d-%m-%Y')}_{nome_cli}_{i}.pdf", b["anexo"]["bytes"], "application/pdf"))
        topo = "border-top:1px solid #e5e7eb;" if i > 1 else ""
        pad_b = "0" if linha_html else "10px"
        linhas_html.append(f'<tr><td style="padding:10px 8px {pad_b} 0;{topo}font-size:13px;color:#6b7280;white-space:nowrap">{escape(rot)}</td>'
                           f'<td style="padding:10px 8px {pad_b} 0;{topo}font-size:14px;color:#111827;white-space:nowrap"><b>{b["venc"].strftime("%d/%m/%Y")}</b></td>'
                           f'<td style="padding:10px 8px {pad_b} 0;{topo}font-size:14px;color:#111827;white-space:nowrap"><b>{escape(brl(b["valor"]))}</b></td>'
                           f'<td style="padding:10px 0 {pad_b} 0;{topo}text-align:right">{acao}</td></tr>{linha_html}')
    if n > 1:
        txt.append(f"Total: {brl(x.valor)}")
    paras = "".join(f'<p style="margin:0 0 16px 0;">{escape(bl).replace(chr(10), "<br>")}</p>' for bl in corpo.split("\n\n"))
    th = 'align="left" style="font-size:12px;color:#9ca3af;padding-bottom:6px;font-weight:bold"'
    tabela = ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0"><tr>'
              f'<th {th}>Boleto</th><th {th}>Vencimento</th><th {th}>Valor</th><th></th></tr>'
              + "".join(linhas_html) + '</table>')
    lay = layout_etapa(et)
    prazo = _int(cfg["regua_prazo_bloqueio_dias"], 3)
    campo = lambda v: renderizar("", v, x, hoje, prazo, anexa=True, link_txt=link_txt)[1] if v else ""
    secao = secao_html(campo(lay["secao_titulo"]) or ("Seus boletos" if n > 1 else "Seu boleto"),
                       campo(lay["secao_sub"]) or "Confira os vencimentos e a forma de pagamento:", None, tabela)
    html = layout_email(campo(lay["titulo"]) or assunto, paras, secao, cfg, preheader=campo(lay["preheader"]) or re.sub(r"\s+", " ", corpo)[:110])
    return {"assunto": assunto, "texto": "\n".join(txt), "html": html, "anexos": anexos, "inline": imagens_inline()}


# ── envio ──────────────────────────────────────────────────────────────────────

def _enviar_smtp(cfg: dict, para: list, assunto: str, texto: str, html: str, anexos: list = None, inline: list = None) -> str:
    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = f'{cfg["cobranca_email_nome"]} <{cfg["cobranca_email_remetente"]}>'
    msg["To"] = ", ".join(para)
    msg["Reply-To"] = cfg["cobranca_email_remetente"]
    msg["Date"] = formatdate(localtime=True)
    mid = make_msgid(domain=cfg["cobranca_email_remetente"].split("@")[-1])
    msg["Message-ID"] = mid
    msg.set_content(texto)
    msg.add_alternative(html, subtype="html")
    for cid, dados in (inline or []):                       # logos embutidos (cid:) — aparecem sem pedir "carregar imagens"
        msg.get_payload()[1].add_related(dados, "image", "png", cid=f"<{cid}>", disposition="inline")
    for nome, dados, tipo in (anexos or []):
        principal, _, sub = tipo.partition("/")
        msg.add_attachment(dados, maintype=principal, subtype=sub, filename=nome)
    host, porta = cfg["cobranca_smtp_host"], _int(cfg["cobranca_smtp_porta"], 587)
    ctx = ssl.create_default_context()
    if cfg["cobranca_smtp_seguranca"] == "ssl":
        s = smtplib.SMTP_SSL(host, porta, timeout=30, context=ctx)
    else:
        s = smtplib.SMTP(host, porta, timeout=30)
        s.ehlo()
        if cfg["cobranca_smtp_seguranca"] == "starttls":
            s.starttls(context=ctx)
            s.ehlo()
    try:
        s.login(cfg["cobranca_smtp_usuario"], cfg["cobranca_smtp_senha"])
        s.send_message(msg)
    finally:
        try:
            s.quit()
        except Exception:
            pass
    return mid


def _lock_conexao(db: Session, chave: int):
    """Trava de 'um envio por vez' numa conexão PRÓPRIA e em AUTOCOMMIT (não fica 'idle in transaction'). None = ocupado."""
    conn = db.get_bind().connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        ok = conn.execute(_t("SELECT pg_try_advisory_lock(:k)"), {"k": chave}).scalar()
    except Exception:
        conn.close()
        raise
    if not ok:
        conn.close()
        return None
    return conn


def _liberar_lock(conn, chave: int) -> None:
    try:
        conn.execute(_t("SELECT pg_advisory_unlock(:k)"), {"k": chave})
    finally:
        conn.close()


def faixa_geracao(et, janela: int) -> tuple:
    """Defasagem (hoje − vencimento, em dias) em que a etapa É GERADA. 'Vence hoje' só no dia; lembrete só antes do vencimento."""
    if et.dias == 0:
        return 0, 0
    if et.dias < 0:
        return et.dias, min(et.dias + janela, -1)
    return et.dias, et.dias + janela


def faixa_envio(et, janela: int) -> tuple:
    """Defasagem em que a etapa AINDA pode ser enviada (folga de 2 dias para aprovação em fim de semana/feriado)."""
    if et.dias == 0:
        return 0, 0
    if et.dias < 0:
        return et.dias, -1
    return et.dias, et.dias + janela + 2


def canais_da_etapa(et) -> list:
    return [c for c in str(getattr(et, "canais", "") or "").split(",") if c]


def envia_msg(et) -> bool:
    """A etapa manda mensagem ao cliente (e-mail e/ou WhatsApp). Etapa só de tarefa interna não conta."""
    return any(c in ("email", "whatsapp") for c in canais_da_etapa(et))


def etapa_ainda_vale(et, e, etapas: list, hoje: date, janela: int) -> tuple:
    """(ok, motivo). Impede texto errado: etapa expirada, desligada, canal desligado, ou já superada por uma etapa mais avançada."""
    if not et.ativa:
        return False, "etapa desligada"
    canal = getattr(e, "canal", None)
    if canal in ("email", "whatsapp") and canal not in canais_da_etapa(et):
        return False, f"{'e-mail' if canal == 'email' else 'WhatsApp'} desligado nesta etapa"
    if not e.vencimento:
        return True, ""
    offset = (hoje - e.vencimento).days
    lo, hi = faixa_envio(et, janela)
    if not lo <= offset <= hi:
        return False, f"etapa fora do prazo (boleto com {offset} dia(s) de defasagem)"
    for x in etapas:
        if x.chave != et.chave and x.ativa and x.dias > et.dias and x.chave not in (ETAPA_CONSENTIMENTO, ETAPA_LANCAMENTO) and envia_msg(x) and x.dias <= offset:
            return False, f"superada pela etapa “{x.nome}”"
    return True, ""


def _pagou_manual(db: Session, id_smart: str, hoje: date) -> bool:
    """Pagamento lançado à mão no sistema (PIX, depósito, negociação) nos últimos dias: o boleto pode seguir 'em aberto' na origem."""
    try:
        return bool(db.execute(_t("SELECT 1 FROM payment_records WHERE id_smart = :s AND data_pagamento >= :d LIMIT 1"),
                               {"s": id_smart, "d": hoje - timedelta(days=3)}).fetchone())
    except Exception:
        db.rollback()
        return False


def pdf_itau(db: Session, nosso: str):
    """(anexo|None, motivo). O PDF só vale se o boleto não mudou de valor/vencimento depois de vinculado."""
    r = db.execute(_t("""SELECT b.pdf, b.linha_digitavel, b.valor_pdf, b.venc_pdf, i.valor_titulo, i.data_vencimento
                           FROM cobranca_boletos_itau b LEFT JOIN itau_boletos i ON i.nosso_numero = b.nosso_numero
                          WHERE b.nosso_numero = :n"""), {"n": nosso}).fetchone()
    if not r:
        return None, "boleto do Itaú não encontrado no sistema — suba o PDF na aba Boletos Itaú"
    pdf, linha, vpdf, dpdf, vatual, datual = r
    if vpdf is not None and vatual is not None and abs(float(vpdf) - float(vatual)) > 0.01:
        return None, f"o valor do boleto mudou (PDF: {brl(vpdf)}, atual: {brl(vatual)}) — suba o PDF novo"
    if dpdf and datual and dpdf != datual:
        return None, "o vencimento do boleto mudou — suba o PDF novo"
    return {"bytes": bytes(pdf), "linha": linha}, ""


def _gravar_enviado(db: Session, eid: int, v: dict) -> bool:
    """Grava o resultado de um envio JÁ FEITO. Tenta duas vezes e, no limite, grava só o essencial — porque o e-mail/WhatsApp
    já saiu e um erro aqui NÃO pode virar 'falhou' (o 'Reenviar' duplicaria)."""
    for completo in (True, True, False):
        try:
            if completo:
                db.execute(_t("""UPDATE cobranca_envios SET status='enviado', erro=NULL, enviado_em=now(), assunto_enviado=:a, corpo_enviado=:c,
                                  destino_efetivo=:d, message_id=:m, provider_msg_id=:pm, provider_chat_id=:pc, entrega=:en, entrega_em=now(), modo_teste=:t
                                  WHERE id=:i"""),
                           {"a": (v.get("assunto") or "")[:300], "c": v.get("corpo"), "d": (v.get("destino") or "")[:400], "m": (v.get("message_id") or "")[:200] or None,
                            "pm": v.get("pmid"), "pc": v.get("pchat"), "en": v.get("entrega"), "t": bool(v.get("teste")), "i": eid})
            else:
                db.execute(_t("UPDATE cobranca_envios SET status='enviado', enviado_em=now(), erro='enviado — detalhes não gravados' WHERE id=:i"), {"i": eid})
            db.commit()
            return True
        except Exception:
            db.rollback()
    return False


def _fonte_fresca(e, fresco: dict) -> bool:
    """Os dados de pagamento da origem do item estão atualizados? (lançamento mistura as duas origens: exige as duas)"""
    if e.origem == "asaas":
        return fresco["asaas_ok"]
    if e.origem == "itau":
        return fresco["itau_ok"]
    return fresco["asaas_ok"] and fresco["itau_ok"]


def _email_pode_enviar(cfg: dict) -> str:
    if cfg["regua_envio_ativo"] != "1":
        return "envio desligado (chave geral)"
    if not smtp_configurado(cfg):
        return "e-mail (SMTP) não configurado"
    if not dentro_do_horario(cfg):
        return f"fora do horário de envio (dias úteis, {cfg['regua_horario_inicio']}–{cfg['regua_horario_fim']}, sem feriados)"
    return ""


def _ainda_em_aberto(db: Session, e) -> tuple:
    """(ok, motivo). Reconfere no banco se o boleto segue em aberto e com o mesmo vencimento."""
    if e.origem == "asaas":
        aid = e.boleto_ref.split(":")[1]
        r = db.execute(_t("SELECT status, due_date FROM asaas_payments_sync WHERE asaas_id = :a"), {"a": aid}).fetchone()
        if not r:
            return False, "boleto não encontrado no Asaas"
        if r.status not in STATUS_ABERTOS_ASAAS:
            return False, f"boleto não está mais em aberto (status {r.status})"
        if r.due_date != e.vencimento:
            return False, "vencimento do boleto mudou"
    else:
        nn = e.boleto_ref.split(":")[1]
        r = db.execute(_t("SELECT status, data_pagamento, data_baixa, data_vencimento FROM itau_boletos WHERE nosso_numero = :n"), {"n": nn}).fetchone()
        if not r:
            return False, "boleto não encontrado no Itaú"
        if r.data_pagamento or r.data_baixa or (r.status or "") in ("paga", "cancelada"):
            return False, "boleto já pago ou baixado"
        if r.data_vencimento != e.vencimento:
            return False, "vencimento do boleto mudou"
    return True, ""


def processar_aprovados(db: Session, limite: int = 500) -> dict:
    """Envia os itens de e-mail 'aprovado'. Só roda com a chave geral ligada, SMTP configurado e dentro da janela de envio.
    Um envio por vez (trava no banco). A cada item relê chave geral, horário e modo teste, e recontagem do limite diário.
    Falha NÃO reenvia sozinha."""
    import time
    from app.models.extra import CobrancaEnvio, CobrancaEtapa
    res = {"enviados": 0, "falhas": 0, "descartados": 0, "bloqueado": None}
    cfg = carregar_cfg(db)
    motivo = _email_pode_enviar(cfg)
    if motivo:
        res["bloqueado"] = motivo
        return res
    lock = _lock_conexao(db, 7731002)
    if lock is None:
        res["bloqueado"] = "outro envio de e-mail em andamento"
        return res
    try:
        hoje = hoje_br()
        janela = max(0, _int(cfg["regua_janela_dias"], 3))
        fresco = frescor(db, cfg)
        # envios de e-mail "enviando" há mais de 10 min foram interrompidos: NÃO reenvia (pode ter saído)
        db.execute(_t("""UPDATE cobranca_envios SET status='falhou', erro='Envio interrompido — confira a caixa de enviados antes de reenviar'
                          WHERE canal='email' AND status='enviando' AND COALESCE(reservado_em, aprovado_em) < now() - interval '10 minutes'"""))
        db.commit()
        etapas = db.query(CobrancaEtapa).all()
        ids = [r[0] for r in db.execute(_t("SELECT id FROM cobranca_envios WHERE status='aprovado' AND canal='email' ORDER BY id LIMIT :l"), {"l": limite})]
        for eid in ids:
            cfg = carregar_cfg(db)                                  # relê a CADA item: desligar a chave/modo teste/horário vale já
            motivo = _email_pode_enviar(cfg)
            if motivo:
                res["bloqueado"] = motivo
                break
            limite_dia = _int(cfg["regua_limite_diario"], 300)
            enviados_hoje = db.execute(_t("""SELECT count(*) FROM cobranca_envios WHERE canal='email' AND status='enviado'
                                              AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = :h"""), {"h": hoje}).scalar() or 0
            if enviados_hoje >= limite_dia:
                res["bloqueado"] = f"limite diário de {limite_dia} e-mails atingido"
                break
            claim = db.execute(_t("""UPDATE cobranca_envios SET status='enviando', tentativas = tentativas + 1, reservado_em = now()
                                      WHERE id=:i AND status='aprovado' AND canal='email' RETURNING id"""), {"i": eid}).fetchone()
            db.commit()
            if not claim:
                continue
            teste = cfg["regua_modo_teste"] == "1"
            e = db.get(CobrancaEnvio, eid)
            et = next((x for x in etapas if x.chave == e.etapa), None)
            try:
                if et is None:
                    e.status, e.erro = "cancelado", "etapa não existe mais"; res["descartados"] += 1; db.commit(); continue
                if e.id_smart in _pausados(db, hoje):
                    e.status, e.erro = "cancelado", "cliente pausado na régua"; res["descartados"] += 1; db.commit(); continue
                if not _fonte_fresca(e, fresco):
                    e.status, e.erro = "aprovado", "dados de pagamento desatualizados — envio adiado"
                    e.tentativas = max(0, (e.tentativas or 1) - 1)
                    db.commit(); res["bloqueado"] = "dados de pagamento desatualizados"; break
                lancamento = e.etapa == ETAPA_LANCAMENTO
                if not lancamento:
                    ok, mot = etapa_ainda_vale(et, e, etapas, hoje, janela)
                    if not ok:
                        e.status, e.erro = "resolvido", mot; res["descartados"] += 1; db.commit(); continue
                    ok, mot = _ainda_em_aberto(db, e)
                    if not ok:
                        e.status, e.erro = "resolvido", mot; res["descartados"] += 1; db.commit(); continue
                    if _pagou_manual(db, e.id_smart, hoje):
                        e.status, e.erro = "resolvido", "pagamento registrado manualmente no sistema"; res["descartados"] += 1; db.commit(); continue
                invalidos = {r[0] for r in db.execute(_t("SELECT email FROM cobranca_emails_invalidos WHERE NOT COALESCE(liberado, false)"))}
                lista = [x for x in emails_validos(e.destino) if x not in invalidos]
                if not lista:
                    e.status, e.erro = "sem_contato", "sem e-mail válido (ou e-mail devolvido antes)"; db.commit(); continue
                if lancamento:
                    # aviso de lançamento: um e-mail com TODOS os boletos novos do cliente (PDF do Itaú anexado / link do Asaas)
                    est, dado = preparar_lancamento(db, e, hoje)
                    if est == "descartar":
                        e.status, e.erro = "resolvido", dado; res["descartados"] += 1; db.commit(); continue
                    if est == "segurar":
                        e.status, e.erro = "sem_boleto", dado
                        e.tentativas = max(0, (e.tentativas or 1) - 1)
                        db.commit(); res["descartados"] += 1; continue
                    msgm = montar_email_lancamento(e, et, cfg, hoje, dado)
                else:
                    # e-mail com o boleto (Itaú: PDF anexado) ou o link da fatura (Asaas) nas etapas que levam boleto: sem isso, segura e avisa
                    anexo, link_atual, motivo_pdf = None, None, ""
                    if not et.anexa_boleto:
                        pass                                        # atraso/bloqueio: só texto (sem anexo e sem exigir boleto)
                    elif e.origem == "itau":
                        anexo, motivo_pdf = pdf_itau(db, e.boleto_ref.split(":")[1])
                    else:
                        link_atual = db.execute(_t("SELECT invoice_url FROM asaas_payments_sync WHERE asaas_id = :a"), {"a": e.boleto_ref.split(":")[1]}).scalar()
                        if not (link_atual or e.link or "").startswith("http"):
                            link_atual = None
                    if et.anexa_boleto and ((e.origem == "itau" and not anexo) or (e.origem != "itau" and not (link_atual or e.link))):
                        e.status = "sem_boleto"
                        e.erro = (motivo_pdf if e.origem == "itau" else "fatura do Asaas sem link — conferir no Asaas")
                        e.tentativas = max(0, (e.tentativas or 1) - 1)
                        db.commit()
                        res["descartados"] += 1
                        continue
                    msgm = montar_email(e, et, cfg, hoje, anexo, link_atual)
                assunto, corpo = msgm["assunto"], msgm["texto"]
                if msgm["anexos"]:
                    corpo += f"\n\n[anexo: {msgm['anexos'][0][0]}]"
                efetivo = lista
                if teste:
                    efetivo = [cfg["regua_email_teste"]]
                    assunto = f"[TESTE — seria para {', '.join(lista)}] {assunto}"
                mid = _enviar_smtp(cfg, efetivo, assunto, msgm["texto"], msgm["html"], msgm["anexos"], msgm.get("inline"))
            except Exception as ex:                                 # nunca derruba o lote; nunca grava a senha
                db.rollback()
                e = db.get(CobrancaEnvio, eid)
                msg = str(ex)
                if cfg["cobranca_smtp_senha"]:
                    msg = msg.replace(cfg["cobranca_smtp_senha"], "•••")
                e.status, e.erro = "falhou", msg[:400]
                db.commit()
                res["falhas"] += 1
                logger.warning("cobranca: falha ao enviar id=%s: %s", eid, msg[:200])
                continue
            # a partir daqui o e-mail JÁ SAIU: gravar o resultado nunca pode virar 'falhou'
            _gravar_enviado(db, eid, {"assunto": assunto, "corpo": corpo, "destino": ", ".join(efetivo), "message_id": mid, "teste": teste})
            res["enviados"] += 1
            time.sleep(1.0)
        return res
    finally:
        _liberar_lock(lock, 7731002)


# ── WhatsApp (Umbler) ──────────────────────────────────────────────────────────

CAMPOS_WA = ["nome", "valor", "vencimento", "competencia", "link", "dias_atraso", "data_limite"]
_REGEX_SEM_WHATS = re.compile(r"131026|not.*whatsapp|undeliverable|invalid.*(number|phone)|n[uú]mero.*inv", re.I)


def _set_cfg(db: Session, chave: str, valor: str) -> None:
    r = db.execute(_t("UPDATE system_settings SET value = :v, updated_at = now() WHERE key = :k"), {"v": valor, "k": chave})
    if not r.rowcount:
        db.execute(_t("INSERT INTO system_settings (key, value) VALUES (:k, :v)"), {"k": chave, "v": valor})


def pausar_whatsapp(db: Session, motivo: str) -> None:
    """Disjuntor: desliga o canal e registra o motivo. Só uma pessoa (admin) volta a ligar."""
    _set_cfg(db, "whatsapp_ativo", "0")
    _set_cfg(db, "whatsapp_pausado_motivo", motivo[:300])
    db.commit()
    logger.warning("cobranca: WhatsApp PAUSADO — %s", motivo)


def params_whatsapp(et, e, hoje: date, prazo_bloqueio: int) -> list:
    """Valores na ordem configurada em `wa_params` (ex.: nome,valor,vencimento). Nenhum parâmetro vai vazio."""
    venc = e.vencimento
    atraso = max(0, (hoje - venc).days) if venc else 0
    vals = {"nome": (e.nome or "").strip() or "cliente", "valor": brl(e.valor),
            "vencimento": venc.strftime("%d/%m/%Y") if venc else "-", "competencia": competencia_de(venc) if venc else "-",
            "link": e.link or "responda esta mensagem para receber a segunda via", "dias_atraso": str(atraso),
            "data_limite": (hoje + timedelta(days=prazo_bloqueio)).strftime("%d/%m/%Y")}
    campos = [c.strip() for c in str(et.wa_params or "").split(",") if c.strip() in vals]
    return [vals[c] for c in campos]


def _whatsapp_pode_enviar(cfg: dict) -> str:
    """'' se pode; senão o motivo."""
    if cfg["regua_envio_ativo"] != "1":
        return "envio desligado (chave geral)"
    if cfg["whatsapp_ativo"] != "1":
        return "WhatsApp desligado" + (f" — pausado: {cfg['whatsapp_pausado_motivo']}" if cfg["whatsapp_pausado_motivo"] else "")
    if not whatsapp_configurado(cfg):
        return "Umbler não configurada (token, organização e número do canal)"
    if not dentro_do_horario(cfg):
        return f"fora do horário de envio ({cfg['regua_horario_inicio']}–{cfg['regua_horario_fim']})"
    return ""


def processar_whatsapp(db: Session, limite: int = 500) -> dict:
    """Envia os itens WhatsApp 'aprovado'. Travas: chave geral + chave do canal + horário (dia útil) + teto de N a cada 5 min
    + teto diário + 1 mensagem por cliente por dia + disjuntor por falhas seguidas. Só UM envio roda por vez (trava no banco);
    a CADA item relê as chaves, o horário e os limites. Cobranças vão antes dos pedidos de autorização."""
    import time
    from app.models.extra import CobrancaEnvio, CobrancaEtapa
    from app.services import umbler
    res = {"enviados": 0, "falhas": 0, "descartados": 0, "bloqueado": None}
    cfg = carregar_cfg(db)
    motivo = _whatsapp_pode_enviar(cfg)
    if motivo:
        res["bloqueado"] = motivo
        return res
    lock = _lock_conexao(db, 7731001)
    if lock is None:
        res["bloqueado"] = "outro envio de WhatsApp em andamento"
        return res
    try:
        hoje = hoje_br()
        janela = max(0, _int(cfg["regua_janela_dias"], 3))
        fresco = frescor(db, cfg)
        max_falhas = max(1, _int(cfg["whatsapp_max_falhas_seguidas"], 3))
        etapas = db.query(CobrancaEtapa).all()
        db.execute(_t("""UPDATE cobranca_envios SET status='falhou', erro='Envio interrompido — confira na Umbler antes de reenviar'
                          WHERE canal='whatsapp' AND status='enviando' AND COALESCE(reservado_em, aprovado_em) < now() - interval '10 minutes'"""))
        db.commit()
        ids = [r[0] for r in db.execute(_t("""SELECT id FROM cobranca_envios WHERE canal='whatsapp' AND status='aprovado'
                                              ORDER BY (etapa = :c) ASC, id LIMIT :l"""), {"c": ETAPA_CONSENTIMENTO, "l": limite})]
        seguidas = 0
        for eid in ids:
            cfg = carregar_cfg(db)                                  # relê a CADA item
            motivo = _whatsapp_pode_enviar(cfg)
            if motivo:
                res["bloqueado"] = motivo
                break
            teste = cfg["regua_modo_teste"] == "1"
            tel_teste = umbler.normalizar_telefone(cfg["whatsapp_telefone_teste"]) if teste else None
            if teste and not tel_teste:
                res["bloqueado"] = "modo teste ligado, mas falta o número de teste do WhatsApp"
                break
            lim5 = max(1, _int(cfg["whatsapp_limite_5min"], 100))
            limd = max(1, _int(cfg["whatsapp_limite_diario"], 30))
            passo = 300.0 / lim5                                    # segundos entre mensagens (100 por 5 min = 3 s)
            enviados_dia = db.execute(_t("""SELECT count(*) FROM cobranca_envios WHERE canal='whatsapp' AND status='enviado'
                                             AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = :h"""), {"h": hoje}).scalar() or 0
            if enviados_dia >= limd:
                res["bloqueado"] = f"limite diário de {limd} mensagens de WhatsApp atingido"
                break
            na_janela = db.execute(_t("""SELECT count(*) FROM cobranca_envios WHERE canal='whatsapp' AND status='enviado'
                                          AND enviado_em > now() - interval '5 minutes'""")).scalar() or 0
            if na_janela >= lim5:
                res["bloqueado"] = f"limite de {lim5} mensagens a cada 5 minutos atingido"
                break
            claim = db.execute(_t("""UPDATE cobranca_envios SET status='enviando', tentativas = tentativas + 1, reservado_em = now()
                                      WHERE id=:i AND status='aprovado' AND canal='whatsapp' RETURNING id"""), {"i": eid}).fetchone()
            db.commit()
            if not claim:
                continue
            e = db.get(CobrancaEnvio, eid)
            et = next((x for x in etapas if x.chave == e.etapa), None)

            def devolve(motivo_adiar):
                e.status, e.erro = "aprovado", motivo_adiar
                e.tentativas = max(0, (e.tentativas or 1) - 1)
                db.commit()
            try:
                if et is None:
                    e.status, e.erro = "cancelado", "etapa não existe mais"; res["descartados"] += 1; db.commit(); continue
                if e.id_smart in _pausados(db, hoje):
                    e.status, e.erro = "cancelado", "cliente pausado na régua"; res["descartados"] += 1; db.commit(); continue
                if not et.ativa or not et.wa_template_id:
                    devolve("etapa desligada ou sem template do WhatsApp"); continue
                ja_hoje = db.execute(_t("""SELECT 1 FROM cobranca_envios WHERE canal='whatsapp' AND status='enviado' AND id_smart=:s AND id<>:i
                                            AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = :h LIMIT 1"""), {"s": e.id_smart, "h": hoje, "i": e.id}).fetchone()
                if ja_hoje:
                    devolve("este cliente já recebeu WhatsApp hoje — fica para o próximo dia útil"); continue
                st = db.execute(_t("SELECT status FROM cobranca_whatsapp_consent WHERE id_smart=:s"), {"s": e.id_smart}).scalar()
                if e.etapa == ETAPA_CONSENTIMENTO:
                    if st is not None and not teste:
                        e.status, e.erro = "cancelado", "cliente já respondeu ao pedido de autorização"; res["descartados"] += 1; db.commit(); continue
                else:
                    if st != "aceitou":
                        e.status, e.erro = "cancelado", "cliente não autorizou WhatsApp"; res["descartados"] += 1; db.commit(); continue
                    if not (fresco["asaas_ok"] if e.origem == "asaas" else fresco["itau_ok"]):
                        devolve("dados de pagamento desatualizados — envio adiado"); continue
                    ok, mot = etapa_ainda_vale(et, e, etapas, hoje, janela)
                    if not ok:
                        e.status, e.erro = "resolvido", mot; res["descartados"] += 1; db.commit(); continue
                    ok, mot = _ainda_em_aberto(db, e)
                    if not ok:
                        e.status, e.erro = "resolvido", mot; res["descartados"] += 1; db.commit(); continue
                    if _pagou_manual(db, e.id_smart, hoje):
                        e.status, e.erro = "resolvido", "pagamento registrado manualmente no sistema"; res["descartados"] += 1; db.commit(); continue
                destino = tel_teste or e.telefone
                params = params_whatsapp(et, e, hoje, _int(cfg["regua_prazo_bloqueio_dias"], 3))
                r = umbler.enviar_template(cfg, destino, et.wa_template_id, params, e.nome or "")
            except Exception as ex:
                db.rollback()
                e = db.get(CobrancaEnvio, eid)
                msg = str(ex)
                if cfg["umbler_token"]:
                    msg = msg.replace(cfg["umbler_token"], "•••")
                e.status, e.erro = "falhou", msg[:400]
                db.commit()
                res["falhas"] += 1
                seguidas += 1
                logger.warning("cobranca: falha WhatsApp id=%s: %s", eid, msg[:200])
                if seguidas >= max_falhas:
                    pausar_whatsapp(db, f"{seguidas} falhas seguidas no envio — conferir a Umbler")
                    res["bloqueado"] = "WhatsApp pausado pelo disjuntor (falhas seguidas)"
                    break
                continue
            # a mensagem JÁ SAIU: gravar o resultado nunca pode virar 'falhou'
            _gravar_enviado(db, eid, {"assunto": f"[{et.nome}] template {et.wa_template_id}", "corpo": " | ".join(params), "destino": destino,
                                      "pmid": r["id"] or None, "pchat": r["chat_id"] or None, "entrega": "processando" if r["id"] else "desconhecido",
                                      "teste": teste})
            if e.etapa == ETAPA_CONSENTIMENTO and not teste:
                try:
                    db.execute(_t("""INSERT INTO cobranca_whatsapp_consent (id_smart, status, telefone, chat_id, pedido_em, origem)
                                      VALUES (:s, 'pedido_enviado', :t, :c, now(), 'resposta') ON CONFLICT (id_smart) DO NOTHING"""),
                               {"s": e.id_smart, "t": e.telefone, "c": r["chat_id"]})
                    db.commit()
                except Exception:
                    db.rollback()
            res["enviados"] += 1
            seguidas = 0
            time.sleep(passo)
        return res
    finally:
        _liberar_lock(lock, 7731001)


def atualizar_entregas(db: Session, max_itens: int = 80) -> dict:
    """Consulta na Umbler o estado das mensagens enviadas (enviada → entregue → lida | falhou) e grava no item.
    Também aplica o disjuntor por taxa de falha e marca 'sem WhatsApp' quando a Umbler diz que o número não recebe."""
    from app.models.extra import CobrancaEnvio
    from app.services import umbler
    cfg = carregar_cfg(db)
    res = {"consultados": 0, "atualizados": 0, "erros": 0}
    if not whatsapp_configurado(cfg):
        return res
    itens = db.query(CobrancaEnvio).filter(
        CobrancaEnvio.canal == "whatsapp", CobrancaEnvio.status == "enviado", CobrancaEnvio.provider_msg_id.isnot(None),
        CobrancaEnvio.enviado_em > datetime.now(timezone.utc) - timedelta(days=3),
        (CobrancaEnvio.entrega.is_(None)) | (CobrancaEnvio.entrega.notin_(["lida", "falhou"])),
    ).order_by(CobrancaEnvio.entrega_checada_em.asc().nullsfirst(), CobrancaEnvio.id).limit(max_itens).all()
    for e in itens:
        res["consultados"] += 1
        try:
            est = umbler.estado_mensagem(cfg, e.provider_msg_id)
        except Exception as ex:
            res["erros"] += 1
            e.entrega_checada_em = datetime.now(timezone.utc)
            db.commit()
            logger.warning("cobranca: estado id=%s: %s", e.id, str(ex)[:150])
            continue
        e.entrega_checada_em = datetime.now(timezone.utc)
        novo = est["entrega"]
        if novo != "desconhecido" and novo != e.entrega:
            e.entrega, e.entrega_em, e.entrega_erro = novo, datetime.now(timezone.utc), est.get("erro")
            res["atualizados"] += 1
            if (novo == "falhou" and _REGEX_SEM_WHATS.search(est.get("erro") or "") and e.etapa == ETAPA_CONSENTIMENTO
                    and not e.modo_teste and (e.destino_efetivo or "") == (e.telefone or "")):
                db.execute(_t("""INSERT INTO cobranca_whatsapp_consent (id_smart, status, telefone, chat_id, pedido_em, origem)
                                  VALUES (:s, 'sem_whatsapp', :t, :c, now(), 'resposta')
                                  ON CONFLICT (id_smart) DO UPDATE SET status = 'sem_whatsapp'
                                  WHERE cobranca_whatsapp_consent.status = 'pedido_enviado'"""), {"s": e.id_smart, "t": e.telefone, "c": e.provider_chat_id})
        db.commit()
    # disjuntor por taxa: das últimas 20 mensagens já com resultado, 30% ou mais falharam → pausa
    desde = db.execute(_t("SELECT value FROM system_settings WHERE key='whatsapp_religado_em'")).scalar() or "1970-01-01T00:00:00+00:00"
    ult = [r[0] for r in db.execute(_t("""SELECT entrega FROM cobranca_envios WHERE canal='whatsapp' AND status='enviado' AND NOT COALESCE(modo_teste, false)
                                           AND enviado_em > :d
                                           AND entrega IN ('falhou','enviada','entregue','lida')
                                           AND NOT (entrega = 'falhou' AND COALESCE(entrega_erro,'') ~* '131026|undeliverable|not.*whatsapp|invalid.*(number|phone)')
                                         ORDER BY enviado_em DESC LIMIT 20"""), {"d": desde})]
    if cfg["whatsapp_ativo"] == "1" and len(ult) >= 10 and ult.count("falhou") / len(ult) >= 0.30:
        pausar_whatsapp(db, f"{ult.count('falhou')} de {len(ult)} mensagens recentes falharam na entrega")
    return res


def _iso(dt) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def processar_respostas(db: Session, max_chats: int = 60) -> dict:
    """Lê as respostas dos clientes ao pedido de autorização (e pedidos de sair depois) e atualiza a autorização.
    Quem já aceitou continua sendo conferido em rodízio (sem prazo), para nunca perder um "PARAR".
    Em MODO TESTE nada muda: as respostas vêm do número de teste, não do cliente."""
    from app.services import umbler
    cfg = carregar_cfg(db)
    res = {"consultados": 0, "aceitaram": 0, "recusaram": 0, "outras": 0}
    if not whatsapp_configurado(cfg) or cfg["regua_modo_teste"] == "1":
        return res
    linhas = db.execute(_t("""
        SELECT id_smart, status, chat_id, COALESCE(respondido_em, pedido_em, now() - interval '1 day') AS desde
          FROM cobranca_whatsapp_consent
         WHERE chat_id IS NOT NULL AND chat_id <> '' AND status IN ('pedido_enviado','respondeu_outro','aceitou')
         ORDER BY checado_em ASC NULLS FIRST LIMIT :l"""), {"l": max_chats}).fetchall()
    for r in linhas:
        res["consultados"] += 1
        try:
            msgs = umbler.respostas_do_chat(cfg, r.chat_id, _iso(r.desde))
        except Exception as ex:
            logger.warning("cobranca: respostas %s: %s", r.id_smart, str(ex)[:150])
            continue
        db.execute(_t("UPDATE cobranca_whatsapp_consent SET checado_em = now() WHERE id_smart = :s"), {"s": r.id_smart})
        if not msgs:
            db.commit()
            continue
        decisao = None
        for m in msgs:
            d = umbler.interpretar_resposta(m["texto"] or m["botao"])
            if d:
                decisao = d
        ultima = (msgs[-1]["texto"] or "")[:400]
        if decisao == "nao":
            novo = "recusou"
        elif decisao == "sim" and r.status != "aceitou":
            novo = "aceitou"
        elif decisao is None and r.status == "pedido_enviado":
            novo = "respondeu_outro"
        else:
            novo = r.status
        if novo == "aceitou" and r.status != "aceitou":
            res["aceitaram"] += 1
        elif novo == "recusou":
            res["recusaram"] += 1
        elif novo == "respondeu_outro" and r.status != "respondeu_outro":
            res["outras"] += 1
        # o cursor avança até a ÚLTIMA mensagem lida (não até "agora"): nenhuma resposta fica pelo caminho
        datas = [m["em"] for m in msgs if m.get("em")]
        try:
            cursor = max(datetime.fromisoformat(str(x).replace("Z", "+00:00")) for x in datas) if datas else datetime.now(timezone.utc)
        except ValueError:
            cursor = datetime.now(timezone.utc)
        db.execute(_t("""UPDATE cobranca_whatsapp_consent SET status=:n, respondido_em=:c, resposta_texto=:t, origem='resposta', atualizado_em=now()
                          WHERE id_smart=:s"""), {"n": novo, "t": ultima, "s": r.id_smart, "c": cursor + timedelta(milliseconds=1)})
        if novo == "recusou":      # recusou: tira da fila qualquer WhatsApp que ainda não saiu
            db.execute(_t("""UPDATE cobranca_envios SET status='cancelado', erro='cliente não autorizou WhatsApp'
                              WHERE id_smart=:s AND canal='whatsapp' AND status IN ('pendente','aprovado')"""), {"s": r.id_smart})
        db.commit()
    return res


def checar_canal(db: Session) -> dict:
    """Lê o estado do canal na Umbler. Se estiver restrito/desativado/offline, pausa o WhatsApp na hora."""
    from app.services import umbler
    cfg = carregar_cfg(db)
    if not whatsapp_configurado(cfg):
        return {}
    try:
        c = umbler.estado_canal(cfg)
    except Exception as ex:
        logger.warning("cobranca: estado do canal: %s", str(ex)[:150])
        return {"erro": True}
    _set_cfg(db, "whatsapp_canal_estado", c["estado"][:200])
    db.commit()
    if cfg["whatsapp_ativo"] == "1" and not c["ok"]:
        pausar_whatsapp(db, f"estado do canal na Umbler: {c['estado']}")
    return c


# ── rotina diária ──────────────────────────────────────────────────────────────

def aprovar_automaticos(db: Session) -> int:
    """Etapas marcadas como 'automatico': aprova os pendentes com e-mail (só chamado com a chave geral ligada).
    O WhatsApp NUNCA é aprovado automaticamente — sempre passa pelo analista."""
    from app.models.extra import CobrancaEnvio, CobrancaEtapa
    chaves = [e.chave for e in db.query(CobrancaEtapa).filter(CobrancaEtapa.ativa == True, CobrancaEtapa.modo == "automatico")]  # noqa: E712
    if not chaves:
        return 0
    n = 0
    for e in db.query(CobrancaEnvio).filter(CobrancaEnvio.status == "pendente", CobrancaEnvio.canal == "email",
                                            CobrancaEnvio.etapa.in_(chaves)).all():
        if emails_validos(e.destino):
            e.status, e.aprovado_em = "aprovado", datetime.now(timezone.utc)
            n += 1
    db.commit()
    return n


def rotina_diaria() -> None:
    """Uma passada da rotina (a cada ~5 min): gera a fila do dia (uma vez, a partir das 07:00), confere o canal do
    WhatsApp, lê respostas, estados de entrega e devoluções e — com as chaves ligadas e dentro da janela — envia o que
    está aprovado. Cada passo roda isolado: se um falhar, os outros seguem. Nunca levanta exceção."""
    from app.database import SessionLocal
    db = SessionLocal()

    def passo(nome, fn):
        try:
            fn()
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            logger.exception("cobranca: erro no passo '%s' da rotina", nome)

    try:
        cfg = carregar_cfg(db)
        agora = datetime.now(TZ)
        hoje = agora.date()

        def gerar():
            if cfg["regua_geracao_automatica"] == "1" and agora.hour >= 7 and eh_dia_util(hoje, cfg.get("regua_feriados_extra", "")):
                ultima = db.execute(_t("SELECT value FROM system_settings WHERE key='regua_ultima_geracao_auto'")).scalar()
                if ultima != hoje.isoformat():
                    _set_cfg(db, "regua_ultima_geracao_auto", hoje.isoformat())   # marca antes: se falhar, tenta de novo só amanhã (não a cada 5 min)
                    db.commit()
                    gerar_fila(db, hoje)

        def whats():
            if whatsapp_configurado(cfg):
                checar_canal(db)
                atualizar_entregas(db)
                processar_respostas(db)

        def caixa():
            if imap_configurado(cfg):
                ult = db.execute(_t("SELECT value FROM system_settings WHERE key='cobranca_imap_ultima'")).scalar()
                try:
                    parado = (not ult) or (datetime.now(timezone.utc) - datetime.fromisoformat(ult)).total_seconds() >= 900
                except ValueError:
                    parado = True
                if parado:
                    from app.services import devolucoes
                    _set_cfg(db, "cobranca_imap_ultima", datetime.now(timezone.utc).isoformat())
                    db.commit()
                    devolucoes.ler_devolucoes(db, cfg)

        def envios():
            if cfg["regua_envio_ativo"] == "1":
                aprovar_automaticos(db)
                processar_aprovados(db)
                processar_whatsapp(db)

        passo("gerar fila", gerar)
        passo("whatsapp", whats)
        passo("devoluções", caixa)
        passo("envios", envios)
    finally:
        db.close()


async def regua_loop():
    import asyncio
    await asyncio.sleep(90)                       # deixa o sync do Asaas rodar primeiro
    while True:
        try:
            await asyncio.to_thread(rotina_diaria)
        except Exception:
            logger.exception("cobranca: loop")
        await asyncio.sleep(300)
