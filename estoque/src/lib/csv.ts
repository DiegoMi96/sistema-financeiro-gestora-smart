// Parser CSV mínimo (RFC 4180: aspas, vírgulas e quebras de linha dentro de
// campo). Tudo vira string — de propósito, pra não repetir o problema do
// SheetJS "adivinhando" tipo errado pra ICCID (perde precisão como número)
// e Prazo (converte pra serial de data em vez de manter o texto).
function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // ignorado — a quebra de linha real é tratada no \n
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// Excel BR, ao "Salvar como CSV", usa ";" como separador (porque "," já é o
// separador decimal do locale) — só o "CSV UTF-8 (separado por vírgulas)"
// usa ",". Sem essa detecção, um arquivo assim vira uma única coluna gigante
// e nenhum nome de coluna esperado bate.
export function detectarDelimitador(headerLine: string): "," | ";" {
  const pontoVirgulas = (headerLine.match(/;/g) ?? []).length;
  const virgulas = (headerLine.match(/,/g) ?? []).length;
  return pontoVirgulas > virgulas ? ";" : ",";
}

// Mesmo motivo do Excel BR de cima: "Salvar como CSV" (não a variante UTF-8)
// grava em Windows-1252, não UTF-8 — acentos viram "�" se lido como UTF-8.
// TextDecoder("utf-8", {fatal:true}) rejeita bytes inválidos, então tentamos
// UTF-8 primeiro e só caímos pra Windows-1252 se ele realmente falhar.
export function decodificarTextoPlanilha(bytes: Uint8Array): string {
  const temBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const conteudo = temBom ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(conteudo);
  } catch {
    return new TextDecoder("windows-1252").decode(conteudo);
  }
}

// Parser CSV RFC4180 em formato gerador, parametrizado por delimitador e
// pela lista de colunas necessárias: nunca materializa a planilha inteira em
// memória (nem as dezenas de colunas originais, nem todas as linhas de uma
// vez) — só entrega, uma linha por vez, um objeto só com as colunas pedidas.
// Existe pro caso de arquivos grandes demais para o parser XLSX (ver uso em
// parseEstoque.ts / parsePedidos.ts).
export function* linhasCsvSeletivas(
  text: string,
  colunasNecessarias: readonly string[]
): Generator<Record<string, string>> {
  const fimPrimeiraLinha = text.indexOf("\n");
  const primeiraLinha = text.slice(0, fimPrimeiraLinha === -1 ? text.length : fimPrimeiraLinha);
  const delimitador = detectarDelimitador(primeiraLinha);

  let campos: string[] = [];
  let field = "";
  let inQuotes = false;
  let colunaPorIndice: (string | null)[] | null = null;

  function fecharCampo() {
    campos.push(field);
    field = "";
  }

  function fecharLinha(): Record<string, string> | null {
    fecharCampo();
    const linhaAtual = campos;
    campos = [];
    if (linhaAtual.length === 1 && linhaAtual[0] === "") return null;

    if (!colunaPorIndice) {
      colunaPorIndice = linhaAtual.map((h) => (colunasNecessarias.includes(h) ? h : null));
      return null;
    }

    const row: Record<string, string> = {};
    for (const campo of colunasNecessarias) row[campo] = "";
    colunaPorIndice.forEach((campo, i) => {
      if (campo) row[campo] = linhaAtual[i] ?? "";
    });
    return row;
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === delimitador) fecharCampo();
    else if (char === "\r") {
      // ignorado — a quebra de linha real é tratada no \n
    } else if (char === "\n") {
      const linha = fecharLinha();
      if (linha) yield linha;
    } else field += char;
  }
  if (field.length > 0 || campos.length > 0) {
    const linha = fecharLinha();
    if (linha) yield linha;
  }
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text);
  if (rows.length === 0) return [];

  const headers = rows[0];
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    return obj;
  });
}
