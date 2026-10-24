"""Régua de cobrança (aba "Cobrança" do Faturamento): fila, aprovação, etapas, pausas e configuração.
Ver services/cobranca.py para as regras de segurança."""
import ipaddress
import json
import logging
import re
import socket
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import AuditLog
from app.models.extra import CobrancaEnvio, CobrancaEtapa, CobrancaPausa, CobrancaWhatsConsent
from app.core.permissions import require_permission
from app.services import cobranca as svc
from app.services import umbler
from app.services import devolucoes
from app.services import boletos_itau as bi

log = logging.getLogger(__name__)

router = APIRouter(prefix="/cobranca", tags=["Cobrança"])
_ler = Depends(require_permission("can_edit_billing"))          # analista: ver, gerar fila, aprovar, pausar
_admin = Depends(require_permission("can_approve_billing"))     # gestor/admin: etapas, chave geral, e-mail


def _audit(db, user, acao, detalhes):
    db.add(AuditLog(user_id=user.id, action=acao, entity="cobranca", details=detalhes))


def _set_setting(db, key, value):
    r = db.execute(text("UPDATE system_settings SET value = :v, updated_at = now() WHERE key = :k"), {"v": value, "k": key})
    if not r.rowcount:
        db.execute(text("INSERT INTO system_settings (key, value) VALUES (:k, :v)"), {"k": key, "v": value})


PORTAS_SMTP = {25, 465, 587, 2525}
PORTAS_IMAP = {993}


def _host_publico(host: str) -> bool:
    """Recusa nomes que apontem para a rede interna (loopback, privada, link-local): o servidor de e-mail é externo."""
    h = (host or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9.\-]{3,253}", h) or "." not in h:
        return False
    try:
        infos = socket.getaddrinfo(h, None)
    except OSError:
        return False
    for i in infos:
        ip = ipaddress.ip_address(i[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


def _dominio_base(h: str) -> str:
    p = (h or "").lower().split(".")
    return ".".join(p[-3:] if len(p) >= 3 and p[-2:] == ["com", "br"] else p[-2:])


def _cooldown(db: Session, nome: str, segundos: int) -> None:
    """Evita cliques repetidos em ações pesadas (consultam serviços externos): 429 dentro do intervalo."""
    chave = f"cobranca_cd_{nome}"
    agora = datetime.now(timezone.utc)
    ult = db.execute(text("SELECT value FROM system_settings WHERE key = :k"), {"k": chave}).scalar()
    try:
        if ult and (agora - datetime.fromisoformat(ult)).total_seconds() < segundos:
            raise HTTPException(429, f"Aguarde {segundos} segundos antes de repetir esta ação.")
    except ValueError:
        pass
    _set_setting(db, chave, agora.isoformat())
    db.commit()


def _enviar_em_segundo_plano():
    db = SessionLocal()
    try:
        svc.processar_aprovados(db)
        svc.processar_whatsapp(db)
    except Exception:
        db.rollback()
    finally:
        db.close()


# ── resumo ─────────────────────────────────────────────────────────────────────

@router.get("/resumo")
def resumo(current_user=_ler, db: Session = Depends(get_db)):
    svc.garantir_etapas(db)
    cfg = svc.carregar_cfg(db)
    hoje = svc.hoje_br()
    cont = {r.status: r.n for r in db.execute(text("SELECT status, count(*) n FROM cobranca_envios GROUP BY status"))}
    por_etapa = [{"etapa": r.etapa, "canal": r.canal, "status": r.status, "n": r.n} for r in
                 db.execute(text("SELECT etapa, canal, status, count(*) n FROM cobranca_envios GROUP BY etapa, canal, status"))]
    env_hoje = db.execute(text("""SELECT count(*) FROM cobranca_envios WHERE status='enviado' AND canal='email'
                                   AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = :h"""), {"h": hoje}).scalar() or 0
    ultima = db.execute(text("SELECT value FROM system_settings WHERE key='regua_ultima_geracao'")).scalar()
    return {
        "hoje": hoje.isoformat(),
        "contagem": cont, "por_etapa": por_etapa,
        "enviados_hoje": env_hoje, "limite_diario": svc._int(cfg["regua_limite_diario"], 300),
        "envio_ativo": cfg["regua_envio_ativo"] == "1", "modo_teste": cfg["regua_modo_teste"] == "1",
        "email_teste": cfg["regua_email_teste"], "smtp_configurado": svc.smtp_configurado(cfg),
        "remetente": cfg["cobranca_email_remetente"],
        "frescor": svc.frescor(db, cfg), "ultima_geracao": ultima,
        "horario": {"inicio": cfg["regua_horario_inicio"], "fim": cfg["regua_horario_fim"], "proximo_envio": svc.proximo_envio(cfg),
                    "agora_dentro": svc.dentro_do_horario(cfg)},
        "whatsapp": {"ativo": cfg["whatsapp_ativo"] == "1", "configurado": svc.whatsapp_configurado(cfg),
                     "pausado_motivo": cfg["whatsapp_pausado_motivo"] or None, "canal_estado": cfg["whatsapp_canal_estado"] or None,
                     "limite_5min": svc._int(cfg["whatsapp_limite_5min"], 100), "limite_diario": svc._int(cfg["whatsapp_limite_diario"], 30),
                     "enviados_hoje": db.execute(text("""SELECT count(*) FROM cobranca_envios WHERE canal='whatsapp' AND status='enviado'
                                       AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = :h"""), {"h": hoje}).scalar() or 0,
                     "consent": {r.status: r.n for r in db.execute(text("SELECT status, count(*) n FROM cobranca_whatsapp_consent GROUP BY status"))}},
    }


@router.post("/gerar")
def gerar(current_user=_ler, db: Session = Depends(get_db)):
    _cooldown(db, "gerar", 10)
    r = svc.gerar_fila(db)
    _set_setting(db, "regua_ultima_geracao", datetime.now(timezone.utc).isoformat())
    _audit(db, current_user, "cobranca.gerar_fila", {"criados": r["total_criados"], "sem_contato": r["sem_contato"]})
    db.commit()
    return r


# ── fila / histórico ───────────────────────────────────────────────────────────

def _env_dict(e: CobrancaEnvio) -> dict:
    return {"id": e.id, "etapa": e.etapa, "canal": e.canal, "origem": e.origem, "id_smart": e.id_smart, "nome": e.nome,
            "cnpj": e.cnpj, "destino": e.destino, "destino_origem": e.destino_origem,
            "vencimento": e.vencimento.isoformat() if e.vencimento else None, "valor": e.valor, "status": e.status,
            "erro": e.erro, "tentativas": e.tentativas, "destino_efetivo": e.destino_efetivo,
            "enviado_em": e.enviado_em.isoformat() if e.enviado_em else None,
            "gerado_em": e.gerado_em.isoformat() if e.gerado_em else None,
            "telefone": e.telefone, "entrega": e.entrega, "entrega_erro": e.entrega_erro, "descricao": e.descricao,
            "entrega_em": e.entrega_em.isoformat() if e.entrega_em else None}


@router.get("/envios")
def listar_envios(status: Optional[str] = None, etapa: Optional[str] = None, canal: Optional[str] = None, search: str = "",
                  page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                  current_user=_ler, db: Session = Depends(get_db)):
    q = db.query(CobrancaEnvio)
    if status:
        q = q.filter(CobrancaEnvio.status.in_(status.split(",")))
    if etapa:
        q = q.filter(CobrancaEnvio.etapa == etapa)
    if canal:
        q = q.filter(CobrancaEnvio.canal == canal)
    if search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(CobrancaEnvio.nome.ilike(like) | CobrancaEnvio.id_smart.ilike(like) | CobrancaEnvio.destino.ilike(like))
    total = q.count()
    soma = q.with_entities(func.coalesce(func.sum(CobrancaEnvio.valor), 0)).scalar() if total else 0
    itens = q.order_by(CobrancaEnvio.vencimento, CobrancaEnvio.id).offset((page - 1) * limit).limit(limit).all()
    return {"total": total, "valor": round(float(soma or 0), 2), "page": page, "pages": max(1, -(-total // limit)),
            "itens": [_env_dict(e) for e in itens]}


@router.get("/envios/{envio_id}/previa")
def previa_envio(envio_id: int, current_user=_ler, db: Session = Depends(get_db)):
    e = db.get(CobrancaEnvio, envio_id)
    if not e:
        raise HTTPException(404, "Item não encontrado")
    if e.assunto_enviado:                                     # já enviado: mostra o que realmente saiu
        return {"assunto": e.assunto_enviado, "corpo": e.corpo_enviado, "para": e.destino_efetivo, "enviado": True}
    et = db.get(CobrancaEtapa, e.etapa)
    cfg = svc.carregar_cfg(db)
    if e.canal == "whatsapp":
        params = svc.params_whatsapp(et, e, svc.hoje_br(), svc._int(cfg["regua_prazo_bloqueio_dias"], 3))
        return {"assunto": f"WhatsApp — {et.nome}", "corpo": f"Template: {et.wa_template_id or '(não configurado)'}\nCampos enviados, na ordem: " + " | ".join(params)
                + "\n\nO texto final é o do template aprovado na Umbler.", "para": e.telefone, "enviado": False}
    if e.etapa == svc.ETAPA_LANCAMENTO:
        est, dado = svc.preparar_lancamento(db, e, svc.hoje_br())
        if est != "ok":
            return {"assunto": et.assunto, "corpo": f"Este aviso não será enviado agora: {dado}", "para": e.destino, "enviado": False, "anexo": None, "sem_boleto": est == "segurar"}
        m = svc.montar_email_lancamento(e, et, cfg, svc.hoje_br(), dado)
        return {"assunto": m["assunto"], "corpo": m["texto"], "para": e.destino, "enviado": False,
                "anexo": ", ".join(a[0] for a in m["anexos"]) or None, "sem_boleto": False}
    anexo = None
    if e.origem == "itau" and et.anexa_boleto:
        r = db.execute(text("SELECT linha_digitavel, arquivo_nome FROM cobranca_boletos_itau WHERE nosso_numero = :n"), {"n": e.boleto_ref.split(":")[1]}).fetchone()
        if r:
            anexo = {"bytes": b"x", "linha": r[0]}
    m = svc.montar_email(e, et, cfg, svc.hoje_br(), anexo)
    return {"assunto": m["assunto"], "corpo": m["texto"], "para": e.destino, "enviado": False,
            "anexo": m["anexos"][0][0] if m["anexos"] else None,
            "sem_boleto": bool(et.anexa_boleto) and (e.status == "sem_boleto" or (e.origem == "itau" and not anexo) or (e.origem != "itau" and not (e.link or "").startswith("http")))}


class IdsIn(BaseModel):
    ids: Optional[List[int]] = None
    etapa: Optional[str] = None            # com ids vazio: todos os pendentes (com e-mail/telefone) da etapa
    canal: Optional[str] = None            # email | whatsapp (opcional)
    motivo: Optional[str] = None


@router.post("/envios/aprovar")
def aprovar(body: IdsIn, background_tasks: BackgroundTasks, current_user=_ler, db: Session = Depends(get_db)):
    q = db.query(CobrancaEnvio).filter(CobrancaEnvio.status == "pendente", CobrancaEnvio.canal.in_(["email", "whatsapp"]))
    if body.canal in ("email", "whatsapp"):
        q = q.filter(CobrancaEnvio.canal == body.canal)
    if body.ids:
        q = q.filter(CobrancaEnvio.id.in_(body.ids))
    elif body.etapa:
        q = q.filter(CobrancaEnvio.etapa == body.etapa)
    else:
        raise HTTPException(400, "Informe os itens ou a etapa.")
    cfg0 = svc.carregar_cfg(db)
    hoje = svc.hoje_br()
    janela = max(0, svc._int(cfg0["regua_janela_dias"], 3))
    etapas = db.query(CobrancaEtapa).all()
    por_chave = {x.chave: x for x in etapas}
    itens, expirados = [], 0
    for e in q.all():
        if not (svc.emails_validos(e.destino) if e.canal == "email" else bool(e.telefone)):
            continue
        et = por_chave.get(e.etapa)
        if et is not None and e.etapa not in (svc.ETAPA_CONSENTIMENTO, svc.ETAPA_LANCAMENTO):
            ok, motivo = svc.etapa_ainda_vale(et, e, etapas, hoje, janela)
            if not ok:                                    # item velho (ex.: lembrete de boleto já vencido): não aprova, não envia
                e.status, e.erro = "resolvido", motivo
                expirados += 1
                continue
        itens.append(e)
    agora = datetime.now(timezone.utc)
    ids_ok = [e.id for e in itens]
    if ids_ok:                                            # só muda quem AINDA está pendente (uma pausa/cancelamento simultâneo não é desfeito)
        db.query(CobrancaEnvio).filter(CobrancaEnvio.id.in_(ids_ok), CobrancaEnvio.status == "pendente").update(
            {"status": "aprovado", "aprovado_por": current_user.id, "aprovado_em": agora}, synchronize_session=False)
    _audit(db, current_user, "cobranca.aprovar", {"qtd": len(itens), "expirados": expirados, "etapa": body.etapa, "ids": (body.ids or ids_ok)[:50]})
    db.commit()
    cfg = svc.carregar_cfg(db)
    enviando = cfg["regua_envio_ativo"] == "1" and (svc.smtp_configurado(cfg) or svc.whatsapp_configurado(cfg))
    if enviando and itens:
        background_tasks.add_task(_enviar_em_segundo_plano)
    aviso = None
    if not enviando:
        aviso = "Aprovado, mas o envio está desligado (chave geral) ou o e-mail/WhatsApp não está configurado. Nada foi enviado."
    elif not svc.dentro_do_horario(cfg):
        aviso = f"Aprovado. Fora do horário de envio (dias úteis, {cfg['regua_horario_inicio']}–{cfg['regua_horario_fim']}, sem feriados): sai na próxima janela — {svc.proximo_envio(cfg)}."
    if expirados and not aviso:
        aviso = f"{expirados} item(ns) estavam fora do prazo da etapa e foram descartados."
    return {"aprovados": len(itens), "expirados": expirados, "enviando_agora": enviando and svc.dentro_do_horario(cfg), "aviso": aviso}


@router.post("/envios/cancelar")
def cancelar(body: IdsIn, current_user=_ler, db: Session = Depends(get_db)):
    if not body.ids:
        raise HTTPException(400, "Informe os itens.")
    n = (db.query(CobrancaEnvio).filter(CobrancaEnvio.id.in_(body.ids), CobrancaEnvio.status.in_(["pendente", "aprovado", "sem_contato", "sem_boleto", "falhou"]))
         .update({"status": "cancelado", "erro": (body.motivo or "removido pelo analista")[:300]}, synchronize_session=False))
    _audit(db, current_user, "cobranca.cancelar", {"qtd": n, "ids": body.ids[:50], "motivo": body.motivo})
    db.commit()
    return {"cancelados": n}


@router.post("/envios/reenviar")
def reenviar(body: IdsIn, background_tasks: BackgroundTasks, current_user=_ler, db: Session = Depends(get_db)):
    """Recoloca itens que FALHARAM na fila de envio (volta a 'aprovado'). Confirme antes se o e-mail não saiu."""
    if not body.ids:
        raise HTTPException(400, "Informe os itens.")
    n = (db.query(CobrancaEnvio).filter(CobrancaEnvio.id.in_(body.ids), CobrancaEnvio.status == "falhou")
         .update({"status": "aprovado", "erro": None, "aprovado_por": current_user.id, "aprovado_em": datetime.now(timezone.utc)},
                 synchronize_session=False))
    _audit(db, current_user, "cobranca.reenviar", {"qtd": n, "ids": body.ids[:50]})
    db.commit()
    cfg = svc.carregar_cfg(db)
    if n and cfg["regua_envio_ativo"] == "1" and svc.smtp_configurado(cfg):
        background_tasks.add_task(_enviar_em_segundo_plano)
    return {"reenfileirados": n}


@router.post("/envios/concluir")
def concluir_tarefas(body: IdsIn, current_user=_ler, db: Session = Depends(get_db)):
    if not body.ids:
        raise HTTPException(400, "Informe os itens.")
    n = (db.query(CobrancaEnvio).filter(CobrancaEnvio.id.in_(body.ids), CobrancaEnvio.canal == "tarefa", CobrancaEnvio.status == "pendente")
         .update({"status": "concluido", "enviado_em": datetime.now(timezone.utc)}, synchronize_session=False))
    _audit(db, current_user, "cobranca.concluir_tarefas", {"qtd": n, "ids": body.ids[:50]})
    db.commit()
    return {"concluidas": n}


# ── etapas ─────────────────────────────────────────────────────────────────────

def _etapa_dict(e: CobrancaEtapa) -> dict:
    return {"chave": e.chave, "nome": e.nome, "ordem": e.ordem, "ativa": bool(e.ativa), "dias": e.dias,
            "canais": [c for c in (e.canais or "").split(",") if c], "modo": e.modo, "assunto": e.assunto or "", "texto": e.texto or "",
            "wa_template_id": e.wa_template_id or "", "wa_params": [c for c in (e.wa_params or "").split(",") if c],
            "anexa_boleto": bool(e.anexa_boleto), "wa_texto": e.wa_texto or "", "layout": svc.layout_etapa(e)}


@router.get("/etapas")
def listar_etapas(current_user=_ler, db: Session = Depends(get_db)):
    svc.garantir_etapas(db)
    return {"etapas": [_etapa_dict(e) for e in db.query(CobrancaEtapa).order_by(CobrancaEtapa.ordem).all()], "campos": svc.CAMPOS,
            "campos_whatsapp": svc.CAMPOS_WA}


class EtapaIn(BaseModel):
    ativa: Optional[bool] = None
    dias: Optional[int] = None
    canais: Optional[List[str]] = None
    modo: Optional[str] = None
    assunto: Optional[str] = None
    texto: Optional[str] = None
    wa_template_id: Optional[str] = None
    wa_params: Optional[List[str]] = None
    wa_texto: Optional[str] = None
    layout: Optional[dict] = None


def _limpa_layout(d: dict, campos: dict) -> dict:
    """Só campos conhecidos, texto simples, tamanho limitado. Tudo é escapado na hora de montar o e-mail."""
    return {k: re.sub(r"[\x00-\x08\x0b-\x1f]", "", str(d.get(k) or "")).strip()[:n] for k, n in campos.items() if k in d}


def _valida_global(d: dict) -> dict:
    out = _limpa_layout(d, svc.LAYOUT_GLOBAL)
    for k in ("url_instagram", "url_linkedin"):
        if out.get(k) and not re.match(r"^https://[^\s\"'<>]+$", out[k]):
            raise HTTPException(400, "Os links das redes sociais precisam começar com https:// (ou ficar vazios para esconder o ícone).")
    for k in ("contato_email", "rodape_email"):
        if k in out and not re.match(r"^[^@\s<>\"']+@[^@\s<>\"']+\.[^@\s<>\"']+$", out[k]):
            raise HTTPException(400, "E-mail inválido nos contatos do e-mail.")
    for k in ("duvida_titulo", "duvida_texto", "contato_fone", "rodape_endereco", "rodape_copyright", "rodape_descadastro", "rodape_slogan", "redes_texto"):
        if k in out and not out[k]:
            raise HTTPException(400, "Nenhum texto do rodapé/contatos pode ficar vazio.")
    return out


@router.put("/etapas/{chave}")
def salvar_etapa(chave: str, body: EtapaIn, current_user=_admin, db: Session = Depends(get_db)):
    svc.garantir_etapas(db)
    e = db.get(CobrancaEtapa, chave)
    if not e:
        raise HTTPException(404, "Etapa não encontrada")
    if body.dias is not None:
        if not -30 <= body.dias <= 60:
            raise HTTPException(400, "Prazo fora do limite (de -30 a 60 dias).")
        e.dias = body.dias
    if body.canais is not None:
        if any(c not in ("email", "tarefa", "whatsapp") for c in body.canais):
            raise HTTPException(400, "Canal inválido.")
        if "tarefa" not in body.canais and e.chave != svc.ETAPA_CONSENTIMENTO and not any(c in body.canais for c in ("email", "whatsapp")):
            raise HTTPException(400, "A etapa precisa de pelo menos um canal ligado (e-mail ou WhatsApp).")
        if "email" not in body.canais and "tarefa" not in body.canais and e.chave != svc.ETAPA_CONSENTIMENTO:
            if e.chave == svc.ETAPA_LANCAMENTO:
                raise HTTPException(400, "O aviso de lançamento só sai por e-mail por enquanto (o WhatsApp dele ainda não existe).")
            if not (body.wa_template_id or e.wa_template_id):
                raise HTTPException(400, "Para desligar o e-mail desta etapa, primeiro informe o ID do template do WhatsApp dela.")
        if "whatsapp" in body.canais and e.chave == svc.ETAPA_LANCAMENTO:
            raise HTTPException(400, "O WhatsApp do aviso de lançamento ainda não existe.")
        e.canais = ",".join(body.canais)
    if body.modo is not None:
        if body.modo not in ("aprovar", "automatico"):
            raise HTTPException(400, "Modo inválido.")
        e.modo = body.modo
    if body.assunto is not None:
        e.assunto = body.assunto[:200]
    if body.texto is not None:
        if len(body.texto) > 4000:
            raise HTTPException(400, "Texto muito longo.")
        e.texto = body.texto
    if body.wa_template_id is not None:
        e.wa_template_id = re.sub(r"[^A-Za-z0-9_\-]", "", body.wa_template_id)[:80] or None
    if body.wa_params is not None:
        if any(c not in svc.CAMPOS_WA for c in body.wa_params):
            raise HTTPException(400, "Campo inválido na lista de parâmetros.")
        e.wa_params = ",".join(body.wa_params)
    if body.wa_texto is not None:
        e.wa_texto = body.wa_texto.strip()[:1500] or None
    if body.layout is not None:
        atual = svc.layout_etapa(e)
        atual.update(_limpa_layout(body.layout, svc.LAYOUT_ETAPA))
        e.layout = json.dumps({k: v for k, v in atual.items() if v}, ensure_ascii=False) or None
    if body.ativa is not None:
        e.ativa = body.ativa
    e.updated_by = current_user.id
    _audit(db, current_user, "cobranca.etapa", {"etapa": chave, "alteracoes": body.model_dump(exclude_none=True)})
    db.commit()
    return _etapa_dict(e)


class PreviaIn(BaseModel):
    assunto: str = Field("", max_length=300)
    texto: str = Field("", max_length=4000)
    origem: str = Field("asaas", pattern="^(asaas|itau)$")     # só para a prévia visual: link da fatura x PDF anexado
    layout: Optional[dict] = None                               # edições ainda não salvas do layout da etapa
    layout_global: Optional[dict] = None                        # edições ainda não salvas do rodapé/contatos


@router.post("/etapas/{chave}/previa")
def previa_etapa(chave: str, body: PreviaIn, current_user=_ler, db: Session = Depends(get_db)):
    """Renderiza o texto digitado com um boleto real em aberto (ou um exemplo), sem salvar nada."""
    e = db.query(CobrancaEnvio).filter(CobrancaEnvio.etapa == chave).order_by(CobrancaEnvio.id.desc()).first()
    if not e:
        e = CobrancaEnvio(nome="Cliente Exemplo LTDA", valor=1240.50, vencimento=svc.hoje_br(), link="https://www.asaas.com/i/exemplo")
    cfg = svc.carregar_cfg(db)
    assunto, corpo = svc.renderizar(body.assunto, body.texto, e, svc.hoje_br(), svc._int(cfg["regua_prazo_bloqueio_dias"], 3))
    html = None
    et = db.get(CobrancaEtapa, chave)
    if et and "email" in (et.canais or ""):
        try:
            if body.layout_global:
                cfg = {**cfg, **{"email_" + k: v for k, v in _limpa_layout(body.layout_global, svc.LAYOUT_GLOBAL).items() if v}}
            lay = None
            if body.layout is not None:
                lay = _limpa_layout(body.layout, svc.LAYOUT_ETAPA)
            html = svc.exemplo_email(et, body.assunto, body.texto, cfg, svc.hoje_br(), body.origem, lay)["html"]
        except Exception:                                      # prévia visual nunca derruba a edição da etapa
            log.exception("prévia visual da etapa %s", chave)
    return {"assunto": assunto, "corpo": corpo, "exemplo": e.nome, "html": html}


# ── layout global do e-mail (rodapé e contatos) ───────────────────────────────

@router.get("/layout-global")
def ler_layout_global(current_user=_ler, db: Session = Depends(get_db)):
    cfg = svc.carregar_cfg(db)
    return {"layout": svc.layout_global(cfg), "limites": svc.LAYOUT_GLOBAL, "padrao": {k: svc._DEFAULTS_CFG["email_" + k] for k in svc.LAYOUT_GLOBAL}}


class LayoutGlobalIn(BaseModel):
    layout: dict


@router.put("/layout-global")
def salvar_layout_global(body: LayoutGlobalIn, current_user=_admin, db: Session = Depends(get_db)):
    novo = _valida_global(body.layout)
    for k, v in novo.items():
        _set_setting(db, "email_" + k, v)
    _audit(db, current_user, "cobranca.layout_global", {"campos": sorted(novo)})
    db.commit()
    return {"layout": svc.layout_global(svc.carregar_cfg(db))}


# ── configuração (chave geral, modo teste, e-mail) ────────────────────────────

class ConfigIn(BaseModel):
    envio_ativo: Optional[bool] = None
    modo_teste: Optional[bool] = None
    email_teste: Optional[str] = None
    limite_diario: Optional[int] = None
    geracao_automatica: Optional[bool] = None
    remetente: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_porta: Optional[int] = None
    smtp_seguranca: Optional[str] = None
    smtp_usuario: Optional[str] = None
    smtp_senha: Optional[str] = None           # só escrita; nunca devolvida
    horario_inicio: Optional[str] = None       # "09:00"
    horario_fim: Optional[str] = None          # "18:00"
    feriados_extra: Optional[str] = None
    lancamento_desde: Optional[str] = None     # "2026-11-20" ou "" (desligado)
    lancamento_janela_dias: Optional[int] = None
    imap_host: Optional[str] = None
    imap_porta: Optional[int] = None
    imap_usuario: Optional[str] = None
    imap_senha: Optional[str] = None           # só escrita; nunca devolvida
    whatsapp_ativo: Optional[bool] = None
    whatsapp_limite_5min: Optional[int] = None
    whatsapp_limite_diario: Optional[int] = None
    whatsapp_telefone_teste: Optional[str] = None
    umbler_token: Optional[str] = None         # só escrita; nunca devolvida
    umbler_org_id: Optional[str] = None
    umbler_from_phone: Optional[str] = None
    umbler_base_url: Optional[str] = None


@router.get("/config")
def ler_config(current_user=_admin, db: Session = Depends(get_db)):
    c = svc.carregar_cfg(db)
    return {"envio_ativo": c["regua_envio_ativo"] == "1", "modo_teste": c["regua_modo_teste"] == "1", "email_teste": c["regua_email_teste"],
            "limite_diario": svc._int(c["regua_limite_diario"], 300), "geracao_automatica": c["regua_geracao_automatica"] == "1",
            "remetente": c["cobranca_email_remetente"], "smtp_host": c["cobranca_smtp_host"], "smtp_porta": svc._int(c["cobranca_smtp_porta"], 587),
            "smtp_seguranca": c["cobranca_smtp_seguranca"], "smtp_usuario": c["cobranca_smtp_usuario"],
            "smtp_senha_configurada": bool(c["cobranca_smtp_senha"]), "smtp_configurado": svc.smtp_configurado(c),
            "horario_inicio": c["regua_horario_inicio"], "horario_fim": c["regua_horario_fim"], "feriados_extra": c["regua_feriados_extra"],
            "lancamento_desde": c["regua_lancamento_desde"], "lancamento_janela_dias": svc._int(c["regua_lancamento_janela_dias"], 10),
            "imap_host": c["cobranca_imap_host"], "imap_porta": svc._int(c["cobranca_imap_porta"], 993), "imap_usuario": c["cobranca_imap_usuario"],
            "imap_senha_configurada": bool(c["cobranca_imap_senha"]), "imap_configurado": svc.imap_configurado(c),
            "whatsapp_ativo": c["whatsapp_ativo"] == "1", "whatsapp_pausado_motivo": c["whatsapp_pausado_motivo"],
            "whatsapp_limite_5min": svc._int(c["whatsapp_limite_5min"], 100), "whatsapp_limite_diario": svc._int(c["whatsapp_limite_diario"], 30),
            "whatsapp_telefone_teste": c["whatsapp_telefone_teste"], "umbler_org_id": c["umbler_org_id"], "umbler_from_phone": c["umbler_from_phone"],
            "umbler_base_url": c["umbler_base_url"], "umbler_token_configurado": bool(c["umbler_token"]),
            "whatsapp_configurado": svc.whatsapp_configurado(c), "whatsapp_canal_estado": c["whatsapp_canal_estado"]}


@router.put("/config")
def salvar_config(body: ConfigIn, current_user=_admin, db: Session = Depends(get_db)):
    c = svc.carregar_cfg(db)
    mapa = {}
    if body.email_teste is not None:
        if not svc.emails_validos(body.email_teste):
            raise HTTPException(400, "E-mail de teste inválido.")
        mapa["regua_email_teste"] = svc.emails_validos(body.email_teste)[0]
    if body.remetente is not None:
        if not svc.emails_validos(body.remetente):
            raise HTTPException(400, "E-mail do remetente inválido.")
        mapa["cobranca_email_remetente"] = svc.emails_validos(body.remetente)[0]
    if body.limite_diario is not None:
        if not 1 <= body.limite_diario <= 5000:
            raise HTTPException(400, "Limite diário deve ficar entre 1 e 5000.")
        mapa["regua_limite_diario"] = str(body.limite_diario)
    if body.smtp_seguranca is not None:
        if body.smtp_seguranca not in ("starttls", "ssl"):
            raise HTTPException(400, "Segurança inválida: use STARTTLS ou SSL (a senha nunca vai sem criptografia).")
        mapa["cobranca_smtp_seguranca"] = body.smtp_seguranca
    # Trocar servidor ou usuário exige digitar a senha de novo: sem isso, a senha guardada seria enviada para outro destino.
    if body.smtp_host is not None and body.smtp_host.strip() != c["cobranca_smtp_host"]:
        if body.smtp_host.strip() and not _host_publico(body.smtp_host):
            raise HTTPException(400, "Servidor SMTP inválido (precisa ser um endereço público de e-mail, ex.: smtp.seuprovedor.com).")
        if not body.smtp_senha:
            raise HTTPException(400, "Ao trocar o servidor de e-mail, digite a senha novamente.")
        mapa["cobranca_smtp_host"] = body.smtp_host.strip()
    if body.smtp_porta is not None:
        if body.smtp_porta not in PORTAS_SMTP:
            raise HTTPException(400, "Porta SMTP inválida (use 587, 465, 25 ou 2525).")
        mapa["cobranca_smtp_porta"] = str(body.smtp_porta)
    if body.smtp_usuario is not None and body.smtp_usuario.strip() != c["cobranca_smtp_usuario"]:
        if not body.smtp_senha:
            raise HTTPException(400, "Ao trocar o usuário do e-mail, digite a senha novamente.")
        mapa["cobranca_smtp_usuario"] = body.smtp_usuario.strip()
    if body.smtp_senha:                                       # vazio = mantém a atual
        mapa["cobranca_smtp_senha"] = body.smtp_senha
    if body.modo_teste is not None:
        if not body.modo_teste and c["regua_modo_teste"] == "1":
            # o que foi "enviado" em modo teste NÃO pode bloquear a cobrança de verdade: libera a chave (etapa+boleto+canal) desses itens
            db.execute(text("""UPDATE cobranca_envios SET boleto_ref = boleto_ref || '#teste' || id
                                WHERE COALESCE(modo_teste, false) AND boleto_ref NOT LIKE '%#teste%'"""))
        mapa["regua_modo_teste"] = "1" if body.modo_teste else "0"
    if body.geracao_automatica is not None:
        mapa["regua_geracao_automatica"] = "1" if body.geracao_automatica else "0"
    hhmm = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
    if body.horario_inicio is not None or body.horario_fim is not None:
        ini = body.horario_inicio if body.horario_inicio is not None else c["regua_horario_inicio"]
        fim = body.horario_fim if body.horario_fim is not None else c["regua_horario_fim"]
        if not hhmm.match(ini) or not hhmm.match(fim) or svc._hhmm(ini, 0) >= svc._hhmm(fim, 0):
            raise HTTPException(400, "Horário inválido: use HH:MM e o início deve ser antes do fim.")
        mapa["regua_horario_inicio"], mapa["regua_horario_fim"] = ini, fim
    if body.feriados_extra is not None:
        itens = [t for t in re.split(r"[;,\s]+", body.feriados_extra.strip()) if t]
        if any(not re.fullmatch(r"\d{1,2}/\d{1,2}(/\d{4})?", t) for t in itens):
            raise HTTPException(400, "Feriados extras: use datas no formato 25/01 (todo ano) ou 08/04/2026, separadas por vírgula.")
        mapa["regua_feriados_extra"] = ", ".join(itens)
    if body.lancamento_desde is not None:
        v = body.lancamento_desde.strip()
        if v and svc._data_cfg(v) is None:
            raise HTTPException(400, "Data do aviso de lançamento inválida (use AAAA-MM-DD).")
        mapa["regua_lancamento_desde"] = v
    if body.lancamento_janela_dias is not None:
        if not 1 <= body.lancamento_janela_dias <= 60:
            raise HTTPException(400, "A janela do aviso de lançamento fica entre 1 e 60 dias.")
        mapa["regua_lancamento_janela_dias"] = str(body.lancamento_janela_dias)
    if body.imap_host is not None and body.imap_host.strip() != c["cobranca_imap_host"]:
        h = body.imap_host.strip()
        if h and not _host_publico(h):
            raise HTTPException(400, "Servidor IMAP inválido (precisa ser um endereço público de e-mail, ex.: imap.seuprovedor.com).")
        if h and not body.imap_senha and _dominio_base(h) != _dominio_base(c["cobranca_smtp_host"] or h + "x"):
            raise HTTPException(400, "O servidor IMAP é de outro provedor que o do envio: digite a senha da caixa.")
        mapa["cobranca_imap_host"] = h
    if body.imap_porta is not None:
        if body.imap_porta not in PORTAS_IMAP:
            raise HTTPException(400, "Porta IMAP inválida (use 993, SSL).")
        mapa["cobranca_imap_porta"] = str(body.imap_porta)
    if body.imap_usuario is not None and body.imap_usuario.strip() != c["cobranca_imap_usuario"]:
        if body.imap_usuario.strip() and not body.imap_senha:
            raise HTTPException(400, "Ao trocar o usuário da caixa, digite a senha novamente.")
        mapa["cobranca_imap_usuario"] = body.imap_usuario.strip()
    if body.imap_senha:
        mapa["cobranca_imap_senha"] = body.imap_senha
    if body.whatsapp_limite_5min is not None:
        if not 1 <= body.whatsapp_limite_5min <= 100:
            raise HTTPException(400, "O limite a cada 5 minutos fica entre 1 e 100.")
        mapa["whatsapp_limite_5min"] = str(body.whatsapp_limite_5min)
    if body.whatsapp_limite_diario is not None:
        if not 1 <= body.whatsapp_limite_diario <= 2000:
            raise HTTPException(400, "O limite diário do WhatsApp fica entre 1 e 2000.")
        mapa["whatsapp_limite_diario"] = str(body.whatsapp_limite_diario)
    if body.whatsapp_telefone_teste is not None:
        if body.whatsapp_telefone_teste.strip():
            tel = umbler.normalizar_telefone(body.whatsapp_telefone_teste)
            if not tel:
                raise HTTPException(400, "Telefone de teste inválido (use celular com DDD).")
            mapa["whatsapp_telefone_teste"] = tel
        else:
            mapa["whatsapp_telefone_teste"] = ""
    if body.umbler_from_phone is not None:
        if body.umbler_from_phone.strip():
            tel = umbler.normalizar_telefone(body.umbler_from_phone)
            if not tel:
                raise HTTPException(400, "Número do canal inválido (use celular com DDD).")
            mapa["umbler_from_phone"] = tel
        else:
            mapa["umbler_from_phone"] = ""
    if body.umbler_org_id is not None:
        mapa["umbler_org_id"] = re.sub(r"[^A-Za-z0-9_\-]", "", body.umbler_org_id)[:80]
    if body.umbler_base_url is not None:
        u = body.umbler_base_url.strip().rstrip("/")
        if u and u != umbler.BASE_PADRAO:                      # endereço fixo: o token nunca vai para outro destino
            raise HTTPException(400, "O endereço da API da Umbler é fixo e não pode ser alterado.")
        mapa["umbler_base_url"] = ""
    if body.umbler_token:                                     # vazio = mantém o atual
        mapa["umbler_token"] = body.umbler_token.strip()
    if body.whatsapp_ativo is not None:
        if body.whatsapp_ativo and not svc.whatsapp_configurado({**c, **mapa}):
            raise HTTPException(400, "Configure a Umbler (token, ID da organização e número do canal) antes de ligar o WhatsApp.")
        mapa["whatsapp_ativo"] = "1" if body.whatsapp_ativo else "0"
        if body.whatsapp_ativo:
            mapa["whatsapp_pausado_motivo"] = ""              # quem religa assume a decisão
            mapa["whatsapp_religado_em"] = datetime.now(timezone.utc).isoformat()   # o disjuntor por taxa só olha mensagens DEPOIS daqui
    if body.envio_ativo is not None:
        if body.envio_ativo and not svc.smtp_configurado({**c, **mapa}):
            raise HTTPException(400, "Configure o e-mail (servidor, usuário e senha) antes de ligar o envio.")
        mapa["regua_envio_ativo"] = "1" if body.envio_ativo else "0"
    for k, v in mapa.items():
        _set_setting(db, k, v)
    _audit(db, current_user, "cobranca.config", {k: ("•••" if k in svc.SEGREDOS else v) for k, v in mapa.items()})
    db.commit()
    return ler_config(current_user, db)


@router.post("/smtp-teste")
def smtp_teste(current_user=_admin, db: Session = Depends(get_db)):
    """Envia um e-mail de teste do remetente para ele mesmo — confirma servidor, usuário e senha."""
    c = svc.carregar_cfg(db)
    if not svc.smtp_configurado(c):
        raise HTTPException(400, "Preencha servidor, usuário e senha do e-mail.")
    try:
        svc._enviar_smtp(c, [c["cobranca_email_remetente"]], "Teste da régua de cobrança — Gestora Smart",
                         "Este é um e-mail de teste da régua de cobrança. Se você recebeu, o envio está configurado.",
                         svc.corpo_html("Este é um e-mail de teste da régua de cobrança. Se você recebeu, o envio está configurado.", "Gestora Smart"))
    except Exception as ex:
        msg = str(ex).replace(c["cobranca_smtp_senha"], "•••") if c["cobranca_smtp_senha"] else str(ex)
        raise HTTPException(400, f"Não foi possível enviar: {msg[:200]}")
    return {"ok": True, "para": c["cobranca_email_remetente"]}


# ── pausas ─────────────────────────────────────────────────────────────────────

class PausaIn(BaseModel):
    id_smart: str
    ate: Optional[date] = None
    motivo: Optional[str] = None


@router.get("/pausas")
def listar_pausas(current_user=_ler, db: Session = Depends(get_db)):
    rows = db.execute(text("""SELECT p.id, p.id_smart, p.ate, p.motivo, p.criado_em, COALESCE(c.nome, p.id_smart) AS nome
                                FROM cobranca_pausas p LEFT JOIN client_profiles c ON c.id_smart = p.id_smart
                               WHERE p.ativa AND (p.ate IS NULL OR p.ate >= :h) ORDER BY p.criado_em DESC"""), {"h": svc.hoje_br()}).mappings().all()
    return [{**dict(r), "ate": r["ate"].isoformat() if r["ate"] else None, "criado_em": r["criado_em"].isoformat()} for r in rows]


@router.post("/pausas")
def criar_pausa(body: PausaIn, current_user=_ler, db: Session = Depends(get_db)):
    if not re.fullmatch(r"ss_\d+", body.id_smart.strip()):
        raise HTTPException(400, "ID do cliente inválido (ex.: ss_12345678000199).")
    idc = body.id_smart.strip()
    if body.ate and body.ate < svc.hoje_br():
        raise HTTPException(400, "A data da pausa já passou.")
    db.query(CobrancaPausa).filter(CobrancaPausa.id_smart == idc, CobrancaPausa.ativa == True).update({"ativa": False})  # noqa: E712
    db.add(CobrancaPausa(id_smart=idc, ate=body.ate, motivo=(body.motivo or "")[:300], criado_por=current_user.id))
    n = (db.query(CobrancaEnvio).filter(CobrancaEnvio.id_smart == idc, CobrancaEnvio.status.in_(["pendente", "aprovado", "sem_contato"]))
         .update({"status": "cancelado", "erro": "cliente pausado na régua"}, synchronize_session=False))
    _audit(db, current_user, "cobranca.pausar", {"id_smart": idc, "ate": str(body.ate), "motivo": body.motivo, "itens_cancelados": n})
    db.commit()
    return {"ok": True, "itens_cancelados": n}


@router.delete("/pausas/{pausa_id}")
def remover_pausa(pausa_id: int, current_user=_ler, db: Session = Depends(get_db)):
    p = db.get(CobrancaPausa, pausa_id)
    if not p:
        raise HTTPException(404, "Pausa não encontrada")
    p.ativa = False
    _audit(db, current_user, "cobranca.despausar", {"id_smart": p.id_smart})
    db.commit()
    return {"ok": True}


# ── WhatsApp (Umbler): autorizações, estados e teste de conexão ───────────────

@router.get("/whatsapp/autorizacoes")
def listar_autorizacoes(status: Optional[str] = None, search: str = "", page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                        current_user=_ler, db: Session = Depends(get_db)):
    base = """FROM cobranca_whatsapp_consent a
              LEFT JOIN client_profiles p ON p.id_smart = a.id_smart
              LEFT JOIN LATERAL (SELECT name FROM asaas_customers_sync s WHERE s.external_reference = a.id_smart LIMIT 1) s ON true
             WHERE (:st = '' OR a.status = :st) AND (:q = '' OR COALESCE(NULLIF(p.nome,''), s.name, a.id_smart) ILIKE :like OR a.id_smart ILIKE :like)"""
    prm = {"st": status or "", "q": search.strip(), "like": f"%{search.strip()}%"}
    total = db.execute(text(f"SELECT count(*) {base}"), prm).scalar()
    rows = db.execute(text(f"""SELECT a.id_smart, COALESCE(NULLIF(p.nome,''), s.name, a.id_smart) AS nome, a.status, a.telefone, a.pedido_em, a.respondido_em,
                                      a.resposta_texto, a.origem {base} ORDER BY (a.status IN ('respondeu_outro')) DESC, a.atualizado_em DESC
                                      LIMIT :l OFFSET :o"""), {**prm, "l": limit, "o": (page - 1) * limit}).mappings().all()
    itens = [{**dict(r), "pedido_em": r["pedido_em"].isoformat() if r["pedido_em"] else None,
              "respondido_em": r["respondido_em"].isoformat() if r["respondido_em"] else None} for r in rows]
    return {"total": total, "page": page, "pages": max(1, -(-total // limit)), "itens": itens}


class AutorizacaoIn(BaseModel):
    status: str                                   # aceitou | recusou
    motivo: str = Field("", max_length=300)       # como/quando o cliente respondeu (obrigatório para registrar "autorizou")


@router.put("/whatsapp/autorizacoes/{id_smart}")
def decidir_autorizacao(id_smart: str, body: AutorizacaoIn, current_user=_ler, db: Session = Depends(get_db)):
    """O analista registra a decisão do cliente quando ela veio por outro caminho (e-mail, telefone) ou quando a resposta foi
    diferente de sim/não. Fica a prova na auditoria (motivo + situação anterior). Quem recusou só volta a "autorizou" pela mão de um gestor."""
    from app.core.permissions import get_permission
    if body.status not in ("aceitou", "recusou"):
        raise HTTPException(400, "Decisão inválida.")
    if not re.fullmatch(r"ss_\d+", id_smart):
        raise HTTPException(400, "ID do cliente inválido.")
    motivo = (body.motivo or "").strip()
    if body.status == "aceitou" and len(motivo) < 5:
        raise HTTPException(400, "Para registrar que o cliente autorizou, informe como e quando ele autorizou (ex.: 'respondeu por e-mail em 24/10').")
    tel = svc.mapa_telefones(db).get(id_smart)
    c = db.get(CobrancaWhatsConsent, id_smart)
    anterior = c.status if c else None
    if body.status == "aceitou" and anterior == "recusou" and not get_permission(current_user, "can_approve_billing", db):
        raise HTTPException(403, "O cliente pediu para não receber WhatsApp. Só um gestor/admin pode reverter isso.")
    if body.status == "aceitou" and not (tel or (c and c.telefone)):
        raise HTTPException(400, "O cliente não tem celular válido cadastrado. Preencha o telefone na aba Clientes antes.")
    if not c:
        c = CobrancaWhatsConsent(id_smart=id_smart, telefone=tel, pedido_em=None)
        db.add(c)
    c.status, c.origem, c.atualizado_por, c.motivo = body.status, "manual", current_user.id, motivo or None
    c.respondido_em = datetime.now(timezone.utc)
    if body.status == "recusou":
        db.query(CobrancaEnvio).filter(CobrancaEnvio.id_smart == id_smart, CobrancaEnvio.canal == "whatsapp",
                                       CobrancaEnvio.status.in_(["pendente", "aprovado"])).update(
            {"status": "cancelado", "erro": "cliente não autorizou WhatsApp"}, synchronize_session=False)
    _audit(db, current_user, "cobranca.autorizacao", {"id_smart": id_smart, "de": anterior, "para": body.status, "motivo": motivo})
    db.commit()
    return {"ok": True}


@router.post("/whatsapp/atualizar-estados")
def atualizar_estados(current_user=_ler, db: Session = Depends(get_db)):
    """Consulta agora, na Umbler, o estado das mensagens enviadas e as respostas dos clientes."""
    _cooldown(db, "estados", 20)
    a = svc.atualizar_entregas(db)
    r = svc.processar_respostas(db)
    return {"entregas": a, "respostas": r}


@router.post("/whatsapp/testar")
def testar_umbler(current_user=_admin, db: Session = Depends(get_db)):
    """Teste de conexão SÓ DE LEITURA: confirma o token e lê o estado do canal. Não envia nada."""
    c = svc.carregar_cfg(db)
    if not c["umbler_token"]:
        raise HTTPException(400, "Cole o token da Umbler na configuração primeiro.")
    out = {}
    try:
        out["conta"] = umbler.minha_conta(c)
    except umbler.UmblerErro as e:
        raise HTTPException(400, f"Não foi possível conectar: {str(e)[:200]}")
    if svc.whatsapp_configurado(c):
        try:
            out["canal"] = svc.checar_canal(db)
        except Exception:
            out["canal"] = {"erro": True}
    return out


# ── e-mails devolvidos ────────────────────────────────────────────────────────

@router.post("/devolucoes/testar")
def testar_caixa(current_user=_admin, db: Session = Depends(get_db)):
    """Confere o login na caixa de entrada (IMAP) e conta as mensagens. Só leitura."""
    c = svc.carregar_cfg(db)
    if not svc.imap_configurado(c):
        raise HTTPException(400, "Informe o servidor IMAP (e a conta de e-mail do envio) antes de testar.")
    try:
        return devolucoes.testar(c)
    except Exception as ex:
        msg = str(ex)
        for seg in (c["cobranca_imap_senha"], c["cobranca_smtp_senha"]):
            if seg:
                msg = msg.replace(seg, "•••")
        raise HTTPException(400, f"Não foi possível entrar na caixa: {msg[:160]}")


@router.post("/devolucoes/ler")
def ler_agora(current_user=_ler, db: Session = Depends(get_db)):
    """Lê agora a caixa de entrada procurando e-mails devolvidos."""
    _cooldown(db, "devolucoes", 30)
    c = svc.carregar_cfg(db)
    if not svc.imap_configurado(c):
        raise HTTPException(400, "A leitura de devoluções ainda não está configurada.")
    r = devolucoes.ler_devolucoes(db, c)
    _audit(db, current_user, "cobranca.ler_devolucoes", {k: v for k, v in r.items() if k != "erro"})
    db.commit()
    return r


@router.get("/emails-invalidos")
def listar_invalidos(current_user=_ler, db: Session = Depends(get_db)):
    rows = db.execute(text("""SELECT i.email, i.motivo, i.codigo, i.detectado_em, i.liberado, e.nome, e.id_smart
                                FROM cobranca_emails_invalidos i LEFT JOIN cobranca_envios e ON e.id = i.envio_id
                               ORDER BY i.liberado, i.detectado_em DESC LIMIT 500""")).mappings().all()
    return [{**dict(r), "detectado_em": r["detectado_em"].isoformat() if r["detectado_em"] else None} for r in rows]


class EmailIn(BaseModel):
    email: str


@router.post("/emails-invalidos/liberar")
def liberar_email(body: EmailIn, current_user=_ler, db: Session = Depends(get_db)):
    """O analista confirma que o endereço voltou a funcionar (ou foi corrigido): a régua volta a usá-lo."""
    n = db.execute(text("UPDATE cobranca_emails_invalidos SET liberado = true WHERE email = :e"), {"e": body.email.strip().lower()}).rowcount
    _audit(db, current_user, "cobranca.liberar_email", {"email": body.email.strip().lower()})
    db.commit()
    return {"liberados": n}


# ── Boletos do Itaú (PDF anexado no e-mail) ───────────────────────────────────

_NOSSO_OK = re.compile(r"^[0-9A-Za-z\-/.]{1,50}$")


@router.get("/boletos-itau")
def listar_boletos_itau(search: str = "", so_sem_pdf: bool = False, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                        current_user=_ler, db: Session = Depends(get_db)):
    """Boletos do Itaú em aberto e se já têm o PDF no sistema."""
    base = """FROM itau_boletos i LEFT JOIN cobranca_boletos_itau b ON b.nosso_numero = i.nosso_numero
              WHERE i.data_pagamento IS NULL AND i.data_baixa IS NULL AND COALESCE(i.status,'') NOT IN ('paga','cancelada') AND COALESCE(i.valor_titulo,0) > 0
                AND (:q = '' OR i.pagador ILIKE :like OR i.nosso_numero = :q OR regexp_replace(COALESCE(i.cpf_cnpj,''), '\\D', '', 'g') LIKE :qd)"""
    p = {"q": search.strip(), "like": f"%{search.strip()}%", "qd": f"%{re.sub(r'[^0-9]', '', search) or '§'}%"}
    filtro = " AND b.id IS NULL" if so_sem_pdf else ""
    total = db.execute(text(f"SELECT count(*) {base}{filtro}"), p).scalar()
    sem = db.execute(text(f"SELECT count(*) {base} AND b.id IS NULL"), p).scalar()
    rows = db.execute(text(f"""SELECT i.nosso_numero, i.pagador, i.cpf_cnpj, i.valor_titulo, i.data_vencimento, (b.id IS NOT NULL) AS tem_pdf,
                                      b.arquivo_nome, b.enviado_em, b.vinculo, (b.linha_digitavel IS NOT NULL) AS tem_linha
                               {base}{filtro} ORDER BY (b.id IS NULL) DESC, i.data_vencimento, i.pagador LIMIT :l OFFSET :o"""),
                      {**p, "l": limit, "o": (page - 1) * limit}).mappings().all()
    itens = [{**dict(r), "data_vencimento": r["data_vencimento"].isoformat() if r["data_vencimento"] else None,
              "enviado_em": r["enviado_em"].isoformat() if r["enviado_em"] else None} for r in rows]
    return {"total": total, "sem_pdf": sem, "page": page, "pages": max(1, -(-total // limit)), "itens": itens}


@router.post("/boletos-itau/upload")
async def upload_boletos_itau(files: List[UploadFile] = File(...), modo: str = Form("analisar"), atribuicoes: str = Form("{}"),
                              substituir: bool = Form(False), current_user=_ler, db: Session = Depends(get_db)):
    """modo=analisar: lê os PDFs/ZIP e mostra com qual boleto cada um casaria (NÃO grava nada).
    modo=vincular: grava os que casaram com segurança (ou que o analista atribuiu à mão em `atribuicoes`: {arquivo: nosso_numero})."""
    if modo not in ("analisar", "vincular"):
        raise HTTPException(400, "Modo inválido.")
    try:
        manual = json.loads(atribuicoes or "{}")
        if not isinstance(manual, dict):
            raise ValueError
    except ValueError:
        raise HTTPException(400, "Atribuições inválidas.")
    brutos, total = [], 0
    for f in files:
        conteudo = await f.read()
        total += len(conteudo)
        if total > bi.MAX_ZIP * 2:
            raise HTTPException(400, "Arquivos grandes demais de uma vez.")
        brutos.append((f.filename or "arquivo", conteudo))
    try:
        arquivos = bi.expandir_arquivos(brutos)
    except bi.PdfInvalido as ex:
        raise HTTPException(400, str(ex))
    cnpj_emp = db.execute(text("SELECT value FROM system_settings WHERE key = 'empresa_cnpj'")).scalar() or "35.775.152/0001-40"
    cands = bi.candidatos_abertos(db)
    por_nosso = {c["nosso_numero"]: c for c in cands}
    usados, itens = set(), []
    for nome, conteudo, erro_pre in arquivos[:bi.MAX_ARQUIVOS]:
        it = {"arquivo": nome, "status": "", "motivo": "", "boleto": None, "vinculo": None, "linha": False}
        try:
            if erro_pre or conteudo is None:
                raise bi.PdfInvalido(erro_pre or "arquivo vazio")
            texto = bi.validar_e_ler(conteudo)
            ev = bi.extrair_evidencias(texto, nome, cnpj_emp)
            it["linha"] = bool(ev["linha"])
            if nome in manual and manual[nome] in por_nosso:
                st, c, vinc, mot = "ok", por_nosso[manual[nome]], "manual", "vínculo manual"
            else:
                st, c, vinc, mot = bi.casar(ev, cands)
            it.update(status=st, motivo=mot, vinculo=vinc)
            if c and st == "divergente":                         # só sugere; gravar exige vínculo manual do analista
                it["boleto"] = {"nosso_numero": c["nosso_numero"], "pagador": c["pagador"], "valor": float(c["valor_titulo"] or 0),
                                "vencimento": c["data_vencimento"].isoformat() if c["data_vencimento"] else None, "tem_pdf": bool(c["tem_pdf"])}
            elif c:
                it["boleto"] = {"nosso_numero": c["nosso_numero"], "pagador": c["pagador"], "valor": float(c["valor_titulo"] or 0),
                                "vencimento": c["data_vencimento"].isoformat() if c["data_vencimento"] else None, "tem_pdf": bool(c["tem_pdf"])}
                if c["nosso_numero"] in usados:
                    it.update(status="duplicado", motivo="outro arquivo deste lote já vai para este boleto")
                elif c["tem_pdf"] and not substituir:
                    it.update(status="ja_tem", motivo="este boleto já tem PDF (marque 'substituir' para trocar)")
                elif modo == "vincular":
                    r = bi.salvar(db, c["nosso_numero"], nome, conteudo, ev["linha"], vinc or "dados", current_user.id, substituir, c["valor_titulo"], c["data_vencimento"])
                    it["status"] = "vinculado" if r == "novo" else "substituido"
                    usados.add(c["nosso_numero"])
                else:
                    usados.add(c["nosso_numero"])
        except bi.PdfInvalido as ex:
            it.update(status="invalido", motivo=str(ex))
        itens.append(it)
    resumo = {}
    for it in itens:
        resumo[it["status"]] = resumo.get(it["status"], 0) + 1
    if modo == "vincular":
        svc.reavaliar_lancamentos(db)                       # avisos de lançamento que esperavam estes PDFs voltam para aprovação
        _audit(db, current_user, "cobranca.boletos_itau_vincular", {"resumo": resumo, "arquivos": len(itens)})
    db.commit()
    return {"modo": modo, "resumo": resumo, "itens": itens, "total": len(itens)}


@router.get("/boletos-itau/{nosso}/pdf")
def baixar_boleto_itau(nosso: str, current_user=_ler, db: Session = Depends(get_db)):
    if not _NOSSO_OK.match(nosso):
        raise HTTPException(400, "Número inválido.")
    r = db.execute(text("SELECT pdf, arquivo_nome FROM cobranca_boletos_itau WHERE nosso_numero = :n"), {"n": nosso}).fetchone()
    if not r:
        raise HTTPException(404, "Boleto não encontrado.")
    return Response(content=bytes(r[0]), media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="boleto.pdf"', "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})


@router.delete("/boletos-itau/{nosso}")
def remover_boleto_itau(nosso: str, current_user=_ler, db: Session = Depends(get_db)):
    """Remove o PDF; os e-mails ainda não enviados desse boleto voltam a 'aguardando boleto'."""
    if not _NOSSO_OK.match(nosso):
        raise HTTPException(400, "Número inválido.")
    n = db.execute(text("DELETE FROM cobranca_boletos_itau WHERE nosso_numero = :n"), {"n": nosso}).rowcount
    seg = db.execute(text("""UPDATE cobranca_envios SET status='sem_boleto', erro='PDF do boleto removido — suba novamente'
                              WHERE origem='itau' AND canal='email' AND status IN ('pendente','aprovado') AND boleto_ref LIKE :r"""), {"r": f"itau:{nosso}:%"}).rowcount
    svc.reavaliar_lancamentos(db)
    _audit(db, current_user, "cobranca.boleto_itau_remover", {"nosso_numero": nosso, "emails_segurados": seg})
    db.commit()
    return {"removidos": n, "emails_segurados": seg}
