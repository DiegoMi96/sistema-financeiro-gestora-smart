// Tipos centrais do domínio de controle de estoque (chips SMART/SMT + pedidos)

// Armazenamos só o essencial; "diasRestantes" é calculado na hora de exibir
// (a contagem precisa refletir o dia em que a tela é aberta, não o dia do upload).
export type LoteInfo = {
  data: string; // ISO yyyy-mm-dd
  quantidade: number;
  prazoDias: number; // 60 / 90 (pré-ativação) ou 120 (suspensão)
};

export type LoteComDias = LoteInfo & {
  diasRestantes: number;
};

export type OperadoraEstoque = {
  operadora: string; // rótulo dinâmico, vem direto de "Operadora específica"
  ativos: {
    total: number;
    aguardandoSuspensao: number; // subconjunto dos ativos com suspensão agendada p/ o futuro
  };
  preAtivos: {
    total: number;
    lotes: LoteInfo[];
  };
  suspensos: {
    total: number;
    lotes: LoteInfo[];
  };
  totalGeral: number;
};

export type TipoEstoque = "SMART" | "SMT";

export type BucketEstoque = "ATIVO" | "PRE_ATIVO" | "SUSPENSO";

// Uma linha (chip) individual — guardada pra permitir exportar exatamente
// quais chips compõem um lote (ex.: "TIM, suspensos, faltam 34 dias").
export type LinhaEstoque = {
  operadora: string;
  bucket: BucketEstoque;
  aguardandoSuspensao: boolean;
  loteData: string; // ISO yyyy-mm-dd, "SEM_DATA" ou "" (ativos sem lote)
  prazoDias: number;
  msisdn: string;
  iccid: string;
  cliente: string;
  apelido: string;
};

export type EstoqueSnapshot = {
  tipo: TipoEstoque;
  geradoEm: string; // ISO datetime de quando o arquivo foi importado
  totalLinhas: number;
  operadoras: OperadoraEstoque[];
  linhas: LinhaEstoque[];
};

export type PedidoAgendado = {
  pedidoId: string;
  cliente: string;
  operadora: string; // já mapeado (SMART VIVO -> ALGAR ONE VIVO, etc.)
  quantidade: number;
  dataPedido: string | null; // ISO yyyy-mm-dd — "DataInserção" na origem, único campo de data disponível
};

export type PedidosSnapshot = {
  geradoEm: string;
  totalPedidos: number;
  pendentesPorOperadora: Record<string, number>;
  pedidosAgendados: PedidoAgendado[];
};

export type NovasComprasPorOperadora = Record<string, number>;

// Controle de Saída — uma linha por (pedido, operadora): um pedido com 2
// operadoras vira 2 entradas aqui, cada uma com sua própria quantidade,
// mas compartilhando status/data de saída/cód. rastreio do pedido.
export type MovimentacaoLinha = {
  pedidoId: string;
  cliente: string;
  status: string; // Pendente / Enviado / Retornado / Reenviado / Cancelado (texto livre, replica a origem)
  observacoes: string;
  operadora: string;
  quantidade: number;
  codRastreio: string;
  dataSaida: string | null; // ISO yyyy-mm-dd
};

// Um pedido pode ter várias entradas aqui ao longo do tempo (retornou,
// reenviou, retornou de novo...).
export type RetornoItem = {
  pedidoId: string;
  cliente: string;
  operadoras: string; // "OPERADORA(S)" da origem, texto livre
  quantidade: number;
  dataSaidaOriginal: string | null;
  codRastreioOriginal: string;
  dataRetorno: string | null;
  motivoRetorno: string;
  dataReenvio: string | null;
  novoCodRastreio: string;
  status: string;
  observacoes: string;
};

export type SaidaSnapshot = {
  geradoEm: string;
  totalLinhas: number; // linhas de pedido na Movimentação (antes de explodir por operadora)
  movimentacao: MovimentacaoLinha[];
  retornos: RetornoItem[];
};

// Controle de Cancelamento (backlog) — uma linha por chip com solicitação
// de cancelamento em andamento. "Prazo" já vem pronto na origem (não
// precisa ser reconstruído como no Estoque).
export type CancelamentoLinha = {
  msisdn: string;
  iccid: string;
  operadora: string;
  status: string; // Suspenso / Permanente / outros, dinâmico
  dataSolicitacao: string; // ISO yyyy-mm-dd
  prazo: string; // ISO yyyy-mm-dd — data-limite prevista
  dataAtivacao: string | null; // ISO yyyy-mm-dd — pode faltar em arquivos antigos
  fidelidade: string; // MULTA FIXA / SEM MULTA / MULTA NO VALOR DO CONTRATO / outros
  dataCancelamento: string | null; // ISO yyyy-mm-dd — preenchido quando o cancelamento foi concluído
};

export type CancelamentoLote = {
  prazo: string; // ISO yyyy-mm-dd
  quantidade: number;
};

export type CancelamentoStatusGrupo = {
  status: string;
  total: number;
  lotes: CancelamentoLote[]; // agrupado por Prazo
};

export type OperadoraCancelamento = {
  operadora: string;
  porStatus: CancelamentoStatusGrupo[];
  totalGeral: number;
};

export type CancelamentoSnapshot = {
  geradoEm: string;
  totalLinhas: number; // pendentes — exclui linhas já com Cancelamento concluído
  totalConcluidos: number; // linhas com dataCancelamento preenchido
  operadoras: OperadoraCancelamento[]; // agrupamento considera só pendentes
  linhas: CancelamentoLinha[]; // todas — pendentes e concluídas
};

// Cancelamento e Saída não entram no AppState: são buscados em tempo real
// do Google Sheets a cada carregamento de página (ver lib/googleSheets.ts),
// nunca ficam persistidos localmente.
export type AppState = {
  estoqueSmart: EstoqueSnapshot | null;
  estoqueSmt: EstoqueSnapshot | null;
  pedidos: PedidosSnapshot | null;
  novasCompras: NovasComprasPorOperadora;
};
