'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, PageHero, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';

const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function CalendarPage() {
  const [slots, setSlots] = useState<any[]>([]);

  useEffect(() => {
    api<any[]>('/groups/calendar/all').then(setSlots).catch(console.error);
  }, []);

  const today = new Date().getDay();
  const teachers = useMemo(
    () => new Set(slots.map((s) => s.group?.teacherId || s.group?.teacher?.id)).size,
    [slots],
  );
  const rooms = useMemo(
    () =>
      new Set(
        slots.map(
          (s) => s.classroom?.name || s.group?.classroom?.name || '',
        ),
      ).size,
    [slots],
  );

  return (
    <AppShell>
      <PageHeader
        title="جدول السنتر"
        subtitle="اعرف أي قاعة أو مدرس مشغول في أي وقت"
      />
      <PageHero
        eyebrow="CALENDAR"
        title="الجدول الأسبوعي"
        subtitle="عرض كل الحصص حسب اليوم مع المدرس والقاعة"
        metrics={[
          { label: 'الحصص', value: slots.length, highlight: true },
          { label: 'اليوم', value: days[today] },
          { label: 'مدرسون', value: teachers },
          { label: 'قاعات', value: rooms },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {days.map((dayName, day) => {
          const daySlots = slots
            .filter((s) => s.dayOfWeek === day)
            .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
          const isToday = day === today;

          return (
            <SectionCard
              key={day}
              title={dayName}
              subtitle={`${daySlots.length} حصة`}
              badge={
                isToday ? <span className="badge-gold">اليوم</span> : undefined
              }
              className={isToday ? 'ring-2 ring-gold/40' : ''}
            >
              <div className="space-y-2 min-h-[120px]">
                {daySlots.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-mist bg-sand/70 p-3 text-sm"
                  >
                    <p className="font-bold text-navy">
                      {s.startTime} – {s.endTime}
                    </p>
                    <p className="mt-1 text-navy/80">
                      {s.group?.subject?.nameEn || s.group?.subject?.nameAr} /{' '}
                      {s.group?.name}
                    </p>
                    <p className="text-xs text-navy/50 mt-1">
                      {s.group?.teacher?.firstName} ·{' '}
                      {s.classroom?.name || s.group?.classroom?.name || '—'}
                    </p>
                  </div>
                ))}
                {!daySlots.length ? <EmptyState>لا حصص</EmptyState> : null}
              </div>
            </SectionCard>
          );
        })}
      </div>
    </AppShell>
  );
}
