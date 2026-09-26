export type TeacherSettlementWhatsAppParams = {
  teacherName: string;
  sessionDate: string;
  subjectName?: string | null;
  title?: string | null;
  attendanceCount: number;
  teacherShare: number;
  centerName?: string;
};

function money(n: number) {
  return Number(n || 0).toLocaleString('en-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** WhatsApp thank-you after teacher payout for a closed session. */
export function buildTeacherSettlementWhatsAppMessage(
  params: TeacherSettlementWhatsAppParams,
): string {
  const name = params.teacherName.trim() || 'الأستاذ';
  const center = params.centerName?.trim() || 'Success Center';
  const subject =
    params.subjectName?.trim() || params.title?.trim() || 'حصة';
  const date = params.sessionDate || '—';

  return [
    `مرحباً أ/ ${name}،`,
    '',
    `شكراً لحضرتك — تم تقفيل وتسوية الحصة في ${center} ✅`,
    '',
    `المادة: ${subject}`,
    `تاريخ الحصة: ${date}`,
    `عدد الحضور: ${params.attendanceCount}`,
    `إجمال المستحق لسيادتكم : ${money(params.teacherShare)} ج.م`,
    '',
    'مع تحيات إدارة السنتر 🌟',
  ].join('\n');
}
