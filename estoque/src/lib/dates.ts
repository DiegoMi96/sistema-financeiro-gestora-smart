// Datas no export vêm ora como objeto Date (o SheetJS as constrói em UTC-meia-noite),
// ora como texto "dd/mm/yyyy". Para não sofrer deslocamento de fuso horário (Brasil é
// UTC-3), toda data-sem-hora é normalizada e comparada usando os componentes UTC —
// nunca os getters locais (getDate/getMonth/...), que reintroduziriam o deslocamento.

function utcMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

export function parseFlexibleDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return utcMidnight(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  if (typeof value === "number") {
    // Serial de data do Excel (dias desde 1899-12-30)
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86400000);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (brMatch) {
      const [, d, m, y] = brMatch;
      return utcMidnight(Number(y), Number(m) - 1, Number(d));
    }

    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return utcMidnight(Number(y), Number(m) - 1, Number(d));
    }

    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return null;
    return utcMidnight(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }

  return null;
}

// Algumas planilhas do Google Sheets exportam data em formato americano
// (M/D/AAAA) em vez de brasileiro — depende da configuração de local do
// documento, não tem como adivinhar por valor isolado. Confirmamos o formato
// desta fonte específica (Controle de Saída) cruzando com as colunas
// auxiliares DIA/MÊS/ANO da própria planilha.
export function parseDataAmericana(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [, m, d, y] = match;
      return utcMidnight(Number(y), Number(m) - 1, Number(d));
    }
  }

  return parseFlexibleDate(value);
}

// "Hoje" a partir do relógio local do servidor, representado como meia-noite UTC
// (mesma convenção usada para as datas de lote).
export function hojeLocal(): Date {
  const agora = new Date();
  return utcMidnight(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 86400000;
  const fromUTC = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUTC = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toUTC - fromUTC) / msPerDay);
}

// Soma meses a uma data ISO (yyyy-mm-dd), preservando o dia quando possível
// e ajustando pro último dia do mês de destino quando ele for mais curto
// (ex.: 31/01 + 1 mês = 28 ou 29/02, nunca "estoura" pro mês seguinte).
export function adicionarMeses(dataISO: string, meses: number): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const totalMeses = (m - 1) + meses;
  const anoDestino = y + Math.floor(totalMeses / 12);
  const mesDestino = ((totalMeses % 12) + 12) % 12; // 0-indexed, sempre positivo
  const ultimoDia = new Date(Date.UTC(anoDestino, mesDestino + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return toISODate(utcMidnight(anoDestino, mesDestino, dia));
}
