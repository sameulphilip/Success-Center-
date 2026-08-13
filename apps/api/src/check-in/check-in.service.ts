import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { AttendanceSource, OpsCheckInSource } from '@prisma/client';
import { OpsService } from '../ops/ops.service';

@Injectable()
export class CheckInService {
  constructor(private readonly ops: OpsService) {}

  private mapSource(source?: AttendanceSource | string): OpsCheckInSource {
    const s = String(source || '').toUpperCase();
    if (s === 'NFC_CARD' || s === 'NFC') return OpsCheckInSource.NFC;
    if (s === 'PHONE') return OpsCheckInSource.PHONE;
    if (s === 'MANUAL') return OpsCheckInSource.MANUAL;
    return OpsCheckInSource.QR;
  }

  private studentName(student: {
    firstName?: string;
    lastName?: string;
  } | null | undefined) {
    if (!student) return 'طالب';
    return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'طالب';
  }

  async checkIn(input: {
    payload: string;
    sessionId?: string;
    groupId?: string;
    source?: AttendanceSource | string;
    deviceName?: string;
  }) {
    if (!input.payload?.trim()) {
      throw new BadRequestException('لا يوجد كود للمسح');
    }

    const source = this.mapSource(input.source);
    const deviceName = input.deviceName || 'gate-reader';

    let result = await this.ops.checkIn({
      qrPayload: input.payload.trim(),
      sessionId: input.sessionId,
      source,
    });

    // Auto-pick when exactly one paid open session allows entry
    if (
      result &&
      'needsSessionChoice' in result &&
      result.needsSessionChoice &&
      !input.sessionId
    ) {
      const eligible = (result.sessions || []).filter(
        (s: { canCheckIn?: boolean }) => s.canCheckIn,
      );
      if (eligible.length === 1) {
        result = await this.ops.checkIn({
          qrPayload: input.payload.trim(),
          sessionId: eligible[0].id,
          source,
        });
      } else if (eligible.length > 1) {
        return {
          ok: false,
          gate: 'CHOOSE_SESSION' as const,
          needsSessionChoice: true,
          message: 'اختر الحصة للدخول',
          student: result.student,
          studentName: this.studentName(result.student),
          sessions: result.sessions,
          eligibleSessions: eligible,
          deviceName,
          at: new Date().toISOString(),
        };
      } else {
        const openCount = (result.sessions || []).length;
        const pending = (result.sessions || []).filter(
          (s: { needsConfirm?: boolean; needsPayment?: boolean }) =>
            s.needsConfirm || s.needsPayment,
        );
        return {
          ok: false,
          gate: openCount === 0 ? ('NO_SESSION' as const) : ('NEED_PAYMENT' as const),
          needsSessionChoice: true,
          message:
            openCount === 0
              ? 'لا توجد حصص مفتوحة الآن — راجع الاستقبال'
              : pending.some((s: { needsConfirm?: boolean }) => s.needsConfirm)
                ? 'الدفع بانتظار تأكيد الاستقبال (فودافون كاش)'
                : 'ادفع عند الاستقبال أولاً قبل الدخول',
          student: result.student,
          studentName: this.studentName(result.student),
          sessions: result.sessions,
          deviceName,
          at: new Date().toISOString(),
        };
      }
    }

    if (result && 'alreadyCheckedIn' in result && result.alreadyCheckedIn) {
      return {
        ok: true,
        alreadyCheckedIn: true,
        gate: 'ALREADY' as const,
        message: `مسجّل مسبقاً: ${this.studentName(result.student)}`,
        student: result.student,
        studentName: this.studentName(result.student),
        session: result.session,
        entry: result.entry,
        deviceName,
        at: new Date().toISOString(),
      };
    }

    if (result && 'ok' in result && result.ok) {
      const sessionLabel = [
        result.entry?.session?.teacher?.firstName,
        result.entry?.session?.teacher?.lastName,
      ]
        .filter(Boolean)
        .join(' ');
      return {
        ok: true,
        gate: 'ENTERED' as const,
        message: `تم الدخول: ${this.studentName(result.student)}`,
        detail: sessionLabel ? `حصة ${sessionLabel}` : undefined,
        student: result.student,
        studentName: this.studentName(result.student),
        entry: result.entry,
        phoneCheckInRemaining: result.phoneCheckInRemaining,
        deviceName,
        at: new Date().toISOString(),
      };
    }

    return {
      ...result,
      ok: false,
      deviceName,
      at: new Date().toISOString(),
    };
  }
}
