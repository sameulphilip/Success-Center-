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

  private sessionDetail(session?: {
    teacher?: { firstName?: string; lastName?: string } | null;
    subject?: { nameAr?: string | null; nameEn?: string | null } | null;
    title?: string | null;
  } | null) {
    if (!session) return undefined;
    const teacher = `${session.teacher?.firstName || ''} ${session.teacher?.lastName || ''}`.trim();
    const sessionName =
      session.subject?.nameAr ||
      session.subject?.nameEn ||
      session.title ||
      'حصة';
    if (teacher) return `المدرس: ${teacher} · الحصة: ${sessionName}`;
    return `الحصة: ${sessionName}`;
  }

  async checkIn(input: {
    payload: string;
    sessionId?: string;
    teacherId?: string;
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
      teacherId: input.teacherId,
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
          teacherId: input.teacherId,
          source,
        });
      } else if (eligible.length > 1) {
        return {
          ok: false,
          gate: 'CHOOSE_SESSION' as const,
          needsSessionChoice: true,
          message: 'اختر الحصة المدفوعة للدخول',
          student: result.student,
          studentName: this.studentName(result.student),
          sessions: result.sessions,
          eligibleSessions: eligible,
          otherPaidSessions: result.otherPaidSessions || [],
          deviceName,
          at: new Date().toISOString(),
        };
      } else {
        const openCount = (result.sessions || []).length;
        const pending = (result.sessions || []).filter(
          (s: { needsConfirm?: boolean; needsPayment?: boolean }) =>
            s.needsConfirm || s.needsPayment,
        );
        const otherPaid = result.otherPaidSessions || [];
        const otherLabel = otherPaid[0]?.paidLabel;
        return {
          ok: false,
          gate: openCount === 0 ? ('NO_SESSION' as const) : ('NEED_PAYMENT' as const),
          needsSessionChoice: true,
          message:
            openCount === 0
              ? 'لا توجد حصص مفتوحة الآن — راجع الاستقبال'
              : otherLabel
                ? `${otherLabel} — مش الحصة دي، لازم يدفع للمدرس الحالي`
                : pending.some((s: { needsConfirm?: boolean }) => s.needsConfirm)
                  ? 'الدفع بانتظار تأكيد الاستقبال (فودافون كاش)'
                  : 'ادفع عند الاستقبال أولاً قبل الدخول',
          student: result.student,
          studentName: this.studentName(result.student),
          sessions: result.sessions,
          otherPaidSessions: otherPaid,
          deviceName,
          at: new Date().toISOString(),
        };
      }
    }

    if (result && 'alreadyCheckedIn' in result && result.alreadyCheckedIn) {
      const detail = this.sessionDetail(result.session);
      return {
        ok: true,
        alreadyCheckedIn: true,
        allowed: true,
        gate: 'ALLOWED' as const,
        message: `مسموح بالدخول: ${this.studentName(result.student)}`,
        detail,
        student: result.student,
        studentName: this.studentName(result.student),
        session: result.session,
        entry: result.entry,
        deviceName,
        at: new Date().toISOString(),
      };
    }

    if (result && 'ok' in result && result.ok) {
      const session =
        'session' in result
          ? result.session
          : (result as { entry?: { session?: any } }).entry?.session;
      const detail = this.sessionDetail(session);
      return {
        ok: true,
        allowed: true,
        gate: 'ENTERED' as const,
        message: `مسموح بالدخول: ${this.studentName(result.student)}`,
        detail,
        student: result.student,
        studentName: this.studentName(result.student),
        entry: 'entry' in result ? result.entry : undefined,
        session,
        phoneCheckInRemaining:
          'phoneCheckInRemaining' in result
            ? result.phoneCheckInRemaining
            : undefined,
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
