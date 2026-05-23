/**
 * ============================================================
 *  GESTORA SMART — Apps Script · Aba "Previsao_2026"
 *  Versão: 1.0
 *  Gerado em: Maio/2026
 *
 *  Estrutura idêntica à Saidas_2026 — mesmos grupos e subcategorias.
 *  O sistema lê este arquivo para exibir o FORECAST nos meses
 *  futuros ao mês atual selecionado.
 *
 *  Col A  = Categoria  (linha de grupo: apenas Col A preenchida)
 *  Col B  = Subcategoria (linha de item: apenas Col B preenchida)
 *  Col C–N = Jan–Dez  (12 meses de previsão)
 *  Col O  = Total acum  (ignorada pelo parser)
 *  Col P  = Unidade     (ignorada pelo parser)
 *
 *  COMO USAR:
 *  1. Extensões → Apps Script → cole este código
 *  2. Selecione "criarAbaPrevisao2026" → ▶ Executar
 *  3. Preencha os valores em azul (previsão para cada mês)
 *  4. O sistema mostrará automaticamente os dados previstos nos
 *     meses futuros ao mês atual, com fundo azul-claro e itálico.
 * ============================================================
 */

function criarAbaPrevisao2026() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const nome = 'Previsao_2026';

  const existente = ss.getSheetByName(nome);
  if (existente) ss.deleteSheet(existente);
  const sh = ss.insertSheet(nome);

  // -- Paleta (diferente da Saidas para distinguir visualmente) --
  const COR = {
    tituloBg:   '#0F3460',    // Azul-escuro (vs petróleo da Saidas)
    hdrBg:      '#1A3A6E',
    hdrFg:      '#FFFFFF',
    grpReceita: '#0B5394',
    grpCMV:     '#7B2D10',
    grpDespAdm: '#4A2060',
    grpPessoal: '#0B4A1E',
    grpRH:      '#1A6B45',   // Centro de custo RH
    grpComerc:  '#7D6608',
    grpTribut:  '#512E5F',
    grpFinanc:  '#0D4B82',
    grpSMT:     '#0B5345',
    grpTotal:   '#1A2535',
    grpFg:      '#FFFFFF',
    subA:       '#EBF0FF',   // Azul muito claro — indica "previsão"
    subB:       '#F5F7FF',
    subFg:      '#1A2535',
    inputFg:    '#0000CD',   // Azul mais escuro que Saidas
    totalBg:    '#C8D8F8',
    totalFg:    '#0D3A8E',
    separador:  '#C8D5E8',
    borda:      '#A0B4D0',
  };

  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

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
      subs: ['Brasil', 'Mundo', 'Outros']
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
        'Contabilidade', 'Aluguel', 'Telefonica e Internet',
        'Energia Elétrica', 'Escritório', 'Informatica', 'Despesa com Logistica',
      ]
    },
    {
      cat: 'Despesas com pessoal',
      cor: COR.grpPessoal,
      subs: [
        'Folha de pagamento', 'Beneficios', 'Impostos folha de pagamento',
        'Pró-labore', 'Retirada dos Sócios', 'Comissão', 'Diretoria', 'Rescisão',
      ]
    },
    {
      cat: 'RH',
      cor: COR.grpRH,
      subs: ['RH', 'Eventos', 'Cursos e Treinamentos', 'Gratificações']
    },
    {
      cat: 'Despesa Comercial',
      cor: COR.grpComerc,
      subs: ['Viagens e Representações', 'Alimentação', 'Transporte', 'Outros ( Brindes...)']
    },
    {
      cat: 'Despesa Tributaria',
      cor: COR.grpTribut,
      subs: ['COFINS', 'PIS', 'GNRE', 'CSLL e IRPJ', 'ICMS', 'Outros impostos']
    },
    {
      cat: 'Atividades Financeiras',
      cor: COR.grpFinanc,
      subs: [
        'Empréstimos PGTO', 'Empréstimos', 'Tarifa Bancaria',
        'Investimentos', 'Investimento Externo', 'Estorno', 'Emprestimo entre contas',
      ]
    },
    {
      cat: 'Custo SMT',
      cor: COR.grpSMT,
      subs: [
        'SMT - CSP', 'SMT - CSP (Mundo)', 'SMT - Folha de Pagamento',
        'SMT - Imposto Sobre Folha', 'SMT - Aluguel', 'SMT - Tributação',
        'SMT -  Despesas Administrativas', 'SMT - Investimento', 'SMT - Empréstimo',
      ]
    },
    {
      cat: 'Custo Total',
      cor: COR.grpTotal,
      subs: []
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
    .setValue('GESTORA SMART  ·  PREVISÃO (FORECAST) 2026  ·  Valores projetados para meses futuros')
    .setBackground(COR.tituloBg)
    .setFontColor('#FFFFFF')
    .setFontSize(12)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // -- Linha 2: aviso ------------------------------------------
  sh.setRowHeight(2, 20);
  sh.getRange(2, 1, 1, TOTAL_COLS)
    .merge()
    .setValue('ℹ️  Preencha todos os 12 meses. O sistema usa esta aba apenas para os meses após o mês atual selecionado. Meses já realizados são lidos da aba Saidas_2026.')
    .setBackground('#DCE8FF')
    .setFontColor('#0D3A8E')
    .setFontSize(8)
    .setFontStyle('italic')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // -- Linha 3: cabeçalho de colunas ---------------------------
  sh.setRowHeight(3, 26);
  const hdr = [['Categoria', 'Subcategoria'].concat(MESES).concat(['Total', 'Un.'])];
  sh.getRange(3, 1, 1, TOTAL_COLS).setValues(hdr);
  const rHdr = sh.getRange(3, 1, 1, TOTAL_COLS);
  rHdr.setBackground(COR.hdrBg)
      .setFontColor(COR.hdrFg)
      .setFontWeight('bold')
      .setFontSize(9)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  sh.getRange(3, 1).setHorizontalAlignment('left');
  sh.getRange(3, 2).setHorizontalAlignment('left');

  sh.setFrozenRows(3);

  let row = 4;
  let subCount = 0;

  GRUPOS.forEach(grupo => {
    // ── Linha de GRUPO ─────────────────────────────────────────
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
    sh.getRange(row, COL.sub, 1, TOTAL_COLS - 1).setValue('');

    const grpRow = row;
    row++;

    const subRows = [];
    grupo.subs.forEach((subNome, si) => {
      sh.setRowHeight(row, 21);
      const bg = si % 2 === 0 ? COR.subA : COR.subB;

      sh.getRange(row, COL.cat).setValue('').setBackground(bg);

      sh.getRange(row, COL.sub)
        .setValue(subNome)
        .setBackground(bg)
        .setFontColor(COR.subFg)
        .setFontSize(9)
        .setFontWeight('bold')
        .setHorizontalAlignment('left')
        .setVerticalAlignment('middle');

      for (let m = 0; m < 12; m++) {
        sh.getRange(row, COL.jan + m)
          .setValue('')
          .setFontColor(COR.inputFg)
          .setBackground(bg)
          .setNumberFormat('#,##0.00')
          .setHorizontalAlignment('right')
          .setVerticalAlignment('middle')
          .setFontSize(9);
      }

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

      sh.getRange(row, COL.un)
        .setValue('R$')
        .setBackground(bg)
        .setFontColor('#718096')
        .setFontSize(8)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');

      sh.getRange(row, 1, 1, TOTAL_COLS).setBorder(
        false, false, true, false, false, false,
        COR.borda, SpreadsheetApp.BorderStyle.SOLID
      );

      subRows.push(row);
      subCount++;
      row++;
    });

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

    sh.setRowHeight(row, 5);
    sh.getRange(row, 1, 1, TOTAL_COLS).setBackground(COR.separador);
    row++;
  });

  sh.getRange(3, 1, row - 3, TOTAL_COLS).setBorder(
    true, true, true, true, false, false,
    '#3A5A9E', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  sh.setRowHeight(row, 18);
  sh.getRange(row, 1, 1, TOTAL_COLS)
    .merge()
    .setValue('Azul = input manual  ·  Linha de grupo = soma automática  ·  Esta aba alimenta o Forecast do sistema')
    .setBackground('#DCE8FF')
    .setFontColor('#0D3A8E')
    .setFontSize(8)
    .setFontStyle('italic')
    .setHorizontalAlignment('center');

  SpreadsheetApp.getUi().alert(
    `✅  Aba "${nome}" criada com sucesso!\n\n` +
    `• ${GRUPOS.length} grupos · ${subCount} subcategorias\n` +
    `• Todos os 12 meses disponíveis para preenchimento\n` +
    `• Linhas 1-3 congeladas\n\n` +
    `Preencha os valores em azul.\n` +
    `O sistema mostrará como FORECAST os meses após\n` +
    `o mês atual selecionado no painel.`
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
