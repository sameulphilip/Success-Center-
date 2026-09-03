import { Injectable } from '@nestjs/common';
// pdfkit CJS default export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { ReportsService } from './reports.service';

@Injectable()
export class ReportsPdfService {
  constructor(private readonly reports: ReportsService) {}

  private centerName() {
    return process.env.CENTER_NAME || 'Success Center';
  }

  async financePdf(from?: string, to?: string): Promise<Buffer> {
    const data = await this.reports.finance(from, to);
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc
      .fillColor('#0B2545')
      .fontSize(20)
      .text(this.centerName(), { align: 'left' });
    doc
      .fillColor('#C99612')
      .fontSize(11)
      .text('FINANCE REPORT', { align: 'left' });
    doc.moveDown(0.5);
    doc
      .fillColor('#334155')
      .fontSize(10)
      .text(
        `Period: ${new Date(data.from).toISOString().slice(0, 10)} → ${new Date(data.to).toISOString().slice(0, 10)}`,
      );
    doc
      .text(`Generated: ${new Date().toLocaleString('en-GB')}`)
      .moveDown();

    const s = data.summary;
    const kpis = [
      ['Collected', `${Number(s.collected).toLocaleString('en-EG')} EGP`],
      ['Invoiced', `${Number(s.invoiced).toLocaleString('en-EG')} EGP`],
      ['Payments count', String(s.paymentsCount)],
      ['Teacher payables', `${Number(s.teacherPayables).toLocaleString('en-EG')} EGP`],
      ['Net estimate', `${Number(s.netEstimate).toLocaleString('en-EG')} EGP`],
    ];

    doc.fillColor('#0B2545').fontSize(13).text('Summary').moveDown(0.4);
    for (const [label, value] of kpis) {
      doc
        .fillColor('#475569')
        .fontSize(10)
        .text(`${label}: `, { continued: true })
        .fillColor('#0B2545')
        .text(value);
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('Recent payments').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const p of data.payments.slice(0, 40)) {
      const line = `${String(p.paidAt).slice(0, 10)}  ${p.student.firstName} ${p.student.lastName}  ${p.receiptNumber}  ${Number(p.amount).toLocaleString('en-EG')} EGP`;
      doc.text(line);
    }

    doc.end();
    return done;
  }

  async bookingsPdf(from?: string, to?: string): Promise<Buffer> {
    const data = await this.reports.bookings(from, to);
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc
      .fillColor('#0B2545')
      .fontSize(20)
      .text(this.centerName(), { align: 'left' });
    doc
      .fillColor('#C99612')
      .fontSize(11)
      .text('BOOKING FORMS REPORT', { align: 'left' });
    doc.moveDown(0.5);
    doc
      .fillColor('#334155')
      .fontSize(10)
      .text(
        `Period: ${new Date(data.from).toISOString().slice(0, 10)} → ${new Date(data.to).toISOString().slice(0, 10)}`,
      );
    doc
      .text(`Generated: ${new Date().toLocaleString('en-GB')}`)
      .moveDown();

    const s = data.summary;
    for (const [label, value] of [
      ['Submitted', String(s.submitted)],
      ['Paid', String(s.paid)],
      ['Paid amount', `${Number(s.paidAmount).toLocaleString('en-EG')} EGP`],
      ['Pending', String(s.pending)],
      ['Cancelled', String(s.cancelled)],
    ] as const) {
      doc
        .fillColor('#475569')
        .fontSize(10)
        .text(`${label}: `, { continued: true })
        .fillColor('#0B2545')
        .text(value);
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('By form').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const row of data.byForm) {
      doc.text(
        `${row.gradeLabel || row.label}  submitted ${row.submitted}  paid ${row.paid}  ${Number(row.amount).toLocaleString('en-EG')} EGP`,
      );
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('Paid submissions').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const row of data.paid.slice(0, 50)) {
      doc.text(
        `${row.formSerial ?? '—'}  ${row.studentName}  ${row.studentPhone}  ${Number(row.totalAmount).toLocaleString('en-EG')} EGP  ${row.paymentMethod || ''}`,
      );
    }

    doc.end();
    return done;
  }

  async teachersPdf(from?: string, to?: string): Promise<Buffer> {
    const data = await this.reports.teachers(from, to);
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc
      .fillColor('#0B2545')
      .fontSize(20)
      .text(this.centerName(), { align: 'left' });
    doc
      .fillColor('#C99612')
      .fontSize(11)
      .text('TEACHERS / SESSIONS REPORT', { align: 'left' });
    doc.moveDown(0.5);
    doc
      .fillColor('#334155')
      .fontSize(10)
      .text(
        `Period: ${new Date(data.from).toISOString().slice(0, 10)} → ${new Date(data.to).toISOString().slice(0, 10)}`,
      )
      .text(`Generated: ${new Date().toLocaleString('en-GB')}`)
      .moveDown();

    const s = data.summary;
    doc.fillColor('#0B2545').fontSize(13).text('Summary').moveDown(0.4);
    for (const [label, value] of [
      ['Teachers', s.teachers],
      ['Sessions', s.sessions],
      ['Present (checked-in)', s.present],
      ['Registered', s.registered],
      ['Collected', `${Number(s.collected).toLocaleString('en-EG')} EGP`],
    ] as const) {
      doc
        .fillColor('#475569')
        .fontSize(10)
        .text(`${label}: `, { continued: true })
        .fillColor('#0B2545')
        .text(String(value));
    }

    for (const t of data.byTeacher) {
      doc.moveDown();
      doc
        .fillColor('#0B2545')
        .fontSize(12)
        .text(
          `${t.name}  ·  ${t.sessionsCount} sessions  ·  present ${t.presentCount}  ·  registered ${t.registeredCount}`,
        );
      doc.fillColor('#64748B').fontSize(9);
      for (const sess of t.sessions) {
        doc.text(
          `  ${sess.sessionDate}  ${sess.subject}${sess.title ? ` (${sess.title})` : ''}  ${sess.status}  present ${sess.present}/${sess.registered}`,
        );
        const names = (sess.attendees || [])
          .map((a: { name: string; discounted?: boolean; amount?: number }) =>
            a.discounted
              ? `${a.name} (${Number(a.amount).toLocaleString('en-EG')})`
              : a.name,
          )
          .join(', ');
        if (names) doc.text(`    ${names}`);
      }
    }

    doc.end();
    return done;
  }

  async profitPdf(from?: string, to?: string): Promise<Buffer> {
    const data = await this.reports.profit(from, to);
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const money = (n: number) => `${Number(n).toLocaleString('en-EG')} EGP`;

    doc
      .fillColor('#0B2545')
      .fontSize(20)
      .text(this.centerName(), { align: 'left' });
    doc
      .fillColor('#C99612')
      .fontSize(11)
      .text('PROFIT / SHARE REPORT', { align: 'left' });
    doc.moveDown(0.5);
    doc
      .fillColor('#334155')
      .fontSize(10)
      .text(
        `Period: ${new Date(data.from).toISOString().slice(0, 10)} → ${new Date(data.to).toISOString().slice(0, 10)}`,
      )
      .text(`Generated: ${new Date().toLocaleString('en-GB')}`)
      .moveDown();

    const s = data.summary;
    doc.fillColor('#0B2545').fontSize(13).text('Summary').moveDown(0.4);
    for (const [label, value] of [
      ['Gross collected', money(s.totalGross)],
      ['Teacher share', money(s.totalTeacher)],
      ['Center share', money(s.totalCenter)],
      ['Session refunds', money(s.totalRefunds)],
    ] as const) {
      doc
        .fillColor('#475569')
        .fontSize(10)
        .text(`${label}: `, { continued: true })
        .fillColor('#0B2545')
        .text(value);
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('By teacher').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const row of data.byTeacher.slice(0, 40)) {
      doc.text(
        `${row.label}  gross=${money(row.gross)}  teacher=${money(row.teacherShare)}  center=${money(row.centerShare)}  n=${row.count}`,
      );
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('By subject').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const row of data.bySubject.slice(0, 40)) {
      doc.text(
        `${row.label}  gross=${money(row.gross)}  teacher=${money(row.teacherShare)}  center=${money(row.centerShare)}`,
      );
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('By room rental').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const row of data.byRoom.slice(0, 40)) {
      doc.text(
        `${row.label}  center=${money(row.centerShare)}  n=${row.count}`,
      );
    }

    doc.end();
    return done;
  }

  async pnlPdf(from?: string, to?: string): Promise<Buffer> {
    const data = await this.reports.pnl(from, to);
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const money = (n: number) => `${Number(n).toLocaleString('en-EG')} EGP`;
    const s = data.summary;

    doc
      .fillColor('#0B2545')
      .fontSize(20)
      .text(this.centerName(), { align: 'left' });
    doc
      .fillColor('#C99612')
      .fontSize(11)
      .text('PROFIT & EXPENSES REPORT', { align: 'left' });
    doc.moveDown(0.5);
    doc
      .fillColor('#334155')
      .fontSize(10)
      .text(
        `Period: ${new Date(data.from).toISOString().slice(0, 10)} → ${new Date(data.to).toISOString().slice(0, 10)}`,
      )
      .text(`Generated: ${new Date().toLocaleString('en-GB')}`)
      .moveDown();

    doc.fillColor('#0B2545').fontSize(13).text('Summary').moveDown(0.4);
    for (const [label, value] of [
      ['Gross collected', money(s.gross)],
      ['Teacher share', money(s.teacherShare)],
      ['Center share', money(s.centerShare)],
      ['Total expenses', money(s.totalExpenses)],
      ['Net profit (center - expenses)', money(s.netProfit)],
    ] as const) {
      doc
        .fillColor('#475569')
        .fontSize(10)
        .text(`${label}: `, { continued: true })
        .fillColor('#0B2545')
        .text(value);
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('Expenses by category').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const row of data.byCategory.slice(0, 40)) {
      doc.text(
        `${row.label}  ${money(row.amount)}  n=${row.count}`,
      );
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('Expense list').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const e of data.expenses.slice(0, 80)) {
      const ymd = new Date(e.businessDate).toISOString().slice(0, 10);
      doc.text(
        `${ymd}  ${e.category}  ${e.paidFromLabel}  ${money(e.amount)}${e.note ? `  · ${e.note}` : ''}`,
      );
    }

    doc.end();
    return done;
  }
}
