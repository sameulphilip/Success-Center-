export type RevenueTab = 'online' | 'handouts' | 'rooms' | 'all';

export type RevenueSection =
  | 'summary'
  | 'offers'
  | 'online-sales'
  | 'online-by-teacher'
  | 'handout-products'
  | 'handout-sales'
  | 'handouts-by-teacher'
  | 'rentals';

export const REVENUE_TAB_LABELS: Record<RevenueTab, string> = {
  online: 'تقرير أونلاين',
  handouts: 'تقرير الملازم',
  rooms: 'تقرير القاعات',
  all: 'تقرير الإيرادات الكامل',
};

export const REVENUE_SECTION_LABELS: Record<RevenueSection, string> = {
  summary: 'الملخص',
  offers: 'عروض أونلاين',
  'online-sales': 'مبيعات الأونلاين',
  'online-by-teacher': 'أكواد أونلاين حسب المدرس',
  'handout-products': 'الملازم (كتالوج)',
  'handout-sales': 'مبيعات الملازم',
  'handouts-by-teacher': 'ملازم حسب المدرس',
  rentals: 'تأجير القاعات',
};

export const REVENUE_TAB_SECTIONS: Record<RevenueTab, RevenueSection[]> = {
  online: ['summary', 'offers', 'online-by-teacher', 'online-sales'],
  handouts: ['summary', 'handout-products', 'handouts-by-teacher', 'handout-sales'],
  rooms: ['summary', 'rentals'],
  all: [
    'summary',
    'offers',
    'online-by-teacher',
    'online-sales',
    'handout-products',
    'handouts-by-teacher',
    'handout-sales',
    'rentals',
  ],
};

export function revenuePrintHref(
  tab: RevenueTab,
  from: string,
  to: string,
  sections?: RevenueSection[],
) {
  const q = new URLSearchParams({ tab, from, to, print: '1' });
  if (sections?.length) {
    q.set('sections', sections.join(','));
  }
  return `/revenue/print?${q.toString()}`;
}

export function parseRevenueTab(value: string | null): RevenueTab | null {
  if (
    value === 'online' ||
    value === 'handouts' ||
    value === 'rooms' ||
    value === 'all'
  ) {
    return value;
  }
  return null;
}

export function parseRevenueSections(
  sectionsParam: string | null,
  tab: RevenueTab | null,
): RevenueSection[] | null {
  if (sectionsParam) {
    const list = sectionsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is RevenueSection => s in REVENUE_SECTION_LABELS);
    return list.length ? list : null;
  }
  return tab ? [...REVENUE_TAB_SECTIONS[tab]] : null;
}

export function revenueSectionTitleFor(
  selected: RevenueSection[] | null,
  tab: RevenueTab,
): string | undefined {
  if (!selected?.length) return undefined;
  const allowed = REVENUE_TAB_SECTIONS[tab];
  const allSelected =
    allowed.length === selected.length &&
    allowed.every((s) => selected.includes(s));
  if (allSelected) return undefined;
  if (selected.length === 1) return REVENUE_SECTION_LABELS[selected[0]];
  return selected.map((s) => REVENUE_SECTION_LABELS[s]).join(' · ');
}
