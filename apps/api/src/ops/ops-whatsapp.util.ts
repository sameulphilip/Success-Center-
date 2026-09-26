export type TeacherSettlementWhatsAppParams = {
  teacherName: string;
  sessionDate: string;
  subjectName?: string | null;
  title?: string | null;
  attendanceCount: number;
  teacherShare: number;
  centerShare?: number;
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

  const lines = [
    `مرحباً أ/ ${name}،`,
    '',
    `شكراً لحضرتك — تم تقفيل وتسوية الحصة في ${center} ✅`,
    '',
    `المادة: ${subject}`,
    `تاريخ الحصة: ${date}`,
    `عدد الحضور: ${params.attendanceCount}`,
    `نصيب حضرتك: ${money(params.teacherShare)} ج.م`,
  ];

  if (params.centerShare != null && Number.isFinite(params.centerShare)) {
    lines.push(`نصيب السنتر: ${money(params.centerShare)} ج.م`);
  }

  lines.push('', 'مع تحيات إدارة السنتر 🌟');

  return lines.join('\n');
}
