'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  money,
  ReportPeriodBanner,
  ReportPrintArticle,
  ReportPrintBlock,
  ReportPrintFooter,
  ReportPrintHeader,
  ReportPrintShell,
  ReportStat,
  ReportStatsGrid,
  ReportTable,
} from '@/components/ReportPrintSheet';
import {
  parseRevenueSections,
  parseRevenueTab,
  REVENUE_TAB_LABELS,
  revenueSectionTitleFor,
  type RevenueSection,
  type RevenueTab,
} from '@/lib/revenue-print';

const PAY_STATUS: Record<string, string> = {
  CONFIRMED: 'مؤكد',
  PENDING_CONFIRM: 'بانتظار التأكيد',
  CANCELLED: 'ملغي',
};

const RENTAL_STATUS: Record<string, string> = {
  BOOKED: 'محجوز',
  CANCELLED: 'ملغي',
  COMPLETED: 'منتهي',
};

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ymdOf(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function inRange(value: string | null | undefined, from: string, to: string) {
  const d = ymdOf(value);
  if (!d) return false;
  return d >= from && d <= to;
}

function cashToLabel(to?: string) {
  if (to === 'OWNER') return 'صاحب السنتر';
  if (to === 'TEACHER_HOLD') return 'حساب المدرس';
  if (to === 'SAFE') return 'الخزنة';
  return 'الدرج';
}

function payMethodLabel(method?: string) {
  const m = String(method || '').toUpperCase();
  if (m.includes('VODAFONE')) return 'فودافون';
  return 'كاش';
}

function teacherName(t?: { firstName?: string; lastName?: string } | null) {
  if (!t?.firstName) return '—';
  const last = t.lastName && t.lastName !== '-' ? t.lastName : '';
  return `${t.firstName} ${last}`.trim();
}

function showSection(selected: RevenueSection[] | null, target: RevenueSection) {
  if (!selected?.length) return true;
  return selected.includes(target);
}

function docNo(tab: RevenueTab, from: string, to: string) {
  const prefix =
    tab === 'all' ? 'REV' : tab.slice(0, 3).toUpperCase();
  return `REV-${prefix}-${from.replace(/-/g, '')}-${to.replace(/-/g, '')}`;
}

export default function RevenuePrintPage() {
  return (
    <Suspense
      fallback={
        <p className="p-8 text-navy/50" dir="rtl">
          جاري تجهيز تقرير الإيرادات…
        </p>
      }
    >
      <RevenuePrintContent />
    </Suspense>
  );
}

function RevenuePrintContent() {
  const search = useSearchParams();
  const tab = parseRevenueTab(search.get('tab')) || 'all';
  const selected = parseRevenueSections(search.get('sections'), tab);
  const from = search.get('from') || monthStart();
  const to = search.get('to') || today();
  const autoPrint = search.get('print') === '1';

  const [data, setData] = useState<{
    offers: any[];
    onlineSales: any[];
    handouts: any[];
    handoutSales: any[];
    rentals: any[];
    inventory: {
      onlineByTeacher: any[];
      handoutsByTeacher: any[];
      summary: Record<string, number>;
    } | null;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<any[]>('/revenue/online/offers'),
      api<any[]>('/revenue/online/sales'),
      api<any[]>('/revenue/handouts'),
      api<any[]>('/revenue/handouts/sales'),
      api<any[]>('/revenue/rentals'),
      api<any>('/revenue/inventory-by-teacher'),
    ])
      .then(([offers, onlineSales, handouts, handoutSales, rentals, inventory]) =>
        setData({
          offers,
          onlineSales,
          handouts,
          handoutSales,
          rentals,
          inventory,
        }),
      )
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'فشل تحميل الإيرادات'),
      );
  }, []);

  useEffect(() => {
    if (!data || !autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [data, autoPrint]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const onlineSales = data.onlineSales.filter((s) =>
      inRange(s.confirmedAt || s.createdAt, from, to),
    );
    const handoutSales = data.handoutSales.filter((s) =>
      inRange(s.confirmedAt || s.createdAt, from, to),
    );
    const rentals = data.rentals.filter((r) =>
      inRange(r.confirmedAt || r.startsAt || r.createdAt, from, to),
    );
    return {
      offers: data.offers,
      onlineSales,
      handouts: data.handouts,
      handoutSales,
      rentals,
      inventory: data.inventory,
    };
  }, [data, from, to]);

  const printedAt = useMemo(
    () =>
      new Date().toLocaleString('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [data],
  );

  if (error) {
    return (
      <p className="p-8 text-red-600" dir="rtl">
        {error}
      </p>
    );
  }

  if (!filtered) {
    return (
      <p className="p-8 text-navy/50" dir="rtl">
        جاري تجهيز تقرير الإيرادات…
      </p>
    );
  }

  const number = docNo(tab, from, to);
  const onlineGross = filtered.onlineSales.reduce(
    (n, s) => n + Number(s.amount || 0),
    0,
  );
  const handoutGross = filtered.handoutSales.reduce(
    (n, s) => n + Number(s.amount || 0),
    0,
  );
  const rentalGross = filtered.rentals
    .filter((r) => r.status !== 'CANCELLED')
    .reduce((n, r) => n + Number(r.amount || 0), 0);

  return (
    <ReportPrintShell backHref="/revenue">
      <ReportPrintArticle>
        <ReportPrintHeader
          reportTitle={REVENUE_TAB_LABELS[tab]}
          sectionTitle={revenueSectionTitleFor(selected, tab)}
          from={from}
          to={to}
          printedAt={printedAt}
          docNo={number}
        />
        <ReportPeriodBanner from={from} to={to} />

        {showSection(selected, 'summary') ? (
          <ReportPrintBlock title="ملخص الإيرادات">
            <ReportStatsGrid>
              <ReportStat
                label="عروض أونلاين"
                value={String(filtered.offers.length)}
                tone="gold"
              />
              <ReportStat
                label="مبيعات أونلاين"
                value={`${filtered.onlineSales.length} · ${money(onlineGross)}`}
              />
              <ReportStat
                label="ملازم (كتالوج)"
                value={String(filtered.handouts.length)}
              />
              <ReportStat
                label="مبيعات ملازم"
                value={`${filtered.handoutSales.length} · ${money(handoutGross)}`}
              />
            </ReportStatsGrid>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ReportStat
                label="تأجير قاعات"
                value={`${filtered.rentals.filter((r) => r.status !== 'CANCELLED').length} · ${money(rentalGross)}`}
              />
              <ReportStat
                label="إجمالي المبيعات"
                value={money(onlineGross + handoutGross + rentalGross)}
                tone="emerald"
              />
            </div>
          </ReportPrintBlock>
        ) : null}

        {showSection(selected, 'offers') ? (
          <ReportPrintBlock title="عروض أونلاين">
            <ReportTable
              headers={[
                'العرض',
                'المدرس',
                'السعر',
                'أكواد',
                'مباع',
                'باقي',
                'الحالة',
              ]}
              rows={filtered.offers.map((o) => {
                const inv = filtered.inventory?.onlineByTeacher
                  .flatMap((t) => t.offers)
                  .find((x: any) => x.id === o.id);
                const total = inv?.totalCodes ?? o._count?.codes ?? 0;
                const sold = inv?.sold ?? o._count?.sales ?? 0;
                const remaining = inv?.remaining ?? Math.max(0, total - sold);
                return [
                  o.title,
                  teacherName(o.teacher),
                  money(o.price),
                  String(total),
                  String(sold),
                  String(remaining),
                  o.isActive ? 'نشط' : 'متوقف',
                ];
              })}
              empty="لا عروض"
            />
          </ReportPrintBlock>
        ) : null}

        {showSection(selected, 'online-by-teacher') &&
        filtered.inventory?.onlineByTeacher?.length ? (
          <>
            <ReportPrintBlock title="ملخص أكواد أونلاين حسب المدرس">
              <ReportTable
                headers={[
                  'المدرس',
                  'عروض',
                  'إجمالي أكواد',
                  'مباع',
                  'باقي',
                ]}
                rows={filtered.inventory.onlineByTeacher.map((t: any) => [
                  t.name,
                  String(t.offersCount),
                  String(t.totalCodes),
                  String(t.sold),
                  String(t.remaining),
                ])}
                empty="لا بيانات"
              />
            </ReportPrintBlock>
            {filtered.inventory.onlineByTeacher.map((t: any) => (
              <ReportPrintBlock
                key={t.teacherId}
                title={`${t.name} · ${t.totalCodes} كود · مباع ${t.sold} · باقي ${t.remaining}`}
              >
                <ReportTable
                  headers={['العرض', 'السعر', 'أكواد', 'مباع', 'باقي', 'الحالة']}
                  rows={(t.offers || []).map((o: any) => [
                    o.title,
                    money(o.price),
                    String(o.totalCodes),
                    String(o.sold),
                    String(o.remaining),
                    o.isActive ? 'نشط' : 'متوقف',
                  ])}
                  empty="لا عروض"
                />
              </ReportPrintBlock>
            ))}
          </>
        ) : showSection(selected, 'online-by-teacher') ? (
          <ReportPrintBlock title="أكواد أونلاين حسب المدرس">
            <p className="px-4 py-6 text-center text-sm text-[#0B2545]/40">
              لا عروض أونلاين
            </p>
          </ReportPrintBlock>
        ) : null}

        {showSection(selected, 'online-sales') ? (
          <ReportPrintBlock title="مبيعات الأونلاين">
            <ReportTable
              headers={[
                'التاريخ',
                'العرض',
                'الكود',
                'المشتري',
                'المبلغ',
                'مدرس',
                'سنتر',
                'الدفع',
                'الوجهة',
                'الحالة',
              ]}
              rows={filtered.onlineSales.map((s) => [
                ymdOf(s.confirmedAt || s.createdAt),
                s.offer?.title || '—',
                s.code?.code || '—',
                s.buyerName || s.buyerPhone || '—',
                money(s.amount),
                money(s.teacherShare),
                money(s.centerShare),
                payMethodLabel(s.method),
                cashToLabel(s.cashTo),
                PAY_STATUS[s.payStatus] || s.payStatus,
              ])}
              empty="لا مبيعات أونلاين في الفترة"
            />
          </ReportPrintBlock>
        ) : null}

        {showSection(selected, 'handout-products') ? (
          <ReportPrintBlock title="كتالوج الملازم">
            <ReportTable
              headers={[
                'الملزمة',
                'المدرس',
                'السعر',
                'إجمالي',
                'مباع',
                'باقي',
                'الحالة',
              ]}
              rows={filtered.handouts.map((h) => {
                const inv = filtered.inventory?.handoutsByTeacher
                  .flatMap((t: any) => t.products)
                  .find((x: any) => x.id === h.id);
                const sold = inv?.sold ?? h._count?.sales ?? 0;
                const remaining = inv?.stock ?? h.stock ?? 0;
                const total = inv?.totalCopies ?? remaining + sold;
                return [
                  h.title,
                  teacherName(h.teacher),
                  money(h.price),
                  String(total),
                  String(sold),
                  String(remaining),
                  h.isActive ? 'نشط' : 'متوقف',
                ];
              })}
              empty="لا ملازم"
            />
          </ReportPrintBlock>
        ) : null}

        {showSection(selected, 'handouts-by-teacher') &&
        filtered.inventory?.handoutsByTeacher?.length ? (
          <>
            <ReportPrintBlock title="ملخص الملازم حسب المدرس">
              <ReportTable
                headers={[
                  'المدرس',
                  'منتجات',
                  'إجمالي نسخ',
                  'مباع',
                  'باقي',
                ]}
                rows={filtered.inventory.handoutsByTeacher.map((t: any) => [
                  t.name,
                  String(t.productsCount),
                  String(t.totalCopies),
                  String(t.sold),
                  String(t.remaining),
                ])}
                empty="لا بيانات"
              />
            </ReportPrintBlock>
            {filtered.inventory.handoutsByTeacher.map((t: any) => (
              <ReportPrintBlock
                key={t.teacherId}
                title={`${t.name} · ${t.totalCopies} نسخة · مباع ${t.sold} · باقي ${t.remaining}`}
              >
                <ReportTable
                  headers={[
                    'الملزمة',
                    'السعر',
                    'إجمالي',
                    'مباع',
                    'باقي',
                    'الحالة',
                  ]}
                  rows={(t.products || []).map((p: any) => [
                    p.title,
                    money(p.price),
                    String(p.totalCopies),
                    String(p.sold),
                    String(p.stock),
                    p.isActive ? 'نشط' : 'متوقف',
                  ])}
                  empty="لا ملازم"
                />
              </ReportPrintBlock>
            ))}
          </>
        ) : showSection(selected, 'handouts-by-teacher') ? (
          <ReportPrintBlock title="ملازم حسب المدرس">
            <p className="px-4 py-6 text-center text-sm text-[#0B2545]/40">
              لا ملازم
            </p>
          </ReportPrintBlock>
        ) : null}

        {showSection(selected, 'handout-sales') ? (
          <ReportPrintBlock title="مبيعات الملازم">
            <ReportTable
              headers={[
                'التاريخ',
                'الملزمة',
                'الكمية',
                'المبلغ',
                'مدرس',
                'سنتر',
                'الدفع',
                'الوجهة',
                'الإيصال',
                'الحالة',
              ]}
              rows={filtered.handoutSales.map((s) => [
                ymdOf(s.confirmedAt || s.createdAt),
                s.product?.title || '—',
                String(s.qty),
                money(s.amount),
                money(s.teacherShare),
                money(s.centerShare),
                payMethodLabel(s.method),
                cashToLabel(s.cashTo),
                s.receiptNumber || '—',
                PAY_STATUS[s.payStatus] || s.payStatus,
              ])}
              empty="لا مبيعات ملازم في الفترة"
            />
          </ReportPrintBlock>
        ) : null}

        {showSection(selected, 'rentals') ? (
          <ReportPrintBlock title="تأجير القاعات">
            <ReportTable
              headers={[
                'من',
                'إلى',
                'القاعة',
                'المستأجر',
                'المبلغ',
                'الدفع',
                'الوجهة',
                'الحالة',
                'الإيصال',
              ]}
              rows={filtered.rentals.map((r) => [
                ymdOf(r.startsAt),
                ymdOf(r.endsAt),
                r.classroom?.name || '—',
                `${r.renterName}${r.renterPhone ? ` · ${r.renterPhone}` : ''}`,
                money(r.amount),
                payMethodLabel(r.method),
                cashToLabel(r.cashTo),
                RENTAL_STATUS[r.status] || r.status,
                r.receiptNumber || '—',
              ])}
              empty="لا حجوزات قاعات في الفترة"
            />
          </ReportPrintBlock>
        ) : null}

        <ReportPrintFooter docNo={number} printedAt={printedAt} />
      </ReportPrintArticle>
    </ReportPrintShell>
  );
}
