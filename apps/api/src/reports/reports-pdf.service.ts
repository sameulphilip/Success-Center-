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

  async attendancePdf(
    from?: string,
    to?: string,
    groupId?: string,
  ): Promise<Buffer> {
    const data = await this.reports.attendance(from, to, groupId);
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
      .text('ATTENDANCE REPORT', { align: 'left' });
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
    const rows = [
      ['Total records', s.totalRecords],
      ['Present', s.present],
      ['Absent', s.absent],
      ['Late', s.late],
      ['Excused', s.excused],
      ['Students tracked', s.uniqueStudents],
    ];
    for (const [label, value] of rows) {
      doc
        .fillColor('#475569')
        .fontSize(10)
        .text(`${label}: `, { continued: true })
        .fillColor('#0B2545')
        .text(String(value));
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('Top absentees').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const row of data.byStudent.slice(0, 40)) {
      doc.text(
        `${row.student.firstName} ${row.student.lastName}  present=${row.present} absent=${row.absent} late=${row.late}`,
      );
    }

    doc.moveDown();
    doc.fillColor('#0B2545').fontSize(13).text('Absence log').moveDown(0.4);
    doc.fillColor('#64748B').fontSize(9);
    for (const a of data.absentees.slice(0, 50)) {
      doc.text(
        `${String(a.markedAt).slice(0, 10)}  ${a.student?.firstName || ''} ${a.student?.lastName || ''}  ${a.session?.group?.subject?.nameEn || ''} ${a.session?.group?.name || ''}`,
      );
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
}
