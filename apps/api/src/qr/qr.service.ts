import { Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  /** Same payload is printed as QR and written to NFC NDEF Text */
  buildStudentCardPayload(student: {
    id: string;
    studentUid: string;
    firstName: string;
    lastName: string;
  }) {
    const payloadObj = {
      type: 'student',
      uid: student.studentUid,
      id: student.id,
      v: 1,
    };
    const payload = JSON.stringify(payloadObj);
    // Compact NFC text (some cheap tags prefer shorter content)
    const nfcText = `SUCCESS:${student.studentUid}`;
    return { payloadObj, payload, nfcText };
  }

  async studentQr(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { gradeLevel: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const { payload, nfcText, payloadObj } = this.buildStudentCardPayload(student);
    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: 420,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    return {
      studentId: student.id,
      studentUid: student.studentUid,
      name: `${student.firstName} ${student.lastName}`,
      grade: student.gradeLevel?.nameAr || student.gradeLevel?.nameEn || '',
      qrDataUrl,
      payload,
      payloadObj,
      nfcText,
      nfcWriteHint:
        'Write NFC NDEF Text record with nfcText (or full payload JSON). Reader must send the same string to /attendance/qr',
    };
  }

  async gateQr() {
    const payload = JSON.stringify({
      type: 'gate',
      center: 'main',
      ts: Date.now(),
    });
    const dataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 1 });
    return { type: 'gate', qrDataUrl: dataUrl, payload };
  }
}
