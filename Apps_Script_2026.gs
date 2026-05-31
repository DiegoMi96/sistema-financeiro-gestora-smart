/**
 * ============================================================
 *  GESTORA SMART — Apps Script · Aba "2026"
 *  Versão: 2.1 — Layout Profissional
 *  Gerado em: Maio/2026
 *
 *  Estrutura compatível com o parser do sistema:
 *    Col A  = Chave (lida pelo JS)
 *    Col B  = Descrição (ignorada pelo parser)
 *    Col C–N = Jan–Dez (slice(2,14) → índices 0–11)
 *    Col O  = Total / Acumulado (ignorada pelo parser)
 *    Col P  = Unidade (ignorada pelo parser)
 * ============================================================
 *
 *  Como usar:
 *  1. Abra o Google Sheets (planilha do sistema)
 *  2. Extensões → Apps Script → cole este código
 *  3. Selecione "criarAba2026" e clique ▶ Executar
 *  4. Autorize as permissões na primeira execução
 *
 *  ⚠️  A função APAGA e recria a aba "2026" do zero.
 *      Faça um backup antes, se necessário.
 * ============================================================
 */

function criarAba2026() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const nome = '2026';

  // -- Remove aba existente e recria ----------------------------
  const existente = ss.getSheetByName(nome);
  if (existente) ss.deleteSheet(existente);
  const sh = ss.insertSheet(nome, 0);

  // -- Paleta de cores ------------------------------------------
  const COR = {
    tituloBg:    '#1A1A2E',
    secaoFin:    '#1B4F72',
    secaoCaixa:  '#0F3460',
    secaoBase:   '#145A32',
    secaoComercial: '#6E2F0F',
    secaoSat:    '#4A235A',
    secaoLog:    '#1A5276',
    hdrBg:       '#2D3748',
    hdrFg:       '#FFFFFF',
    labelBg:     '#EBF5FB',
    labelFg:     '#1A252F',
    inputBg:     '#FFFFFF',
    inputFg:     '#0000FF',   // Azul: valores manuais
    formulaBg:   '#F4F6F7',
    formulaFg:   '#000000',   // Preto: fórmulas
    totalBg:     '#D6EAF8',
    totalFg:     '#1A5276',
    chaveFg:     '#7F8C8D',
    separadorBg: '#D5D8DC',
    borda:       '#AEB6BF',
  };

  // -- Meses -----------------------------------------------------
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  /**
   * LAYOUT DA ABA
   * tipo: 'secao' | 'dado' | 'formula' | 'separador'
   * Para tipo 'dado'/'formula':
   *   chave    — chave lida pelo parser JS (col A)
   *   descricao — texto legível (col B)
   *   unidade  — 'R$' | 'Qtd' | '%'
   *   nota     — comment na célula de descrição
   *   totalFn  — 'soma' (padrão) | 'media' | 'ultimo'
   */
  const LAYOUT = [

    // ── FINANCEIRO ──────────────────────────────────────────
    { tipo:'secao', descricao:'RESULTADO FINANCEIRO', cor: COR.secaoFin },
    { tipo:'dado',  chave:'Receita',     descricao:'Receita Bruta',
      unidade:'R$', totalFn:'soma' },
    { tipo:'dado',  chave:'CMV',         descricao:'Custo dos Serviços (CMV)',
      unidade:'R$', totalFn:'soma' },
    { tipo:'dado',  chave:'Despesas',    descricao:'Despesas Operacionais',
      unidade:'R$', totalFn:'soma' },
    { tipo:'formula', chave:'Resultado', descricao:'Resultado Líquido',
      unidade:'R$', totalFn:'soma',
      nota:'Fórmula: Receita − CMV − Despesas. Pode sobrescrever se necessário.' },
    { tipo:'dado',  chave:'Margem_PCT',  descricao:'Margem Líquida (%)',
      unidade:'%', totalFn:'media',
      nota:'Insira decimal: 0,125 = 12,5%' },
    { tipo:'dado',  chave:'Margem_BRL',  descricao:'Margem Líquida (R$)',
      unidade:'R$', totalFn:'soma' },

    // ── POSIÇÃO DE CAIXA ──────────────────────────────────────
    { tipo:'separador' },
    { tipo:'secao', descricao:'POSIÇÃO DE CAIXA', cor: COR.secaoCaixa },
    { tipo:'dado',  chave:'Caixa_Ini',   descricao:'Caixa Inicial do Mês',
      unidade:'R$', totalFn:'ultimo',
      nota:'Saldo de caixa no início de cada mês' },
    { tipo:'dado',  chave:'Caixa_Fim',   descricao:'Caixa Final do Mês',
      unidade:'R$', totalFn:'ultimo' },
    { tipo:'dado',  chave:'Tesouro',        descricao:'Aplicações Financeiras / Tesouro',
      unidade:'R$', totalFn:'soma' },
    { tipo:'dado',  chave:'Cofre_Principal', descricao:'Cofre Principal (R$)',
      unidade:'R$', totalFn:'soma' },
    { tipo:'dado',  chave:'Cofre_2',         descricao:'Cofre Secundário (R$)',
      unidade:'R$', totalFn:'soma' },
    { tipo:'dado',  chave:'Saldo_Acum',  descricao:'Saldo Acumulado no Ano',
      unidade:'R$', totalFn:'ultimo' },
    { tipo:'dado',  chave:'Inadimpl',    descricao:'Inadimplências a Recuperar',
      unidade:'R$', totalFn:'soma' },

    // ── BASE DE CLIENTES ──────────────────────────────────────
    { tipo:'separador' },
    { tipo:'secao', descricao:'BASE DE CLIENTES', cor: COR.secaoBase },
    { tipo:'dado',  chave:'Base_Ativa',  descricao:'Base Ativa (Simcards faturantes)',
      unidade:'Qtd', totalFn:'ultimo' },
    { tipo:'dado',  chave:'Base_Pre',    descricao:'Base Pré-Ativa (aguardando ativação)',
      unidade:'Qtd', totalFn:'ultimo',
      nota:'Preencha com o total de chips pré-ativos no final do mês' },
    { tipo:'dado',  chave:'Base_SW',     descricao:'Base Software (licenças ativas)',
      unidade:'Qtd', totalFn:'ultimo' },

    // ── COMERCIAL / VENDAS ────────────────────────────────────
    { tipo:'separador' },
    { tipo:'secao', descricao:'COMERCIAL / VENDAS', cor: COR.secaoComercial },
    { tipo:'dado',  chave:'Vendas_SIM',  descricao:'Vendas de SIMs no Mês',
      unidade:'Qtd', totalFn:'soma' },
    { tipo:'dado',  chave:'Novos_CLI',   descricao:'Novos Clientes no Mês',
      unidade:'Qtd', totalFn:'soma' },
    { tipo:'dado',  chave:'Cancelam',    descricao:'Cancelamentos no Mês',
      unidade:'Qtd', totalFn:'soma' },
    { tipo:'dado',  chave:'Desistencia', descricao:'Desistências (Pré-Ativação)',
      unidade:'Qtd', totalFn:'soma' },
    { tipo:'dado',  chave:'Atv_Qtd',     descricao:'Ativações Previstas (meses futuros)',
      unidade:'Qtd', totalFn:'soma',
      nota:'Preencha os meses futuros para exibir "Próximas Ativações" no painel do sistema' },

    // ── SATISFAÇÃO / NPS ──────────────────────────────────────
    { tipo:'separador' },
    { tipo:'secao', descricao:'SATISFAÇÃO / eNPS', cor: COR.secaoSat },
    { tipo:'dado',  chave:'Satisfacao',  descricao:'Índice de Satisfação (eNPS)',
      unidade:'%', totalFn:'media',
      nota:'Insira decimal: 0,85 = 85%. Sistema converte automaticamente.' },

    // ── LOGÍSTICA ─────────────────────────────────────────────
    { tipo:'separador' },
    { tipo:'secao', descricao:'LOGÍSTICA', cor: COR.secaoLog },
    { tipo:'dado',  chave:'Vol_Envio',   descricao:'Volume de Envios no Mês',
      unidade:'Qtd', totalFn:'soma' },
    { tipo:'dado',  chave:'Custo_Envio', descricao:'Custo Total de Envios (R$)',
      unidade:'R$', totalFn:'soma' },

  ];

  // ===========================================================
  //  DIMENSÕES
  //  Col A=1(Chave), B=2(Desc), C-N=3-14(Meses), O=15(Total), P=16(Un.)
  // ===========================================================
  const COL = { chave:1, desc:2, jan:3, dez:14, total:15, un:16 };
  const TOTAL_COLS = 16;

  sh.setColumnWidth(COL.chave, 150);
  sh.setColumnWidth(COL.desc,  300);
  for (let m = 0; m < 12; m++) sh.setColumnWidth(COL.jan + m, 95);
  sh.setColumnWidth(COL.total, 105);
  sh.setColumnWidth(COL.un,     55);

  // -- Linha 1: Cabeçalho principal -----------------------------
  sh.setRowHeight(1, 34);
  const rTitulo = sh.getRange(1, 1, 1, TOTAL_COLS);
  rTitulo.merge();
  rTitulo.setValue('GESTORA SMART  ·  INDICADORES MENSAIS 2026');
  rTitulo.setBackground(COR.tituloBg);
  rTitulo.setFontColor('#FFFFFF');
  rTitulo.setFontSize(13);
  rTitulo.setFontWeight('bold');
  rTitulo.setHorizontalAlignment('center');
  rTitulo.setVerticalAlignment('middle');

  // -- Linha 2: Cabeçalho de colunas ---------------------------
  sh.setRowHeight(2, 26);
  const hdrVals = [['Chave (sistema)', 'Descrição / Indicador']
    .concat(MESES)
    .concat(['Total / Acum', 'Un.'])];
  sh.getRange(2, 1, 1, TOTAL_COLS).setValues(hdrVals);
  const rHdr = sh.getRange(2, 1, 1, TOTAL_COLS);
  rHdr.setBackground(COR.hdrBg);
  rHdr.setFontColor(COR.hdrFg);
  rHdr.setFontWeight('bold');
  rHdr.setFontSize(9);
  rHdr.setHorizontalAlignment('center');
  rHdr.setVerticalAlignment('middle');
  sh.getRange(2, 1).setHorizontalAlignment('left');
  sh.getRange(2, 2).setHorizontalAlignment('left');

  // -- Congelar linhas de cabeçalho ----------------------------
  // Nota: setFrozenColumns não pode ser usado junto com células mescladas
  // que cruzam o limite de congelamento (título e seções mesclam A:P).
  sh.setFrozenRows(2);

  // -- Preencher linhas de dados --------------------------------
  let row = 3;
  const dadosMap = {};  // chave → número da linha

  LAYOUT.forEach(item => {

    if (item.tipo === 'separador') {
      sh.setRowHeight(row, 6);
      sh.getRange(row, 1, 1, TOTAL_COLS).setBackground(COR.separadorBg);
      row++;
      return;
    }

    if (item.tipo === 'secao') {
      sh.setRowHeight(row, 22);
      const rSec = sh.getRange(row, 1, 1, TOTAL_COLS);
      rSec.merge();
      rSec.setValue('  ▸  ' + item.descricao);
      rSec.setBackground(item.cor);
      rSec.setFontColor('#FFFFFF');
      rSec.setFontWeight('bold');
      rSec.setFontSize(9);
      rSec.setHorizontalAlignment('left');
      rSec.setVerticalAlignment('middle');
      row++;
      return;
    }

    // -- Linha de dado ou fórmula --------------------------------
    sh.setRowHeight(row, 21);
    const isFin  = item.unidade === 'R$';
    const isPct  = item.unidade === '%';

    // Col A: Chave
    const rA = sh.getRange(row, COL.chave);
    rA.setValue(item.chave || '');
    rA.setBackground(COR.labelBg);
    rA.setFontColor(COR.chaveFg);
    rA.setFontSize(8);
    rA.setFontStyle('italic');
    rA.setHorizontalAlignment('left');
    rA.setVerticalAlignment('middle');

    // Col B: Descrição
    const rB = sh.getRange(row, COL.desc);
    rB.setValue(item.descricao || '');
    rB.setBackground(COR.labelBg);
    rB.setFontColor(COR.labelFg);
    rB.setFontSize(9);
    rB.setFontWeight('bold');
    rB.setHorizontalAlignment('left');
    rB.setVerticalAlignment('middle');
    if (item.nota) rB.setNote(item.nota);

    // Col C–N: Jan–Dez
    for (let m = 0; m < 12; m++) {
      const col  = COL.jan + m;
      const cell = sh.getRange(row, col);

      const isFormula = item.tipo === 'formula'
        && item.chave === 'Resultado'
        && dadosMap['Receita'] && dadosMap['CMV'] && dadosMap['Despesas'];

      if (isFormula) {
        const cl = colLetra(col);
        cell.setFormula(
          `=${cl}${dadosMap['Receita']}-${cl}${dadosMap['CMV']}-${cl}${dadosMap['Despesas']}`
        );
        cell.setFontColor(COR.formulaFg);
        cell.setBackground(COR.formulaBg);
      } else {
        cell.setValue('');
        cell.setFontColor(COR.inputFg);
        cell.setBackground(COR.inputBg);
      }

      cell.setNumberFormat(isPct ? '0.00%' : isFin ? '#,##0.00' : '#,##0');
      cell.setHorizontalAlignment('right');
      cell.setVerticalAlignment('middle');
      cell.setFontSize(9);
    }

    // Col O: Total / Acumulado
    const rO = sh.getRange(row, COL.total);
    const startC = colLetra(COL.jan);
    const endC   = colLetra(COL.dez);
    const range  = `${startC}${row}:${endC}${row}`;
    const fn     = item.totalFn || 'soma';
    if (fn === 'media') {
      rO.setFormula(`=IFERROR(AVERAGEIF(${range},"<>0"),"")`);
      rO.setNote('Média dos meses preenchidos');
    } else if (fn === 'ultimo') {
      // Último valor não-vazio
      rO.setFormula(`=IFERROR(INDEX(${range},MATCH(9.99E+307,${range})),"")`);
      rO.setNote('Último valor registrado');
    } else {
      rO.setFormula(`=IFERROR(SUM(${range}),"")`);
      rO.setNote('Soma acumulada do ano');
    }
    rO.setBackground(COR.totalBg);
    rO.setFontColor(COR.totalFg);
    rO.setFontWeight('bold');
    rO.setFontSize(9);
    rO.setHorizontalAlignment('right');
    rO.setVerticalAlignment('middle');
    rO.setNumberFormat(isPct ? '0.00%' : isFin ? '#,##0.00' : '#,##0');

    // Col P: Unidade
    const rP = sh.getRange(row, COL.un);
    rP.setValue(item.unidade || '');
    rP.setBackground(COR.labelBg);
    rP.setFontColor('#718096');
    rP.setFontSize(8);
    rP.setHorizontalAlignment('center');
    rP.setVerticalAlignment('middle');

    // Borda inferior
    sh.getRange(row, 1, 1, TOTAL_COLS).setBorder(
      false, false, true, false, false, false,
      COR.borda, SpreadsheetApp.BorderStyle.SOLID
    );

    dadosMap[item.chave] = row;
    row++;
  });

  // -- Borda externa da tabela ----------------------------------
  sh.getRange(2, 1, row - 2, TOTAL_COLS).setBorder(
    true, true, true, true, false, false,
    '#5D6D7E', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  // -- Linha de legenda -----------------------------------------
  sh.setRowHeight(row, 18);
  sh.getRange(row, 1, 1, TOTAL_COLS)
    .merge()
    .setValue('Azul = input manual   ·   Preto = fórmula automática   ·   Coluna "Total/Acum" calculada automaticamente')
    .setBackground('#F2F3F4')
    .setFontColor('#5D6D7E')
    .setFontSize(8)
    .setFontStyle('italic')
    .setHorizontalAlignment('center');

  // -- Proteger colunas A e B contra edição acidental ----------
  try {
    const prot = sh.getRange(1, 1, row + 1, 2).protect();
    prot.setDescription('Rótulos — não editar diretamente');
    prot.setWarningOnly(true);
  } catch(e) { /* ignora se sem permissão */ }

  // -- Resumo --------------------------------------------------
  const campos = Object.keys(dadosMap).length;
  SpreadsheetApp.getUi().alert(
    `✅  Aba "${nome}" criada com sucesso!\n\n` +
    `• ${campos} indicadores configurados\n` +
    `• Estrutura compatível com o parser do sistema\n` +
    `• Colunas A e B protegidas (somente aviso)\n` +
    `• Linhas 1-2 congeladas\n\n` +
    `Preencha os valores em azul mês a mês.\n` +
    `O sistema lerá automaticamente ao clicar em Sincronizar.`
  );
}

// -- Adiciona linhas de Cofre sem recriar a aba ----------------
// Execute esta função UMA VEZ para inserir as linhas Cofre_Principal e Cofre_2
// logo abaixo da linha "Tesouro" sem apagar nenhum dado existente.
function adicionarLinhasCofre() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Dados_2026');
  if (!sh) { SpreadsheetApp.getUi().alert('Aba Dados_2026 não encontrada.'); return; }

  const lastRow = sh.getLastRow();
  const colA    = sh.getRange(1, 1, lastRow, 1).getValues().flat();

  // Verifica se já existem
  if (colA.includes('Cofre_Principal')) {
    SpreadsheetApp.getUi().alert('As linhas Cofre_Principal e Cofre_2 já existem na planilha.');
    return;
  }

  // Encontra a linha do Tesouro
  const rowTesouro = colA.findIndex(v => v === 'Tesouro') + 1; // 1-based
  if (!rowTesouro) { SpreadsheetApp.getUi().alert('Linha "Tesouro" não encontrada.'); return; }

  const TOTAL_COLS = 16;
  const COR_CHAVE = '#7F8C8D';
  const COR_INPUT = '#1A5276';
  const COR_BG    = '#0F3460';

  // Insere 2 linhas abaixo de Tesouro
  sh.insertRowsAfter(rowTesouro, 2);
  const novas = [
    { linha: rowTesouro + 1, chave: 'Cofre_Principal', desc: 'Cofre Principal (R$)' },
    { linha: rowTesouro + 2, chave: 'Cofre_2',         desc: 'Cofre Secundário (R$)' }
  ];

  novas.forEach(({ linha, chave, desc }) => {
    const rA = sh.getRange(linha, 1);
    rA.setValue(chave).setFontColor(COR_CHAVE).setFontSize(9).setFontWeight('normal');

    const rB = sh.getRange(linha, 2);
    rB.setValue(desc).setFontSize(9).setFontWeight('normal');

    // Colunas de Jan (3) a Dez (14) — células de input em azul
    for (let c = 3; c <= 14; c++) {
      const cell = sh.getRange(linha, c);
      cell.setNumberFormat('R$ #,##0.00')
          .setBackground('#EBF5FB')
          .setFontColor(COR_INPUT)
          .setFontWeight('bold')
          .setHorizontalAlignment('right');
    }
  });

  SpreadsheetApp.getUi().alert('✅ Linhas Cofre_Principal e Cofre_2 adicionadas com sucesso!\nPreencha os valores mensais nas colunas azuis.');
}

// -- Utilitário: número → letra(s) de coluna ------------------
function colLetra(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
