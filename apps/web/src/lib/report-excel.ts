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
