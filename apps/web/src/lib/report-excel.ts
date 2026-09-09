import ExcelJS from 'exceljs';

const NAVY = 'FF0B2545';
const GOLD = 'FFC99612';
const EMERALD = 'FF047857';
const ROSE = 'FFBE123C';
const SAND = 'FFF8F4EC';
const MIST = 'FFE8EEF4';
const WHITE = 'FFFFFFFF';
const MUTED = 'FF64748B';

const MONEY_FMT = '#,##0.00';
const INT_FMT = '#,##0';

function moneyNum(n: unknown) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: 'FFCBD5E1' },
  };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function styleTitle(
  sheet: ExcelJS.Worksheet,
  row: number,
  cols: number,
  title: string,
) {
  sheet.mergeCells(row, 1, row, cols);
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 16, color: { argb: WHITE }, name: 'Calibri' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
  sheet.getRow(row).height = 28;
}

function styleSubtitle(
  sheet: ExcelJS.Worksheet,
  row: number,
  cols: number,
  text: string,
) {
  sheet.mergeCells(row, 1, row, cols);
  const cell = sheet.getCell(row, 1);
  cell.value = text;
  cell.font = { size: 11, color: { argb: NAVY }, name: 'Calibri' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SAND } };
  cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
  sheet.getRow(row).height = 20;
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, row: number, cols: number) {
  const r = sheet.getRow(row);
  for (let c = 1; c <= cols; c++) {
    const cell = r.getCell(c);
    cell.font = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      readingOrder: 'rtl',
      wrapText: true,
    };
    cell.border = thinBorder();
  }
  r.height = 22;
}

function styleDataRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  cols: number,
  zebra: boolean,
) {
  const r = sheet.getRow(row);
  for (let c = 1; c <= cols; c++) {
    const cell = r.getCell(c);
    cell.font = { size: 10, color: { argb: NAVY }, name: 'Calibri' };
    cell.alignment = {
      horizontal: typeof cell.value === 'number' ? 'left' : 'right',
      vertical: 'middle',
      readingOrder: 'rtl',
    };
    cell.border = thinBorder();
    if (zebra) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: MIST },
      };
    }
  }
}

function applyRtl(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 3 }];
}

function setColWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

function addMetaFooter(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  cols: number,
  from: string,
  to: string,
) {
  const row = startRow + 1;
  sheet.mergeCells(row, 1, row, cols);
  const cell = sheet.getCell(row, 1);
  cell.value = `Success Center · الفترة ${from} → ${to} · صُدر ${new Date().toLocaleString('ar-EG')}`;
  cell.font = { size: 9, italic: true, color: { argb: MUTED }, name: 'Calibri' };
  cell.alignment = { horizontal: 'right', readingOrder: 'rtl' };
}

function writeKpiBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  items: Array<{ label: string; value: number; tone?: 'gold' | 'emerald' | 'rose' | 'navy' }>,
) {
  const toneArgb: Record<string, string> = {
    gold: GOLD,
    emerald: EMERALD,
    rose: ROSE,
    navy: NAVY,
  };
  // header
  sheet.getCell(startRow, 1).value = 'البند';
  sheet.getCell(startRow, 2).value = 'المبلغ (ج.م)';
  styleHeaderRow(sheet, startRow, 2);

  items.forEach((item, i) => {
    const r = startRow + 1 + i;
    const labelCell = sheet.getCell(r, 1);
    const valueCell = sheet.getCell(r, 2);
    labelCell.value = item.label;
    valueCell.value = moneyNum(item.value);
    valueCell.numFmt = MONEY_FMT;
    styleDataRow(sheet, r, 2, i % 2 === 1);
    labelCell.font = { bold: true, size: 10, color: { argb: NAVY }, name: 'Calibri' };
    const accent = toneArgb[item.tone || 'navy'];
    valueCell.font = {
      bold: true,
      size: 11,
      color: { argb: accent },
      name: 'Calibri',
    };
    if (item.tone === 'emerald' || item.tone === 'rose') {
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: item.tone === 'emerald' ? 'FFECFDF5' : 'FFFFF1F2' },
      };
    }
  });
  return startRow + items.length;
}

function writeTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  headers: string[],
  rows: (string | number)[][],
  moneyCols: number[],
  intCols: number[] = [],
) {
  headers.forEach((h, i) => {
    sheet.getCell(startRow, i + 1).value = h;
  });
  styleHeaderRow(sheet, startRow, headers.length);

  rows.forEach((row, ri) => {
    const r = startRow + 1 + ri;
    row.forEach((val, ci) => {
      const cell = sheet.getCell(r, ci + 1);
      cell.value = val;
      if (moneyCols.includes(ci + 1) && typeof val === 'number') {
        cell.numFmt = MONEY_FMT;
      }
      if (intCols.includes(ci + 1) && typeof val === 'number') {
        cell.numFmt = INT_FMT;
      }
    });
    styleDataRow(sheet, r, headers.length, ri % 2 === 1);
  });

  // totals row for money cols if there is data
  if (rows.length && moneyCols.length) {
    const totalRow = startRow + 1 + rows.length;
    sheet.getCell(totalRow, 1).value = 'الإجمالي';
    moneyCols.forEach((col) => {
      const sum = rows.reduce(
        (n, row) => n + (typeof row[col - 1] === 'number' ? Number(row[col - 1]) : 0),
        0,
      );
      const cell = sheet.getCell(totalRow, col);
      cell.value = moneyNum(sum);
      cell.numFmt = MONEY_FMT;
    });
    for (let c = 1; c <= headers.length; c++) {
      const cell = sheet.getCell(totalRow, c);
      cell.font = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: GOLD },
      };
      cell.border = thinBorder();
      cell.alignment = {
        horizontal: c === 1 ? 'right' : 'left',
        vertical: 'middle',
        readingOrder: 'rtl',
      };
    }
    return totalRow;
  }
  return startRow + rows.length;
}

function newBook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Success Center ERP';
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

/** تقرير أرباح ومصروفات — Excel احترافي */
export async function exportPnlExcel(data: any, from: string, to: string) {
  const s = data?.summary || {};
  const wb = newBook();
  wb.title = `أرباح ومصروفات ${from} → ${to}`;

  // —— ملخص ——
  const summary = wb.addWorksheet('ملخص', {
    properties: { defaultRowHeight: 18 },
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }],
  });
  setColWidths(summary, [36, 18, 18, 18]);
  styleTitle(summary, 1, 2, 'Success Center — تقرير أرباح ومصروفات');
  styleSubtitle(
    summary,
    2,
    2,
    `الفترة: ${from}  ←  ${to}   ·   تم التصدير: ${new Date().toLocaleString('ar-EG')}`,
  );
  styleSubtitle(summary, 3, 2, 'صافي الربح = حصة السنتر − إجمالي المصروفات');

  const lastKpi = writeKpiBlock(summary, 5, [
    { label: 'إجمالي التحصيل', value: moneyNum(s.gross), tone: 'gold' },
    { label: 'حصة المدرسين', value: moneyNum(s.teacherShare), tone: 'navy' },
    { label: 'حصة السنتر', value: moneyNum(s.centerShare), tone: 'emerald' },
    { label: 'إجمالي المصروفات', value: moneyNum(s.totalExpenses), tone: 'rose' },
    { label: 'مصروف الدرج', value: moneyNum(s.drawerExpenses) },
    { label: 'مصروف الخزنة', value: moneyNum(s.safeExpenses) },
    { label: 'من صاحب السنتر', value: moneyNum(s.ownerExpenses) },
    {
      label: 'صافي الربح',
      value: moneyNum(s.netProfit),
      tone: Number(s.netProfit) >= 0 ? 'emerald' : 'rose',
    },
  ]);
  summary.getCell(lastKpi + 2, 1).value = 'عدد حركات المصروف';
  summary.getCell(lastKpi + 2, 2).value = Number(s.expensesCount || 0);
  summary.getCell(lastKpi + 2, 2).numFmt = INT_FMT;
  styleDataRow(summary, lastKpi + 2, 2, false);
  addMetaFooter(summary, lastKpi + 3, 2, from, to);

  // —— مصادر الإيراد ——
  const streams = wb.addWorksheet('مصادر الإيراد');
  setColWidths(streams, [18, 16, 16, 16, 10]);
  applyRtl(streams);
  styleTitle(streams, 1, 5, 'مصادر الإيراد');
  styleSubtitle(streams, 2, 5, `${from} → ${to}`);
  writeTable(
    streams,
    4,
    ['المصدر', 'إجمالي', 'حصة المدرس', 'حصة السنتر', 'عدد'],
    (data?.profitStreams || []).map((row: any) => [
      row.label,
      moneyNum(row.gross),
      moneyNum(row.teacherShare),
      moneyNum(row.centerShare),
      Number(row.count || 0),
    ]),
    [2, 3, 4],
    [5],
  );
  addMetaFooter(streams, 6 + (data?.profitStreams?.length || 0), 5, from, to);

  // —— قائمة الإيرادات ——
  const revList = wb.addWorksheet('قائمة الإيرادات');
  setColWidths(revList, [12, 14, 28, 32, 14, 14, 14]);
  applyRtl(revList);
  styleTitle(revList, 1, 7, 'قائمة الإيرادات التفصيلية');
  styleSubtitle(
    revList,
    2,
    7,
    `${from} → ${to} · ${(data?.revenueLines || []).length} حركة`,
  );
  writeTable(
    revList,
    4,
    [
      'التاريخ',
      'المصدر',
      'البيان',
      'التفاصيل',
      'الإجمالي',
      'حصة المدرس',
      'حصة السنتر',
    ],
    (data?.revenueLines || []).map((r: any) => [
      String(r.date || '').slice(0, 10),
      r.streamLabel || r.stream || '',
      r.label || '',
      r.detail || '',
      moneyNum(r.gross),
      moneyNum(r.teacherShare),
      moneyNum(r.centerShare),
    ]),
    [5, 6, 7],
  );

  // —— حسب البند ——
  const byCat = wb.addWorksheet('مصروفات حسب البند');
  setColWidths(byCat, [28, 16, 10]);
  applyRtl(byCat);
  styleTitle(byCat, 1, 3, 'المصروفات حسب البند');
  styleSubtitle(byCat, 2, 3, `${from} → ${to}`);
  writeTable(
    byCat,
    4,
    ['البند', 'المبلغ', 'عدد'],
    (data?.byCategory || []).map((row: any) => [
      row.label,
      moneyNum(row.amount),
      Number(row.count || 0),
    ]),
    [2],
    [3],
  );

  // —— مصدر الصرف ——
  const bySrc = wb.addWorksheet('حسب مصدر الصرف');
  setColWidths(bySrc, [20, 16, 10]);
  applyRtl(bySrc);
  styleTitle(bySrc, 1, 3, 'المصروفات حسب المصدر');
  styleSubtitle(bySrc, 2, 3, `${from} → ${to}`);
  writeTable(
    bySrc,
    4,
    ['المصدر', 'المبلغ', 'عدد'],
    (data?.bySource || []).map((row: any) => [
      row.label,
      moneyNum(row.amount),
      Number(row.count || 0),
    ]),
    [2],
    [3],
  );

  // —— قائمة ——
  const list = wb.addWorksheet('قائمة المصروفات');
  setColWidths(list, [12, 22, 14, 14, 32, 16]);
  applyRtl(list);
  styleTitle(list, 1, 6, 'قائمة المصروفات التفصيلية');
  styleSubtitle(list, 2, 6, `${from} → ${to} · ${(data?.expenses || []).length} حركة`);
  writeTable(
    list,
    4,
    ['التاريخ', 'البند', 'المصدر', 'المبلغ', 'ملاحظة', 'بواسطة'],
    (data?.expenses || []).map((e: any) => [
      String(e.businessDate || '').slice(0, 10),
      e.category || '',
      e.paidFromLabel || e.paidFrom || '',
      moneyNum(e.amount),
      e.note || '',
      e.createdByName || '',
    ]),
    [4],
  );

  await downloadWorkbook(wb, `Success-PnL-${from}_${to}.xlsx`);
}

export async function exportProfitExcel(data: any, from: string, to: string) {
  const s = data?.summary || {};
  const wb = newBook();
  wb.title = `ربحية ${from} → ${to}`;

  const summary = wb.addWorksheet('ملخص');
  setColWidths(summary, [28, 18]);
  applyRtl(summary);
  styleTitle(summary, 1, 2, 'Success Center — تقرير الربحية');
  styleSubtitle(summary, 2, 2, `${from} → ${to}`);
  writeKpiBlock(summary, 4, [
    { label: 'إجمالي التحصيل', value: moneyNum(s.totalGross), tone: 'gold' },
    { label: 'حصة المدرسين', value: moneyNum(s.totalTeacher) },
    { label: 'حصة السنتر', value: moneyNum(s.totalCenter), tone: 'emerald' },
    { label: 'استرجاعات', value: moneyNum(s.totalRefunds), tone: 'rose' },
  ]);

  const teachers = wb.addWorksheet('حسب المدرس');
  setColWidths(teachers, [24, 14, 14, 14, 8]);
  applyRtl(teachers);
  styleTitle(teachers, 1, 5, 'الربحية حسب المدرس');
  styleSubtitle(teachers, 2, 5, `${from} → ${to}`);
  writeTable(
    teachers,
    4,
    ['المدرس', 'إجمالي', 'حصته', 'السنتر', 'عدد'],
    (data?.byTeacher || []).map((row: any) => [
      row.label,
      moneyNum(row.gross),
      moneyNum(row.teacherShare),
      moneyNum(row.centerShare),
      Number(row.count || 0),
    ]),
    [2, 3, 4],
    [5],
  );

  const subjects = wb.addWorksheet('حسب المادة');
  setColWidths(subjects, [24, 14, 14, 14, 8]);
  applyRtl(subjects);
  styleTitle(subjects, 1, 5, 'الربحية حسب المادة');
  styleSubtitle(subjects, 2, 5, `${from} → ${to}`);
  writeTable(
    subjects,
    4,
    ['المادة', 'إجمالي', 'المدرس', 'السنتر', 'عدد'],
    (data?.bySubject || []).map((row: any) => [
      row.label,
      moneyNum(row.gross),
      moneyNum(row.teacherShare),
      moneyNum(row.centerShare),
      Number(row.count || 0),
    ]),
    [2, 3, 4],
    [5],
  );

  await downloadWorkbook(wb, `Success-Profit-${from}_${to}.xlsx`);
}

export async function exportFinanceExcel(data: any, from: string, to: string) {
  const s = data?.summary || {};
  const wb = newBook();
  wb.title = `مالي ${from} → ${to}`;

  const summary = wb.addWorksheet('ملخص');
  setColWidths(summary, [28, 18]);
  applyRtl(summary);
  styleTitle(summary, 1, 2, 'Success Center — التقرير المالي');
  styleSubtitle(summary, 2, 2, `${from} → ${to}`);
  writeKpiBlock(summary, 4, [
    { label: 'التحصيل', value: moneyNum(s.collected), tone: 'gold' },
    { label: 'المفوتر', value: moneyNum(s.invoiced) },
    { label: 'صافي تقديري', value: moneyNum(s.netEstimate), tone: 'emerald' },
  ]);
  summary.getCell(9, 1).value = 'عدد الإيصالات';
  summary.getCell(9, 2).value = Number(s.paymentsCount || 0);
  summary.getCell(9, 2).numFmt = INT_FMT;
  styleDataRow(summary, 9, 2, false);

  const pays = wb.addWorksheet('المدفوعات');
  setColWidths(pays, [24, 20, 14, 12]);
  applyRtl(pays);
  styleTitle(pays, 1, 4, 'سجل المدفوعات');
  styleSubtitle(pays, 2, 4, `${from} → ${to}`);
  writeTable(
    pays,
    4,
    ['الطالب', 'الإيصال', 'المبلغ', 'التاريخ'],
    (data?.payments || []).map((p: any) => [
      `${p.student?.firstName || ''} ${p.student?.lastName || ''}`.trim(),
      p.receiptNumber || '',
      moneyNum(p.amount),
      p.paidAt ? String(p.paidAt).slice(0, 10) : '',
    ]),
    [3],
  );

  await downloadWorkbook(wb, `Success-Finance-${from}_${to}.xlsx`);
}

export async function exportCodesHandoutsExcel(
  data: any,
  from: string,
  to: string,
) {
  const s = data?.summary || {};
  const wb = newBook();
  wb.title = `أكواد وملازم ${from} → ${to}`;

  const summary = wb.addWorksheet('ملخص');
  setColWidths(summary, [32, 18]);
  applyRtl(summary);
  styleTitle(summary, 1, 2, 'Success Center — تقرير الأكواد والملازم');
  styleSubtitle(summary, 2, 2, `${from} → ${to}`);
  writeKpiBlock(summary, 4, [
    { label: 'إجمالي الأكواد + الملازم', value: moneyNum(s.totalGross), tone: 'gold' },
    { label: 'حصة المدرسين', value: moneyNum(s.totalTeacher) },
    { label: 'حصة السنتر', value: moneyNum(s.totalCenter), tone: 'emerald' },
    { label: 'عدد الأكواد', value: Number(s.onlineCount || 0) },
    { label: 'تحصيل الأكواد', value: moneyNum(s.onlineGross), tone: 'gold' },
    { label: 'عدد الملازم', value: Number(s.handoutCount || s.handoutQty || 0) },
    { label: 'تحصيل الملازم', value: moneyNum(s.handoutGross), tone: 'gold' },
    { label: 'باقي أكواد', value: Number(s.onlineRemaining || 0), tone: 'emerald' },
    { label: 'باقي ملازم', value: Number(s.handoutRemaining || 0), tone: 'emerald' },
    { label: 'دخل الخزنة', value: moneyNum(s.safeEnteredTotal), tone: 'gold' },
  ]);

  const stockCodes = wb.addWorksheet('مخزون أكواد');
  setColWidths(stockCodes, [28, 20, 10, 10, 10]);
  applyRtl(stockCodes);
  styleTitle(stockCodes, 1, 5, 'المخزون — أكواد متبقية');
  writeTable(
    stockCodes,
    3,
    ['العرض', 'المدرس', 'إجمالي', 'مباع', 'متبقي'],
    (data?.stockOffers || []).map((r: any) => [
      r.title,
      r.teacherName || '',
      Number(r.total || 0),
      Number(r.sold || 0),
      Number(r.remaining || 0),
    ]),
    [],
    [3, 4, 5],
  );

  const stockHandouts = wb.addWorksheet('مخزون ملازم');
  setColWidths(stockHandouts, [28, 20, 10, 10, 10]);
  applyRtl(stockHandouts);
  styleTitle(stockHandouts, 1, 5, 'المخزون — ملازم متبقية');
  writeTable(
    stockHandouts,
    3,
    ['الملزمة', 'المدرس', 'إجمالي', 'مباع', 'متبقي'],
    (data?.stockHandouts || []).map((r: any) => [
      r.title,
      r.teacherName || '',
      Number(r.total || 0),
      Number(r.sold || 0),
      Number(r.remaining || 0),
    ]),
    [],
    [3, 4, 5],
  );

  const safeSheet = wb.addWorksheet('دخول الخزنة');
  setColWidths(safeSheet, [18, 12, 28, 14, 12, 14, 36]);
  applyRtl(safeSheet);
  styleTitle(safeSheet, 1, 7, 'دخول الخزنة');
  writeTable(
    safeSheet,
    3,
    ['وقت الدخول', 'النوع', 'البيان', 'المبلغ', 'يوم العمل', 'الإيصال', 'ملاحظة'],
    (data?.safeEntries || []).map((r: any) => [
      r.at
        ? new Date(r.at).toLocaleString('ar-EG', {
            dateStyle: 'short',
            timeStyle: 'short',
          })
        : '',
      r.kindLabel || '',
      r.title || '',
      moneyNum(r.amount),
      r.businessDate || '',
      r.receiptNumber || '',
      r.note || '',
    ]),
    [4],
  );

  const teachers = wb.addWorksheet('حسب المدرس');
  setColWidths(teachers, [24, 12, 12, 12, 12, 14, 14, 14]);
  applyRtl(teachers);
  styleTitle(teachers, 1, 8, 'حسب المدرس');
  writeTable(
    teachers,
    3,
    [
      'المدرس',
      'مباع أكواد',
      'مباع ملازم',
      'باقي أكواد',
      'باقي ملازم',
      'إجمالي',
      'المدرس',
      'السنتر',
    ],
    (data?.byTeacher || []).map((r: any) => [
      r.label,
      Number(r.codesSold || 0),
      Number(r.handoutsSold || 0),
      Number(r.codesRemaining || 0),
      Number(r.handoutsRemaining || 0),
      moneyNum(r.gross),
      moneyNum(r.teacherShare),
      moneyNum(r.centerShare),
    ]),
    [6, 7, 8],
    [2, 3, 4, 5],
  );

  const offers = wb.addWorksheet('حسب العرض');
  setColWidths(offers, [28, 12, 10, 14, 14, 14]);
  applyRtl(offers);
  styleTitle(offers, 1, 6, 'أكواد حسب العرض');
  writeTable(
    offers,
    3,
    ['العرض', 'مباع (فترة)', 'متبقي', 'إجمالي', 'المدرس', 'السنتر'],
    (data?.byOffer || []).map((r: any) => [
      r.label,
      Number(r.count || 0),
      Number(r.remaining || 0),
      moneyNum(r.gross),
      moneyNum(r.teacherShare),
      moneyNum(r.centerShare),
    ]),
    [4, 5, 6],
    [2, 3],
  );

  const products = wb.addWorksheet('حسب الملزمة');
  setColWidths(products, [28, 12, 10, 14, 14, 14]);
  applyRtl(products);
  styleTitle(products, 1, 6, 'ملازم حسب المنتج');
  writeTable(
    products,
    3,
    ['الملزمة', 'مباع (فترة)', 'متبقي', 'إجمالي', 'المدرس', 'السنتر'],
    (data?.byProduct || []).map((r: any) => [
      r.label,
      Number(r.count || 0),
      Number(r.remaining || 0),
      moneyNum(r.gross),
      moneyNum(r.teacherShare),
      moneyNum(r.centerShare),
    ]),
    [4, 5, 6],
    [2, 3],
  );

  const online = wb.addWorksheet('تفاصيل الأكواد');
  setColWidths(online, [12, 18, 22, 14, 12, 12, 12, 10, 14, 14, 18, 16]);
  applyRtl(online);
  styleTitle(online, 1, 12, 'تفاصيل مبيعات الأكواد');
  writeTable(
    online,
    3,
    [
      'التاريخ',
      'المدرس',
      'العرض',
      'الكود',
      'الإجمالي',
      'المدرس',
      'السنتر',
      'الدفع',
      'الوجهة',
      'الإيصال',
      'الطالب',
      'التصفية',
    ],
    (data?.onlineSales || []).map((r: any) => [
      r.date || '',
      r.teacherName || '',
      r.title || '',
      r.code || '',
      moneyNum(r.gross),
      moneyNum(r.teacherShare),
      moneyNum(r.centerShare),
      r.methodLabel || '',
      r.cashToLabel || '',
      r.receiptNumber || '',
      r.studentName || '',
      r.settled ? 'اتصفت' : 'مفتوحة',
    ]),
    [5, 6, 7],
  );

  const handouts = wb.addWorksheet('تفاصيل الملازم');
  setColWidths(handouts, [12, 18, 22, 8, 12, 12, 12, 10, 14, 14, 18, 16]);
  applyRtl(handouts);
  styleTitle(handouts, 1, 12, 'تفاصيل مبيعات الملازم');
  writeTable(
    handouts,
    3,
    [
      'التاريخ',
      'المدرس',
      'الملزمة',
      'كمية',
      'الإجمالي',
      'المدرس',
      'السنتر',
      'الدفع',
      'الوجهة',
      'الإيصال',
      'الطالب',
      'التصفية',
    ],
    (data?.handoutSales || []).map((r: any) => [
      r.date || '',
      r.teacherName || '',
      r.title || '',
      Number(r.qty || 0),
      moneyNum(r.gross),
      moneyNum(r.teacherShare),
      moneyNum(r.centerShare),
      r.methodLabel || '',
      r.cashToLabel || '',
      r.receiptNumber || '',
      r.studentName || '',
      r.settled ? 'اتصفت' : 'مفتوحة',
    ]),
    [5, 6, 7],
    [4],
  );

  await downloadWorkbook(wb, `Success-Codes-Handouts-${from}_${to}.xlsx`);
}
