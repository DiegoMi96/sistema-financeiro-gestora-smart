/**
 * ============================================================
 *  GESTORA SMART — Apps Script · Aba "Saidas_2026"
 *  Versão: 1.0 — Layout Profissional
 *  Gerado em: Maio/2026
 *
 *  Estrutura compatível com o parser do sistema:
 *    Col A  = Categoria   (preenchida só nas linhas de grupo)
 *    Col B  = Subcategoria (preenchida só nas linhas de item)
 *    Col C–N = Jan–Dez   (row.slice(2,14))
 *    Col O  = Total acum  (ignorada pelo parser)
 *    Col P  = Unidade     (ignorada pelo parser)
 *
 *  Regra do parser:
 *    - Linha com só Col A preenchida → cabeçalho de grupo
 *    - Linha com Col B preenchida   → subcategoria com valores
 * ============================================================
 */

function criarAbaSaidas2026() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const nome = 'Saidas_2026';

  const existente = ss.getSheetByName(nome);
  if (existente) ss.deleteSheet(existente);
  const sh = ss.insertSheet(nome);

  // -- Paleta --------------------------------------------------
  const COR = {
    tituloBg:   '#1A1A2E',
    hdrBg:      '#2D3748',
    hdrFg:      '#FFFFFF',
    // Grupos (categorias)
    grpReceita: '#1A5276',
    grpCMV:     '#6E2F0F',
    grpDespAdm: '#4A235A',
    grpPessoal: '#145A32',
    grpRH:      '#1A6B45',   // Centro de custo RH (tom distinto do Pessoal)
    grpComerc:  '#7D6608',
    grpTribut:  '#512E5F',
    grpRFinanc: '#154360',   // R - Atividades Financeiras (receita financeira)
    grpFinanc:  '#1B4F72',  // D - Atividades Financeiras (despesa financeira)
    grpSMT:     '#0B5345',
    grpTotal:   '#212F3C',
    grpFg:      '#FFFFFF',
    // Subcategorias (alternado)
    subA:       '#EBF5FB',
    subB:       '#FDFEFE',
    subFg:      '#1A252F',
    inputFg:    '#0000FF',
    totalBg:    '#D6EAF8',
    totalFg:    '#1A5276',
    borda:      '#AEB6BF',
    separador:  '#D5D8DC',
  };

  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  /**
   * ESTRUTURA DE GRUPOS
   * Cada grupo: { cat, cor, subs: ['nome subcategoria', ...] }
   */
  const GRUPOS = [
    {
      cat: 'Total de RECEITA - SS',
      cor: COR.grpReceita,
      subs: [
        'Conectividade M2M',
        'Conectividade Cheque',
        'Equipamentos',
        'Software',
        'Outros (SMS, Aportes, Apto etc..)',
        'Rendimento (CDI)',
      ]
    },
    {
      cat: 'Total de RECEITA - SMT',
      cor: COR.grpReceita,
      subs: [
        'Brasil',
        'Mundo',
        'Outros',
      ]
    },
    {
      cat: 'CMV / CPS',
      cor: COR.grpCMV,
      subs: [
        'Conectividade M2M',
        'Conectividade Cheque',
        'Equipamentos',
        'Software',
        'Outros (SMS, Aportes, Apto etc..)',
      ]
    },
    {
      cat: 'Despesas Administrativa',
      cor: COR.grpDespAdm,
      subs: [
        'Contabilidade',
        'Aluguel',
        'Telefonica e Internet',
        'Energia Elétrica',
        'Escritório',
        'Informatica',
        'Despesa com Logistica',
      ]
    },
    {
      cat: 'Despesas com pessoal',
      cor: COR.grpPessoal,
      subs: [
        'Folha de pagamento',
        'Beneficios',
        'Impostos folha de pagamento',
        'Pró-labore',
        'Retirada dos Sócios',
        'Comissão',
        'Diretoria',
        'Rescisão',
      ]
    },
    {
      cat: 'RH',
      cor: COR.grpRH,
      subs: [
        'RH',
        'Eventos',
        'Cursos e Treinamentos',
        'Gratificações',
      ]
    },
    {
      cat: 'Despesa Comercial',
      cor: COR.grpComerc,
      subs: [
        'Viagens e Representações',
        'Alimentação',
        'Transporte',
        'Outros ( Brindes...)',
      ]
    },
    {
      cat: 'Despesa Tributaria',
      cor: COR.grpTribut,
      subs: [
        'COFINS',
        'PIS',
        'GNRE',
        'CSLL e IRPJ',
        'ICMS',
        'Outros impostos',
      ]
    },
    {
      cat: 'R - Atividades Financeiras',
      cor: COR.grpRFinanc,
      subs: [
        'Rendimento de Investimentos',
        'Juros Recebidos',
        'Estorno Recebido',
        'Outras Receitas Financeiras',
      ]
    },
    {
      cat: 'D - Atividades Financeiras',
      cor: COR.grpFinanc,
      subs: [
        'Empréstimos PGTO',
        'Empréstimos',
        'Tarifa Bancaria',
        'Investimentos',
        'Investimento Externo',
        'Estorno',
        'Emprestimo entre contas',
      ]
    },
    {
      cat: 'Custo SMT',
      cor: COR.grpSMT,
      subs: [
        'SMT - CSP',
        'SMT - CSP (Mundo)',
        'SMT - Folha de Pagamento',
        'SMT - Imposto Sobre Folha',
        'SMT - Aluguel',
        'SMT - Tributação',
        'SMT -  Despesas Administrativas',
        'SMT - Investimento',
        'SMT - Empréstimo',
      ]
    },
    {
      cat: 'Custo Total',
      cor: COR.grpTotal,
      subs: []   // linha de total calculada pelo sistema
    },
  ];

  // -- Dimensões -----------------------------------------------
  const COL = { cat:1, sub:2, jan:3, dez:14, total:15, un:16 };
  const TOTAL_COLS = 16;

  sh.setColumnWidth(COL.cat,   220);
  sh.setColumnWidth(COL.sub,   270);
  for (let m = 0; m < 12; m++) sh.setColumnWidth(COL.jan + m, 92);
  sh.setColumnWidth(COL.total, 105);
  sh.setColumnWidth(COL.un,     50);

  // -- Linha 1: título -----------------------------------------
  sh.setRowHeight(1, 34);
  sh.getRange(1, 1, 1, TOTAL_COLS)
    .merge()
    .setValue('GESTORA SMART  ·  SAÍDAS DETALHADAS 2026')
    .setBackground(COR.tituloBg)
    .setFontColor('#FFFFFF')
    .setFontSize(13)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // -- Linha 2: cabeçalho de colunas ---------------------------
  sh.setRowHeight(2, 26);
  const hdr = [['Categoria', 'Subcategoria'].concat(MESES).concat(['Total', 'Un.'])];
  sh.getRange(2, 1, 1, TOTAL_COLS).setValues(hdr);
  const rHdr = sh.getRange(2, 1, 1, TOTAL_COLS);
  rHdr.setBackground(COR.hdrBg)
      .setFontColor(COR.hdrFg)
      .setFontWeight('bold')
      .setFontSize(9)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  sh.getRange(2, 1).setHorizontalAlignment('left');
  sh.getRange(2, 2).setHorizontalAlignment('left');

  sh.setFrozenRows(2);

  // -- Preencher grupos e subcategorias ------------------------
  let row = 3;
  let subCount = 0;

  GRUPOS.forEach(grupo => {
    // ── Linha de GRUPO (só col A preenchida) ──────────────────
    sh.setRowHeight(row, 22);
    const rGrp = sh.getRange(row, 1, 1, TOTAL_COLS);
    rGrp.setBackground(grupo.cor)
        .setFontColor(COR.grpFg)
        .setFontWeight('bold')
        .setFontSize(9)
        .setVerticalAlignment('middle');

    sh.getRange(row, COL.cat)
      .setValue(grupo.cat)
      .setHorizontalAlignment('left');

    // Células em branco (B-N) dentro da linha de grupo
    sh.getRange(row, COL.sub, 1, TOTAL_COLS - 1).setValue('');

    // Total do grupo (soma das subcats)
    if (grupo.subs.length > 0) {
      // será calculado depois que soubermos os intervalos
    }

    const grpRow = row;
    row++;

    // ── Subcategorias ─────────────────────────────────────────
    const subRows = [];
    grupo.subs.forEach((subNome, si) => {
      sh.setRowHeight(row, 21);
      const bg = si % 2 === 0 ? COR.subA : COR.subB;

      // Col A: vazia (parser interpreta como subcategoria)
      sh.getRange(row, COL.cat)
        .setValue('')
        .setBackground(bg);

      // Col B: nome da subcategoria
      sh.getRange(row, COL.sub)
        .setValue(subNome)
        .setBackground(bg)
        .setFontColor(COR.subFg)
        .setFontSize(9)
        .setFontWeight('bold')
        .setHorizontalAlignment('left')
        .setVerticalAlignment('middle');

      // Col C-N: input
      for (let m = 0; m < 12; m++) {
        const cell = sh.getRange(row, COL.jan + m);
        cell.setValue('')
            .setFontColor(COR.inputFg)
            .setBackground(bg)
            .setNumberFormat('#,##0.00')
            .setHorizontalAlignment('right')
            .setVerticalAlignment('middle')
            .setFontSize(9);
      }

      // Col O: soma do ano desta subcategoria
      const startC = colLetra(COL.jan);
      const endC   = colLetra(COL.dez);
      sh.getRange(row, COL.total)
        .setFormula(`=IFERROR(SUM(${startC}${row}:${endC}${row}),"")`)
        .setBackground(COR.totalBg)
        .setFontColor(COR.totalFg)
        .setFontWeight('bold')
        .setFontSize(9)
        .setNumberFormat('#,##0.00')
        .setHorizontalAlignment('right')
        .setVerticalAlignment('middle');

      // Col P: unidade
      sh.getRange(row, COL.un)
        .setValue('R$')
        .setBackground(bg)
        .setFontColor('#718096')
        .setFontSize(8)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');

      // Borda inferior
      sh.getRange(row, 1, 1, TOTAL_COLS).setBorder(
        false, false, true, false, false, false,
        COR.borda, SpreadsheetApp.BorderStyle.SOLID
      );

      subRows.push(row);
      subCount++;
      row++;
    });

    // ── Total do grupo na linha de cabeçalho ──────────────────
    if (subRows.length > 0) {
      for (let m = 0; m < 12; m++) {
        const cl = colLetra(COL.jan + m);
        const refs = subRows.map(r => `${cl}${r}`).join('+');
        sh.getRange(grpRow, COL.jan + m)
          .setFormula(`=${refs}`)
          .setFontColor(COR.grpFg)
          .setFontWeight('bold')
          .setBackground(grupo.cor)
          .setNumberFormat('#,##0.00')
          .setHorizontalAlignment('right')
          .setVerticalAlignment('middle')
          .setFontSize(9);
      }
      // Total do grupo
      const startC = colLetra(COL.jan);
      const endC   = colLetra(COL.dez);
      sh.getRange(grpRow, COL.total)
        .setFormula(`=IFERROR(SUM(${startC}${grpRow}:${endC}${grpRow}),"")`)
        .setBackground(grupo.cor)
        .setFontColor(COR.grpFg)
        .setFontWeight('bold')
        .setFontSize(9)
        .setNumberFormat('#,##0.00')
        .setHorizontalAlignment('right')
        .setVerticalAlignment('middle');

      sh.getRange(grpRow, COL.un)
        .setValue('R$')
        .setBackground(grupo.cor)
        .setFontColor(COR.grpFg)
        .setFontSize(8)
        .setHorizontalAlignment('center');
    }

    // Separador entre grupos
    sh.setRowHeight(row, 5);
    sh.getRange(row, 1, 1, TOTAL_COLS).setBackground(COR.separador);
    row++;
  });

  // -- Borda externa -------------------------------------------
  sh.getRange(2, 1, row - 2, TOTAL_COLS).setBorder(
    true, true, true, true, false, false,
    '#5D6D7E', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  // -- Legenda -------------------------------------------------
  sh.setRowHeight(row, 18);
  sh.getRange(row, 1, 1, TOTAL_COLS)
    .merge()
    .setValue('Azul = input manual  ·  Preto = fórmula automática  ·  Linha de grupo = soma automática das subcategorias')
    .setBackground('#F2F3F4')
    .setFontColor('#5D6D7E')
    .setFontSize(8)
    .setFontStyle('italic')
    .setHorizontalAlignment('center');

  SpreadsheetApp.getUi().alert(
    `✅  Aba "${nome}" criada com sucesso!\n\n` +
    `• ${GRUPOS.length} grupos configurados\n` +
    `• ${subCount} subcategorias\n` +
    `• Totais dos grupos calculados automaticamente\n` +
    `• Linhas 1-2 congeladas\n\n` +
    `Preencha os valores em azul mês a mês.`
  );
}

function colLetra(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
