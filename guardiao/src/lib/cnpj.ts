// Planilhas e formulários digitam/exportam CNPJ/CPF com pontuação diferente
// (com ou sem "." "/" "-"). Sem normalizar antes de gravar/comparar, o mesmo
// documento em formatos diferentes vira "registros diferentes" (falha em
// buscas, em ON CONFLICT, e no cruzamento entre planilha de clientes e
// planilha de consumo).
export function normalizeCnpj(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "")
}
