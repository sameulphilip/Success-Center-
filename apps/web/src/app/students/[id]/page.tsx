'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  AlertBanner,
  EmptyState,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api } from '@/lib/api';

const STATUS_AR: Record<string, string> = {
  PRESENT: 'حاضر',
  ABSENT: 'غائب',
  LATE: 'متأخر',
  EXCUSED: 'بعذر',
};

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const [student, setStudent] = useState<any>(null);
  const [qr, setQr] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api(`/students/${params.id}`),
      api(`/qr/students/${params.id}`),
    ])
      .then(([s, q]) => {
        setStudent(s);
        setQr(q);
      })
      .catch((e) => setError(e.message));
  }, [params.id]);

  const present =
    student?.attendance?.filter(
      (a: any) => a.status === 'PRESENT' || a.status === 'LATE',
    ).length || 0;
  const absent =
    student?.attendance?.filter((a: any) => a.status === 'ABSENT').length || 0;

  return (
    <AppShell>
      <PageHeader
        title={
          student
            ? `${student.firstName} ${student.lastName}`
            : 'ملف الطالب'
        }
        subtitle="سجل كامل: مجموعات، حضور، درجات، مدفوعات"
        action={
          <a
            href={`/students/${params.id}/card`}
            className="btn-accent"
            target="_blank"
            rel="noreferrer"
          >
            طباعة الكارت
          </a>
        }
      />
      {error ? <AlertBanner>{error}</AlertBanner> : null}
      {!student ? (
        <p className="text-navy/50">جاري التحميل...</p>
      ) : (
        <>
          <PageHero
            eyebrow="STUDENT FILE"
            title={`${student.firstName} ${student.lastName}`}
            subtitle={`${student.gradeLevel?.nameAr || '—'} · ${student.studentUid}`}
            metrics={[
              {
                label: 'استمارة الحجز',
                value: student.formFeePaid ? 'مدفوعة' : 'غير مدفوعة',
                highlight: !!student.formFeePaid,
              },
              { label: 'مجموعات', value: student.enrollments?.length || 0 },
              { label: 'حضور', value: present },
              { label: 'غياب', value: absent },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <SectionCard title="البيانات">
                <div className="grid sm:grid-cols-2 gap-3 text-sm text-navy/80">
                  <p>
                    <span className="text-navy/45">الهاتف:</span>{' '}
                    {student.phone || '—'}
                  </p>
                  <p>
                    <span className="text-navy/45">البريد:</span>{' '}
                    {student.email || '—'}
                  </p>
                  <p>
                    <span className="text-navy/45">الصف:</span>{' '}
                    {student.gradeLevel?.nameAr || '—'}
                  </p>
                  <p className="font-mono text-xs text-navy/50 sm:col-span-2">
                    UID: {student.studentUid}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-navy/45">أولياء الأمور:</span>{' '}
                    {student.parents
                      ?.map(
                        (p: any) =>
                          `${p.parent.firstName} ${p.parent.lastName} (${p.parent.phone})`,
                      )
                      .join('، ') || '—'}
                  </p>
                </div>
              </SectionCard>

              <SectionCard
                title="استمارة الحجز"
                subtitle="حالة دفع استمارة التسجيل في السنتر"
                badge={
                  student.formFeePaid ? (
                    <span className="badge-ok">تم الدفع</span>
                  ) : (
                    <span className="badge-warn">غير مدفوعة</span>
                  )
                }
              >
                {(student.bookingSubmissions || []).length ? (
                  <ul className="space-y-3 text-sm">
                    {student.bookingSubmissions.map((b: any) => (
                      <li
                        key={b.id}
                        className="rounded-xl border border-mist bg-sand/60 px-3 py-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-navy">
                              {b.form?.title || 'استمارة حجز'}
                            </p>
                            <p className="text-xs text-navy/50 mt-0.5">
                              {b.form?.gradeLabel || '—'}
                              {b.form?.academicYear
                                ? ` · ${b.form.academicYear}`
                                : ''}
                            </p>
                          </div>
                          <span
                            className={
                              b.status === 'PAID'
                                ? 'badge-ok'
                                : b.status === 'CANCELLED'
                                  ? 'badge-warn'
                                  : 'badge-navy'
                            }
                          >
                            {b.status === 'PAID'
                              ? 'مدفوعة'
                              : b.status === 'CANCELLED'
                                ? 'ملغاة'
                                : 'بانتظار الدفع'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy/65">
                          <span>
                            المبلغ:{' '}
                            <strong className="tabular-nums text-navy">
                              {Number(b.totalAmount || 0).toLocaleString(
                                'en-EG',
                              )}{' '}
                              ج.م
                            </strong>
                          </span>
                          {b.receiptNumber ? (
                            <span className="font-mono">
                              إيصال: {b.receiptNumber}
                            </span>
                          ) : null}
                          {b.paidAt ? (
                            <span>
                              تاريخ الدفع:{' '}
                              {new Date(b.paidAt).toLocaleDateString('ar-EG')}
                            </span>
                          ) : null}
                          {b.paymentMethod ? (
                            <span>
                              الطريقة:{' '}
                              {b.paymentMethod === 'VODAFONE_CASH'
                                ? 'فودافون كاش'
                                : 'كاش'}
                              {b.vodafoneTxn ? ` · ${b.vodafoneTxn}` : ''}
                            </span>
                          ) : null}
                        </div>
                        {b.selections?.length ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {b.selections.map((sel: any, i: number) => (
                              <span
                                key={i}
                                className="rounded-lg bg-white border border-mist px-2 py-0.5 text-[11px] text-navy/80"
                                title={sel.offering?.subjectName}
                              >
                                {sel.offering?.teacherName}
                                {sel.offering?.isOnline ? ' · Online' : ''}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState>لا توجد استمارة حجز مرتبطة بهذا الطالب</EmptyState>
                )}
              </SectionCard>

              <SectionCard title="المجموعات">
                <ul className="space-y-2 text-sm">
                  {student.enrollments?.map((e: any) => (
                    <li key={e.id} className="rounded-xl bg-sand px-3 py-2.5">
                      <p className="font-semibold text-navy">
                        {e.group.subject.nameEn} — {e.group.name}
                      </p>
                      <p className="text-xs text-navy/50 mt-1">
                        المدرس: {e.group.teacher.firstName}{' '}
                        {e.group.teacher.lastName}
                      </p>
                    </li>
                  ))}
                  {!student.enrollments?.length ? (
                    <EmptyState>لا توجد مجموعات</EmptyState>
                  ) : null}
                </ul>
              </SectionCard>

              <SectionCard title="الإيصالات">
                <ul className="space-y-2 text-sm">
                  {(student.payments || []).map((p: any) => (
                    <li
                      key={p.id}
                      className="flex justify-between gap-3 rounded-xl border border-mist px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-navy truncate">
                          {p.note ||
                            (String(p.receiptNumber || '').startsWith('BK-')
                              ? 'استمارة حجز'
                              : 'تحصيل')}
                        </p>
                        <p className="text-[11px] font-mono text-navy/45 mt-0.5">
                          {p.receiptNumber}
                          {p.paidAt
                            ? ` · ${new Date(p.paidAt).toLocaleDateString('ar-EG')}`
                            : ''}
                        </p>
                      </div>
                      <span className="font-bold tabular-nums shrink-0">
                        {Number(p.amount).toLocaleString('en-EG')}
                      </span>
                    </li>
                  ))}
                  {!student.payments?.length ? (
                    <EmptyState>لا توجد إيصالات</EmptyState>
                  ) : null}
                </ul>
              </SectionCard>

              <SectionCard title="آخر الحضور">
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>المجموعة</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.attendance?.slice(0, 15).map((a: any) => (
                        <tr key={a.id}>
                          <td>
                            {String(a.session?.sessionDate || '').slice(0, 10)}
                          </td>
                          <td>{a.session?.group?.name}</td>
                          <td>
                            <span
                              className={
                                a.status === 'ABSENT'
                                  ? 'badge-danger'
                                  : 'badge-ok'
                              }
                            >
                              {STATUS_AR[a.status] || a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!student.attendance?.length ? (
                    <EmptyState>لا يوجد حضور</EmptyState>
                  ) : null}
                </div>
              </SectionCard>
            </div>

            <aside className="space-y-4">
              <SectionCard title="كارت الطالب" subtitle="QR + NFC">
                <div className="text-center">
                  {qr?.qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr.qrDataUrl}
                      alt="Student QR"
                      className="mx-auto rounded-xl border border-mist bg-white p-2"
                    />
                  ) : null}
                  <p className="mt-2 text-xs text-navy/45 break-all font-mono">
                    {qr?.studentUid}
                  </p>
                  {qr?.nfcText ? (
                    <p className="mt-2 text-xs text-navy/60 break-all">
                      NFC: <span className="font-mono">{qr.nfcText}</span>
                    </p>
                  ) : null}
                  <a
                    href={`/students/${params.id}/card`}
                    className="btn-accent mt-4 inline-flex w-full"
                    target="_blank"
                    rel="noreferrer"
                  >
                    طباعة كارت QR + NFC
                  </a>
                </div>
              </SectionCard>
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
}
