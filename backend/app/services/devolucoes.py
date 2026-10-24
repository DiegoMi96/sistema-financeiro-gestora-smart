"""
Leitura de e-mails DEVOLVIDOS (bounce) da régua de cobrança.

Como funciona: quando um e-mail não chega (endereço inexistente, caixa cheia…), o servidor do cliente devolve uma
mensagem automática para a caixa que enviou. Este módulo lê essa caixa por IMAP (SOMENTE LEITURA: nada é apagado,
movido nem marcado como lido), reconhece as devoluções, descobre de qual envio foram e:
  • marca o envio como "devolvido" com o motivo;
  • registra o endereço como inválido (falha permanente) — a régua deixa de gerar/enviar para ele até alguém liberar.
Falha temporária (4.x.x, "delayed") só é ignorada. Envios feitos em MODO TESTE nunca invalidam endereço de cliente.
"""
import imaplib
import logging
import re
import ssl
from datetime import datetime, timedelta, timezone
from email import message_from_bytes, policy

from sqlalchemy import func, text as _t
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+")
_FROM_BOUNCE = re.compile(r"mailer-daemon|postmaster|mail delivery|mail-daemon|no-?reply.*delivery", re.I)
_ASSUNTO_BOUNCE = re.compile(r"undeliver|delivery status|delivery failure|failure notice|returned mail|devolvid|n[aã]o entregue|"
                             r"mensagem n[aã]o p[oô]de|could not be delivered|delivery has failed|address not found", re.I)
_CODIGO = re.compile(r"\b([245]\.\d{1,3}\.\d{1,3})\b")
_CODIGO_SMTP = re.compile(r"\b(5[0-9]{2})[ -]")


def _credenciais(cfg: dict):
    return (cfg["cobranca_imap_usuario"] or cfg["cobranca_smtp_usuario"], cfg["cobranca_imap_senha"] or cfg["cobranca_smtp_senha"])


def conectar(cfg: dict):
    usuario, senha = _credenciais(cfg)
    m = imaplib.IMAP4_SSL(cfg["cobranca_imap_host"], int(cfg["cobranca_imap_porta"] or 993), ssl_context=ssl.create_default_context(), timeout=30)
    try:
        m.login(usuario, senha)
        m.select("INBOX", readonly=True)            # readonly: a caixa nunca é alterada
    except Exception:
        try:
            m.logout()
        except Exception:
            pass
        raise
    return m


def testar(cfg: dict) -> dict:
    """Só confere o login e conta as mensagens. Não lê o conteúdo."""
    m = conectar(cfg)
    try:
        typ, dados = m.search(None, "ALL")
        return {"ok": True, "mensagens": len((dados[0] or b"").split())}
    finally:
        try:
            m.logout()
        except Exception:
            pass


def _id_original(texto: str) -> str:
    achou = re.search(r"Message-ID:\s*<([^>\s]+)>", texto or "", re.I)
    return achou.group(1).strip().lower() if achou else ""


def interpretar(msg, remetente_nosso: str = "") -> list:
    """Se `msg` é uma devolução, devolve uma lista (um item por destinatário):
    [{'email', 'codigo', 'permanente', 'motivo', 'id_original'}]; senão []."""
    de = str(msg.get("From") or "")
    assunto = str(msg.get("Subject") or "")
    tipo = msg.get_content_type()
    eh_dsn = tipo == "multipart/report" and "delivery-status" in str(msg.get_param("report-type") or "").lower()
    if not (eh_dsn or _FROM_BOUNCE.search(de) or _ASSUNTO_BOUNCE.search(assunto)):
        return []

    id_original = ""
    blocos = []
    texto_geral = []
    for parte in msg.walk():
        ct = parte.get_content_type()
        if ct == "message/delivery-status":
            payload = parte.get_payload()
            for b in (payload if isinstance(payload, list) else []):
                blocos.append(b)
        elif ct in ("message/rfc822", "text/rfc822-headers"):
            conteudo = parte.get_payload()
            if isinstance(conteudo, list) and conteudo:
                id_original = id_original or str(conteudo[0].get("Message-ID") or "").strip("<> \n").lower()
            else:
                id_original = id_original or _id_original(str(conteudo))
        elif ct == "text/plain":
            try:
                texto_geral.append(parte.get_content())
            except Exception:
                pass
    corpo = "\n".join(texto_geral)
    id_original = id_original or _id_original(corpo)

    saida = []
    for b in blocos:
        destino = str(b.get("Final-Recipient") or b.get("Original-Recipient") or "")
        ach = _EMAIL.search(destino)
        if not ach:
            continue
        acao = str(b.get("Action") or "").strip().lower()
        status = str(b.get("Status") or "").strip()
        diag = re.sub(r"\s+", " ", str(b.get("Diagnostic-Code") or "")).strip()
        permanente = acao == "failed" and status.startswith("5") or (not status and bool(_CODIGO_SMTP.search(diag)) and acao != "delayed")
        saida.append({"email": ach.group(0).lower(), "codigo": status or "", "permanente": bool(permanente),
                      "motivo": (diag or f"devolvido ({status})")[:400], "id_original": id_original})
    if saida:
        return saida

    # Devolução sem relatório padrão (texto livre): procura código 5.x.x e o endereço citado
    cod = _CODIGO.search(corpo) or _CODIGO.search(assunto)
    smtp = _CODIGO_SMTP.search(corpo)
    if not (cod or smtp):
        return []
    permanente = (cod and cod.group(1).startswith("5")) or bool(smtp)
    nosso = (remetente_nosso or "").lower()
    candidatos = [e.lower() for e in _EMAIL.findall(corpo) if e.lower() != nosso and not _FROM_BOUNCE.search(e)]
    if not candidatos:
        return []
    return [{"email": candidatos[0], "codigo": cod.group(1) if cod else (smtp.group(1) if smtp else ""), "permanente": bool(permanente),
             "motivo": re.sub(r"\s+", " ", corpo.strip())[:300], "id_original": id_original}]


def _envio_da_devolucao(db: Session, d: dict):
    """Acha o envio pelo Message-ID ORIGINAL (igualdade exata). Sem ele a devolução é ignorada: qualquer pessoa poderia
    mandar uma devolução falsa para a caixa e tirar clientes da régua. O endereço citado também tem de ser um dos do envio."""
    from app.models.extra import CobrancaEnvio
    from app.services.cobranca import emails_validos
    mid = (d.get("id_original") or "").strip().lower()
    if not mid or len(mid) > 200:
        return None
    for e in db.query(CobrancaEnvio).filter(CobrancaEnvio.canal == "email", CobrancaEnvio.message_id.isnot(None),
                                            func.lower(CobrancaEnvio.message_id).in_([mid, f"<{mid}>"])).limit(2).all():
        if d["email"] in set(emails_validos(e.destino)):
            return e
    return None


def aplicar(db: Session, d: dict) -> str:
    """Aplica UMA devolução. Devolve 'invalidado' | 'devolvido' | 'temporaria' | 'teste' | 'sem_envio'.
    Só falha 5.1.x (endereço/destinatário inexistente) INVALIDA o endereço; outras falhas permanentes (caixa cheia, bloqueio
    por política/spam do nosso lado) marcam o envio como devolvido mas não condenam o endereço."""
    if not d["permanente"]:
        return "temporaria"
    e = _envio_da_devolucao(db, d)
    if e is None:
        return "sem_envio"
    if (e.destino_efetivo or "") != (e.destino or ""):       # envio de teste: o endereço do cliente não foi usado
        return "teste"
    e.status, e.erro = "devolvido", d["motivo"]
    if not str(d.get("codigo") or "").startswith("5.1"):
        return "devolvido"
    db.execute(_t("""INSERT INTO cobranca_emails_invalidos (email, motivo, codigo, envio_id, liberado)
                      VALUES (:e, :m, :c, :i, false)
                      ON CONFLICT (email) DO UPDATE SET motivo = :m, codigo = :c, envio_id = :i, liberado = false, detectado_em = now()"""),
               {"e": d["email"], "m": d["motivo"], "c": d["codigo"], "i": e.id})
    # itens ainda não enviados que só tinham esse endereço passam a "sem e-mail" (comparação EXATA, não por trecho)
    from app.models.extra import CobrancaEnvio
    from app.services.cobranca import emails_validos
    for p in db.query(CobrancaEnvio).filter(CobrancaEnvio.canal == "email", CobrancaEnvio.status.in_(["pendente", "aprovado"])).all():
        todos = emails_validos(p.destino)
        if d["email"] in todos and not [x for x in todos if x != d["email"]]:
            p.status, p.erro = "sem_contato", f"e-mail devolvido ({d['email']})"
    return "invalidado"


def ler_devolucoes(db: Session, cfg: dict, dias: int = 7, max_msgs: int = 300) -> dict:
    """Passada de leitura da caixa. Nunca levanta exceção para o chamador."""
    res = {"lidas": 0, "invalidados": 0, "temporarias": 0, "teste": 0, "sem_envio": 0, "erro": None}
    try:
        m = conectar(cfg)
    except Exception as ex:
        res["erro"] = f"não foi possível ler a caixa: {type(ex).__name__}"
        return res
    try:
        desde = (datetime.now(timezone.utc) - timedelta(days=dias)).strftime("%d-%b-%Y")
        typ, dados = m.search(None, "SINCE", desde)
        ids = (dados[0] or b"").split()[-max_msgs:]
        for i in ids:
            typ, cab = m.fetch(i, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID CONTENT-TYPE)])")
            if typ != "OK" or not cab or not cab[0]:
                continue
            h = message_from_bytes(cab[0][1], policy=policy.default)
            if not (_FROM_BOUNCE.search(str(h.get("From") or "")) or _ASSUNTO_BOUNCE.search(str(h.get("Subject") or ""))
                    or "delivery-status" in str(h.get("Content-Type") or "").lower()):
                continue
            mid = (str(h.get("Message-ID") or "").strip("<> \r\n") or f"imap-{i.decode()}")[:300]
            if db.execute(_t("SELECT 1 FROM cobranca_devolucoes_lidas WHERE message_id = :m"), {"m": mid}).fetchone():
                continue
            typ, completo = m.fetch(i, "(BODY.PEEK[])")
            if typ != "OK" or not completo or not completo[0]:
                continue
            msg = message_from_bytes(completo[0][1], policy=policy.default)
            for d in interpretar(msg, cfg.get("cobranca_email_remetente", "")):
                r = aplicar(db, d)
                chave = {"invalidado": "invalidados", "devolvido": "invalidados", "temporaria": "temporarias", "teste": "teste", "sem_envio": "sem_envio"}[r]
                res[chave] += 1
            db.execute(_t("INSERT INTO cobranca_devolucoes_lidas (message_id) VALUES (:m) ON CONFLICT DO NOTHING"), {"m": mid})
            db.commit()
            res["lidas"] += 1
    except Exception as ex:
        db.rollback()
        res["erro"] = f"erro ao processar devoluções: {type(ex).__name__}"
        logger.warning("cobranca: devoluções: %s", str(ex)[:200])
    finally:
        try:
            m.logout()
        except Exception:
            pass
    return res
