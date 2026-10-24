"""
Boletos do Itaú em PDF: leitura, vínculo ao boleto certo e armazenamento.

O analista baixa os boletos no portal do Itaú e sobe os PDFs (ou um ZIP) na aba "Boletos Itaú" da Cobrança. Para cada PDF o sistema:
  1. confere que é um PDF de verdade (assinatura, tamanho, poucas páginas) e extrai o texto;
  2. descobre de qual boleto aberto ele é — casando CNPJ/CPF do PAGADOR + vencimento + valor (o "nosso número" do sistema é curto,
     3–4 dígitos, então ele só reforça: quando mais de um boleto bate nos dados, o número desempata);
  3. mostra o resultado ANTES de gravar (modo "analisar"); só grava o que o analista confirmar ("vincular"). O que for ambíguo,
     sem correspondência ou ilegível fica para vínculo manual. Nada é gravado "no chute".
Segurança: PDF só é lido como texto (nunca renderizado/executado); limites de tamanho, páginas, quantidade e descompactação.
"""
import hashlib
import io
import re
import zipfile
from datetime import date

from sqlalchemy import text as _t
from sqlalchemy.orm import Session

MAX_PDF = 2 * 1024 * 1024
MAX_ZIP = 60 * 1024 * 1024
MAX_ARQUIVOS = 600
MAX_PAGINAS = 6

_RE_DATA = re.compile(r"(?<!\d)(\d{2})/(\d{2})/(\d{4})(?!\d)")   # sem \b: no PDF real a data vem colada no texto seguinte ("20/10/2026Núm.")
_RE_VALOR = re.compile(r"(?<![\d.,])\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)")
_RE_LINHA = re.compile(r"\b\d{5}[.\s]?\d{5}\s+\d{5}[.\s]?\d{6}\s+\d{5}[.\s]?\d{6}\s+\d\s+\d{14}\b")
_RE_ROTULO_NUM = re.compile(r"(?i)(nosso\s*n[úu]mero|n[º°o]?\s*do\s*documento|n[úu]m\.?\s*do\s*documento|n[úu]mero\s*do\s*documento|seu\s*n[úu]mero)[^\n]{0,60}(?:\n[^\n]{0,40})?")


class PdfInvalido(Exception):
    pass


def _sem_acento(t: str) -> str:
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFKD", str(t or "")) if not unicodedata.combining(ch))


def _norm_nome(t: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", _sem_acento(t).upper())


def so_digitos(s) -> str:
    return re.sub(r"\D", "", str(s or ""))


def validar_e_ler(conteudo: bytes) -> str:
    """Valida o PDF e devolve o texto (pode vir vazio se for imagem). Levanta PdfInvalido."""
    if len(conteudo) > MAX_PDF:
        raise PdfInvalido("arquivo maior que 2 MB")
    if not conteudo.startswith(b"%PDF-"):
        raise PdfInvalido("não é um PDF")
    if b"%%EOF" not in conteudo[-2048:]:
        raise PdfInvalido("PDF incompleto ou corrompido")
    try:
        from pypdf import PdfReader
        r = PdfReader(io.BytesIO(conteudo))
        if r.is_encrypted:
            try:
                r.decrypt("")
            except Exception:
                raise PdfInvalido("PDF protegido por senha")
        if len(r.pages) > MAX_PAGINAS:
            raise PdfInvalido(f"PDF com {len(r.pages)} páginas (máx. {MAX_PAGINAS}) — parece não ser um boleto")
        return "\n".join((p.extract_text() or "") for p in r.pages)
    except PdfInvalido:
        raise
    except Exception:
        raise PdfInvalido("não foi possível ler o PDF")


def extrair_evidencias(texto: str, nome_arquivo: str, cnpj_empresa: str = "") -> dict:
    digitos = so_digitos(texto)
    datas = set()
    for d, m, a in _RE_DATA.findall(texto):
        try:
            datas.add(date(int(a), int(m), int(d)))
        except ValueError:
            pass
    valores = set()
    for v in _RE_VALOR.findall(texto):
        try:
            valores.add(round(float(v.replace(".", "").replace(",", ".")), 2))
        except ValueError:
            pass
    linha = _RE_LINHA.search(texto)
    nums = set()
    for m in _RE_ROTULO_NUM.finditer(texto):
        for linha_txt in m.group(0).split("\n"):             # cada linha separada: no boleto real o número vem na linha de baixo do rótulo
            d = so_digitos(linha_txt)
            if d:
                nums.add(d)
    nums |= {x for x in re.findall(r"\d+", nome_arquivo or "")}
    token = re.sub(r"[^A-Z0-9]", "", _sem_acento((nome_arquivo or "").rsplit(".", 1)[0]).upper())
    token = token[6:] if token.startswith("BOLETO") else token
    return {"nome_token": token, "digitos": digitos, "datas": datas, "valores": valores, "nums": nums, "tem_texto": bool(texto.strip()),
            "linha": re.sub(r"\s+", " ", linha.group(0)).strip() if linha else None, "cnpj_empresa": so_digitos(cnpj_empresa)}


def _numero_confere(nosso: str, nums: set) -> bool:
    n = so_digitos(nosso).lstrip("0")
    if not n:
        return False
    for x in nums:
        xs = x.lstrip("0")
        if xs == n:
            return True
        # nosso número do banco: carteira + número zero-preenchido + dígito verificador (ex.: 109/00004223-8)
        if re.search(r"(?<!\d)" + re.escape(n) + r"\d?$", x):
            return True
    return False


def candidatos_abertos(db: Session) -> list:
    """Boletos do Itaú ainda em aberto (candidatos a receber um PDF)."""
    rows = db.execute(_t("""SELECT i.nosso_numero, i.pagador, regexp_replace(COALESCE(i.cpf_cnpj,''), '\\D', '', 'g') AS doc,
                                   i.valor_titulo, i.data_vencimento, (b.id IS NOT NULL) AS tem_pdf
                              FROM itau_boletos i LEFT JOIN cobranca_boletos_itau b ON b.nosso_numero = i.nosso_numero
                             WHERE i.data_pagamento IS NULL AND i.data_baixa IS NULL AND COALESCE(i.status,'') NOT IN ('paga','cancelada')
                               AND COALESCE(i.valor_titulo,0) > 0""")).mappings().all()
    return [dict(r) for r in rows]


def casar(ev: dict, cands: list):
    """Devolve (status, boleto|None, vinculo, motivo). status: ok | divergente | ambiguo | sem_correspondencia | ilegivel"""
    if not ev["tem_texto"]:
        return "ilegivel", None, None, "PDF sem texto (imagem/escaneado): vincule manualmente"
    elig, diverg = [], []
    for c in cands:
        doc = c["doc"]
        if not doc or len(doc) not in (11, 14) or doc == ev["cnpj_empresa"] or doc not in ev["digitos"]:
            continue
        venc_ok = c["data_vencimento"] in ev["datas"]
        val_ok = any(abs(float(c["valor_titulo"] or 0) - v) < 0.01 for v in ev["valores"])
        num_ok = _numero_confere(c["nosso_numero"], ev["nums"])
        if venc_ok and val_ok:
            elig.append((c, "nosso" if num_ok else "dados", num_ok))
        elif num_ok:
            diverg.append(c)                                   # CNPJ e número batem, mas valor/vencimento do PDF não: NUNCA liga sozinho
    if not elig:
        if len(diverg) == 1:
            c = diverg[0]
            return "divergente", c, None, "CNPJ e número do boleto batem, mas o valor ou o vencimento do PDF é diferente do sistema: confira e, se estiver certo, vincule manualmente"
        return "sem_correspondencia", None, None, "nenhum boleto em aberto com esse CNPJ, vencimento e valor"
    if len(elig) > 1:
        com_num = [e for e in elig if e[2]]
        if len(com_num) != 1 and ev.get("nome_token"):        # o nome do arquivo (ex.: Boleto_2ETELECOM.pdf) desempata quando o número não ajuda
            com_num = [e for e in elig if _norm_nome(e[0]["pagador"]).startswith(ev["nome_token"][:25])] if len(ev["nome_token"]) >= 4 else []
        if len(com_num) == 1:
            elig = com_num
        else:
            return "ambiguo", None, None, f"{len(elig)} boletos batem com este PDF: escolha manualmente"
    c, vinculo, _ = elig[0]
    return "ok", c, vinculo, "CNPJ + vencimento + valor" + (" + número do boleto" if vinculo == "nosso" else "")


def expandir_arquivos(arquivos: list) -> list:
    """[(nome, bytes)] → lista de PDFs, abrindo ZIPs com proteção (sem gravar em disco, sem caminho, limites de tamanho/quantidade)."""
    out, total = [], 0
    for nome, conteudo in arquivos:
        if (nome or "").lower().endswith(".zip") or conteudo[:2] == b"PK":
            if len(conteudo) > MAX_ZIP:
                raise PdfInvalido(f"ZIP maior que {MAX_ZIP // 1048576} MB")
            try:
                z = zipfile.ZipFile(io.BytesIO(conteudo))
            except zipfile.BadZipFile:
                raise PdfInvalido("ZIP inválido")
            for info in z.infolist():
                base = info.filename.split("/")[-1]
                if info.is_dir() or "__MACOSX" in info.filename or not base.lower().endswith(".pdf"):
                    continue
                total += info.file_size
                if info.file_size > MAX_PDF:
                    out.append((base, None, "arquivo maior que 2 MB")); continue
                if total > MAX_ZIP * 2 or len(out) >= MAX_ARQUIVOS:
                    raise PdfInvalido("ZIP com arquivos demais ou grande demais depois de aberto")
                out.append((base, z.read(info), None))
        else:
            out.append((nome, conteudo, None))
        if len(out) > MAX_ARQUIVOS:
            raise PdfInvalido(f"mais de {MAX_ARQUIVOS} arquivos de uma vez")
    return out


def salvar(db: Session, nosso: str, nome: str, conteudo: bytes, linha, vinculo: str, user_id: int, substituir: bool) -> str:
    """Grava/atualiza o PDF do boleto. Devolve 'novo' | 'substituido' | 'ja_existe'."""
    sha = hashlib.sha256(conteudo).hexdigest()
    ex = db.execute(_t("SELECT id, sha256 FROM cobranca_boletos_itau WHERE nosso_numero = :n"), {"n": nosso}).fetchone()
    if ex and not substituir:
        return "ja_existe"
    if ex:
        db.execute(_t("""UPDATE cobranca_boletos_itau SET arquivo_nome=:a, tamanho=:t, sha256=:s, linha_digitavel=:l, pdf=:p, vinculo=:v,
                          enviado_por=:u, enviado_em=now() WHERE nosso_numero=:n"""),
                   {"a": (nome or "")[:255], "t": len(conteudo), "s": sha, "l": linha, "p": conteudo, "v": vinculo, "u": user_id, "n": nosso})
        res = "substituido"
    else:
        db.execute(_t("""INSERT INTO cobranca_boletos_itau (nosso_numero, arquivo_nome, tamanho, sha256, linha_digitavel, pdf, vinculo, enviado_por)
                          VALUES (:n, :a, :t, :s, :l, :p, :v, :u)"""),
                   {"a": (nome or "")[:255], "t": len(conteudo), "s": sha, "l": linha, "p": conteudo, "v": vinculo, "u": user_id, "n": nosso})
        res = "novo"
    # itens de e-mail que esperavam este boleto voltam para a fila de aprovação
    db.execute(_t("""UPDATE cobranca_envios SET status='pendente', erro=NULL
                      WHERE origem='itau' AND canal='email' AND status='sem_boleto' AND boleto_ref LIKE :r"""), {"r": f"itau:{nosso}:%"})
    return res
