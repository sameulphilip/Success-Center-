export type ReportTab = 'profit' | 'finance' | 'bookings' | 'teachers';

export type ReportSection =
  | 'summary'
  | 'by-teacher'
  | 'by-subject'
  | 'by-room'
  | 'recent-sessions'
  | 'payments'
  | 'by-form'
  | 'paid'
  | 'teachers-sessions';

export const TAB_LABELS: Record<ReportTab, string> = {
  profit: 'تقرير الربحية',
  finance: 'التقرير المالي',
  bookings: 'تقرير الاستمارات',
  teachers: 'تقرير المدرسين',
};

export const SECTION_LABELS: Record<ReportSection, string> = {
  summary: 'الملخص',
  'by-teacher': 'حسب المدرس',
  'by-subject': 'حسب المادة',
  'by-room': 'حسب القاعة',
  'recent-sessions': 'آخر الحصص المقفلة',
  payments: 'المدفوعات',
  'by-form': 'حسب الاستمارة',
  paid: 'الاستمارات المدفوعة',
  'teachers-sessions': 'المدرسين والجلسات',
};

/** أقسام كل تبويب — للتحكم في الطباعة */
export const TAB_SECTIONS: Record<ReportTab, ReportSection[]> = {
  profit: [
    'summary',
    'by-teacher',
    'by-subject',
    'by-room',
    'recent-sessions',
  ],
  finance: ['summary', 'payments'],
  bookings: ['summary', 'by-form', 'paid'],
  teachers: ['summary', 'teachers-sessions'],
};

export function reportPrintHref(
  tab: ReportTab,
  from: string,
  to: string,
  sections?: ReportSection[],
  options?: { hideCollected?: boolean },
) {
  const q = new URLSearchParams({ tab, from, to, print: '1' });
  if (sections?.length) {
    q.set('sections', sections.join(','));
  }
  if (options?.hideCollected) {
    q.set('hideCollected', '1');
  }
  return `/reports/print?${q.toString()}`;
}

export function parseReportTab(value: string | null): ReportTab | null {
  if (
    value === 'profit' ||
    value === 'finance' ||
    value === 'bookings' ||
    value === 'teachers'
  ) {
    return value;
  }
  return null;
}

export function parseReportSection(
  value: string | null,
): ReportSection | null {
  if (!value) return null;
  return value in SECTION_LABELS ? (value as ReportSection) : null;
}

/** من `sections=a,b` أو القديم `section=a` — null = كل الأقسام */
export function parseReportSections(
  sectionsParam: string | null,
  sectionParam: string | null,
  tab: ReportTab | null,
): ReportSection[] | null {
  if (sectionsParam) {
    const list = sectionsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is ReportSection => s in SECTION_LABELS);
    return list.length ? list : null;
  }
  const one = parseReportSection(sectionParam);
  if (one) return [one];
  return tab ? [...TAB_SECTIONS[tab]] : null;
}

export function sectionTitleFor(
  selected: ReportSection[] | null,
  tab: ReportTab,
): string | undefined {
  if (!selected?.length) return undefined;
  const allowed = TAB_SECTIONS[tab];
  const allSelected =
    allowed.length === selected.length &&
    allowed.every((s) => selected.includes(s));
  if (allSelected) return undefined;
  if (selected.length === 1) return SECTION_LABELS[selected[0]];
  return selected.map((s) => SECTION_LABELS[s]).join(' · ');
}
