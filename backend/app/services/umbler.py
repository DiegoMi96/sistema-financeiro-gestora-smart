"""
Cliente da API da Umbler (uTalk) — WhatsApp.  Documentação: https://app-utalk.umbler.com/api/docs
Só funções de rede + interpretação das respostas; nenhuma regra de negócio aqui (ver services/cobranca.py).

Segurança: o token nunca é gravado em log nem aparece em mensagens de erro.
Como a estrutura exata das respostas pode variar, a leitura é defensiva (.get com padrões) — um campo
inesperado nunca derruba o envio, no máximo deixa o estado "desconhecido".
"""
import re
from typing import Optional

import httpx

BASE_PADRAO = "https://app-utalk.umbler.com/api"
TIMEOUT = 20.0

# Estados da mensagem na Umbler (MessageStates) → nosso estado de entrega, do menos ao mais avançado.
ORDEM_ENTREGA = {"processando": 0, "enviada": 1, "entregue": 2, "lida": 3}
_MAP_ESTADO = {"processing": "processando", "submitted": "processando", "retrying": "processando",
               "sent": "enviada", "received": "entregue", "read": "lida", "played": "lida"}
_ESTADOS_FALHA = {"failed", "error"}


class UmblerErro(Exception):
    def __init__(self, msg: str, status: Optional[int] = None):
        super().__init__(msg)
        self.status = status


def _limpa(texto: str, token: str) -> str:
    return texto.replace(token, "•••") if token else texto


def _req(cfg: dict, metodo: str, caminho: str, *, params: dict = None, json: dict = None) -> dict:
    token = cfg.get("umbler_token", "")
    base = (cfg.get("umbler_base_url") or BASE_PADRAO).rstrip("/")
    try:
        r = httpx.request(metodo, f"{base}{caminho}", params=params, json=json, timeout=TIMEOUT,
                          headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    except httpx.HTTPError as e:
        raise UmblerErro(_limpa(f"falha de rede: {type(e).__name__}", token))
    if r.status_code >= 400:
        corpo = _limpa((r.text or "")[:300], token)
        raise UmblerErro(f"Umbler respondeu {r.status_code}: {corpo}", r.status_code)
    try:
        return r.json() if r.content else {}
    except ValueError:
        return {}


def so_digitos(s) -> str:
    return re.sub(r"\D", "", str(s or ""))


def normalizar_telefone(s) -> Optional[str]:
    """Celular brasileiro → +55DDNNNNNNNNN (E.164). Fixo (10 dígitos) e lixo → None (não tem WhatsApp)."""
    d = so_digitos(re.sub(r"\.0+$", "", str(s or "").strip()))      # '11948019452.0' (número vindo do Excel como decimal) = 11948019452
    d = d.lstrip("0")
    if len(d) in (12, 13) and d.startswith("55"):
        d = d[2:]
    if len(d) == 11 and d[2] == "9" and 11 <= int(d[:2]) <= 99:
        return "+55" + d
    return None


def enviar_template(cfg: dict, para: str, template_id: str, params: list, nome_contato: str = "") -> dict:
    """Envia um template aprovado. Devolve {'id': msg_id, 'chat_id': chat_id}. NUNCA repete sozinho."""
    corpo = {"toPhone": para, "fromPhone": cfg["umbler_from_phone"], "templateId": template_id,
             "organizationId": cfg["umbler_org_id"], "params": [str(p) for p in params]}
    if nome_contato:
        corpo["contactName"] = nome_contato[:100]
    d = _req(cfg, "POST", "/v1/template-messages/simplified/", json=corpo)
    # 2xx = a Umbler ACEITOU a mensagem. Sem ID não dá para acompanhar a entrega, mas NÃO é falha de envio
    # (tratar como falha faria o "Reenviar" duplicar a mensagem).
    msg_id = d.get("id") if isinstance(d, dict) else None
    chat = (d.get("chat") or {}).get("id") if isinstance(d, dict) and isinstance(d.get("chat"), dict) else None
    return {"id": str(msg_id) if msg_id else "", "chat_id": str(chat or "")}


def estado_mensagem(cfg: dict, msg_id: str) -> dict:
    """Consulta o histórico de estados. Devolve {'entrega': 'processando|enviada|entregue|lida|falhou|desconhecido', 'erro': str|None, 'em': iso|None}."""
    d = _req(cfg, "GET", f"/v1/messages/{msg_id}/states/", params={"organizationId": cfg["umbler_org_id"], "id": msg_id})
    estados = d.get("states") if isinstance(d, dict) else d
    melhor, melhor_em, erro, falha = None, None, None, False
    for e in (estados or []):
        st = str(e.get("state") or "").lower()
        if st in _ESTADOS_FALHA:
            falha, erro = True, str(e.get("error") or st)[:300]
        nome = _MAP_ESTADO.get(st)
        if nome and (melhor is None or ORDEM_ENTREGA[nome] >= ORDEM_ENTREGA[melhor]):
            melhor, melhor_em = nome, e.get("eventAtUTC")
    if falha and melhor in (None, "processando"):
        return {"entrega": "falhou", "erro": erro, "em": melhor_em}
    return {"entrega": melhor or "desconhecido", "erro": erro if falha else None, "em": melhor_em}


def respostas_do_chat(cfg: dict, chat_id: str, desde_iso: str) -> list:
    """Mensagens que o CLIENTE mandou no chat desde `desde_iso`: [{'texto', 'em', 'botao'}]."""
    d = _req(cfg, "GET", f"/v1/chats/{chat_id}/relative-messages/",
             params={"organizationId": cfg["umbler_org_id"], "chatId": chat_id, "FromEventUTC": desde_iso,
                     "Take": 30, "Direction": "Forward"})
    out = []
    for m in (d.get("messages") or []):
        origem = str(m.get("source") or "").lower()
        if origem not in ("contact", "0"):             # só o que veio do cliente (não nossas mensagens/bot)
            continue
        botao = ((m.get("inReplyTo") or {}).get("button") or {}).get("postbackText") or ""
        texto = (m.get("content") or "").strip() or botao
        out.append({"texto": texto, "em": m.get("eventAtUTC") or m.get("createdAtUTC"), "botao": botao})
    return out


def interpretar_resposta(texto: str) -> Optional[str]:
    """'sim' / 'nao' / None (qualquer outra coisa — fica para o analista decidir)."""
    t = re.sub(r"[^a-z0-9 ]", "", (texto or "").lower().replace("ã", "a").replace("é", "e").replace("ç", "c")).strip()
    if not t:
        return None
    if re.fullmatch(r"(sim|s|aceito|aceitamos|pode|pode sim|autorizo|ok|1|quero|claro|com certeza)", t):
        return "sim"
    if re.fullmatch(r"(nao|n|nao quero|nao aceito|nao autorizo|sair|parar|pare|cancelar|2|remover|stop|descadastrar)", t):
        return "nao"
    if t.startswith(("sair", "parar", "pare ", "nao quero", "nao aceito", "nao autorizo")):
        return "nao"
    return None


def estado_canal(cfg: dict) -> dict:
    """Saúde do canal do número configurado: {'encontrado': bool, 'estado': str, 'ok': bool}. ok=False → pausar tudo."""
    d = _req(cfg, "GET", "/v1/channels/", params={"organizationId": cfg["umbler_org_id"]})
    canais = d if isinstance(d, list) else (d.get("items") or d.get("channels") or [])
    alvo = so_digitos(cfg.get("umbler_from_phone"))[-9:]
    achado = None
    for c in canais:
        if alvo and alvo in so_digitos(c.get("phoneNumber") or c.get("phone") or c.get("number") or str(c)):
            achado = c
            break
    if not achado:
        return {"encontrado": False, "estado": "canal não encontrado na lista (confira o número do canal)", "ok": True}
    valores = [str(v) for k, v in achado.items() if isinstance(v, (str, int)) and re.search(r"state|status|waba", k, re.I)]
    ruins = [v for v in valores if v in ("AccountViolation", "AccountRestricted", "Disabled", "Offline", "Deleted", "WaitingToGoLive", "WaitingAppCreation")]
    return {"encontrado": True, "estado": ", ".join(valores) or "desconhecido", "ok": not ruins}


def minha_conta(cfg: dict) -> dict:
    """Teste de conexão (só leitura): confirma que o token vale e devolve as organizações."""
    d = _req(cfg, "GET", "/v1/members/me/")
    orgs = d.get("organizations") or d.get("organizationMembers") or []
    return {"ok": True, "organizacoes": [{"id": (o.get("organization") or o).get("id"), "nome": (o.get("organization") or o).get("name")} for o in orgs][:10]}
