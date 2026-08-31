'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { AppDialog, type DialogTone } from '@/components/AppDialog';
import { EmptyState, PageHero, SectionCard } from '@/components/ui';
import { TablePager, usePaged } from '@/components/TablePager';
import { api, getStoredUser, openFileInTab } from '@/lib/api';

type Transfer = {
  id: string;
  formSerial?: number | null;
  studentName: string;
  studentPhone: string;
  parentPhone: string;
  status: 'SUBMITTED' | 'PAID' | 'CANCELLED';
  amount: number;
  paymentMethod?: string | null;
  vodafoneTxn?: string | null;
  receiptNumber?: string | null;
  paidAt?: string | null;
  createdAt: string;
  hasTransferProof?: boolean;
  form?: {
    id: string;
    title: string;
    gradeLabel: string;
    slug: string;
    whatsappGroupLink?: string | null;
  } | null;
};

type WalletPack = {
  totals: {
    confirmedAmount: number;
    pendingAmount: number;
    claimedAmount?: number;
    availableAmount?: number;
    totalAmount: number;
    confirmedCount: number;
    pendingCount: number;
    claimedCount?: number;
    count: number;
  };
  transfers: Transfer[];
  claims?: Array<{
    id: string;
    amount: string | number;
    note?: string | null;
    createdAt: string;
  }>;
};

const methodLabel: Record<string, string> = {
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'InstaPay',
};

function money(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString('en-EG')} ج.م`;
}

export default function OnlineWalletPage() {
  const me = getStoredUser();
  const isAdmin = me?.role === 'SUPER_ADMIN';
  const canClaim =
    me?.role === 'SUPER_ADMIN' || me?.role === 'CENTER_MANAGER';
  const [pack, setPack] = useState<WalletPack | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [busy, setBusy] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimNote, setClaimNote] = useState('');
  const [dialog, setDialog] = useState<{
    title?: string;
    message: string;
    tone?: DialogTone;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  } | null>(null);

  async function load() {
    const data = await api<WalletPack>('/booking/online-wallet');
    setPack(data);
  }

  useEffect(() => {
    load().catch((e) =>
      setDialog({
        message: e instanceof Error ? e.message : 'تعذر تحميل المحفظة',
        tone: 'error',
        confirmLabel: 'حسناً',
      }),
    );
  }, []);

  const rows = useMemo(() => {
    const list = pack?.transfers || [];
    if (filter === 'pending') return list.filter((t) => t.status === 'SUBMITTED');
    if (filter === 'confirmed') return list.filter((t) => t.status === 'PAID');
    return list.filter((t) => t.status !== 'CANCELLED');
  }, [pack, filter]);

  const paged = usePaged(rows, filter);

  async function confirmTransfer(t: Transfer) {
    setBusy(t.id);
    try {
      const res = await api<{
        receiptNumber?: string;
        portalAccount?: { phone: string } | null;
      }>(`/booking/submissions/${t.id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({
          method: t.paymentMethod,
          vodafoneTxn: t.vodafoneTxn,
        }),
      });
      await load();
      setDialog({
        message: `تم تأكيد تحويل ${t.studentName} — هتتبعت رسالة واتساب للطالب تلقائياً`,
        tone: 'success',
        title: 'تم التأكيد',
        confirmLabel: 'حسناً',
      });
    } catch (err: any) {
      setDialog({
        message: err.message || 'فشل التأكيد',
        tone: 'error',
        confirmLabel: 'حسناً',
      });
    } finally {
      setBusy('');
    }
  }

  async function cancelTransfer(t: Transfer) {
    setBusy(`cancel-${t.id}`);
    try {
      await api(`/booking/submissions/${t.id}/cancel`, { method: 'POST' });
      await load();
      setDialog({
        message: `تم إلغاء استمارة ${t.studentName}`,
        tone: 'success',
        title: 'تم الإلغاء',
        confirmLabel: 'حسناً',
      });
    } catch (err: any) {
      setDialog({
        message: err.message || 'فشل الإلغاء',
        tone: 'error',
        confirmLabel: 'حسناً',
      });
    } finally {
      setBusy('');
    }
  }

  async function deleteTransfer(t: Transfer) {
    setBusy(`del-${t.id}`);
    try {
      await api(`/booking/submissions/${t.id}`, { method: 'DELETE' });
      await load();
      setDialog({
        message: `تم مسح استمارة ${t.studentName}`,
        tone: 'success',
        title: 'تم المسح',
        confirmLabel: 'حسناً',
      });
    } catch (err: any) {
      setDialog({
        message: err.message || 'فشل المسح',
        tone: 'error',
        confirmLabel: 'حسناً',
      });
    } finally {
      setBusy('');
    }
  }

  async function claimToOwner(all = false) {
    const available = Number(pack?.totals?.availableAmount ?? 0);
    if (available <= 0) {
      setDialog({
        message: 'مفيش رصيد متاح للتحويل',
        tone: 'error',
        confirmLabel: 'حسناً',
      });
      return;
    }
    const amount = all ? available : Number(claimAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDialog({
        message: 'اكتب مبلغ صالح',
        tone: 'error',
        confirmLabel: 'حسناً',
      });
      return;
    }
    setDialog({
      title: 'تحويل لحساب صاحب السنتر',
      message: `تحويل ${money(amount)} من المحفظة الإلكترونية لحساب صاحب السنتر؟`,
      tone: 'info',
      confirmLabel: 'تأكيد التحويل',
      cancelLabel: 'رجوع',
      onConfirm: () => {
        setDialog(null);
        void (async () => {
          setBusy('claim');
          try {
            const res = await api<{
              ownerBalance: number;
              availableAfter: number;
            }>('/finance/cash/online-wallet/claim', {
              method: 'POST',
              body: JSON.stringify({
                amount,
                note: claimNote.trim() || undefined,
              }),
            });
            setClaimAmount('');
            setClaimNote('');
            await load();
            setDialog({
              title: 'تم التحويل',
              message: `اتحوّل ${money(amount)} لحساب صاحب السنتر.\nالرصيد المتاح دلوقتي ${money(res.availableAfter)} · حساب صاحب السنتر ${money(res.ownerBalance)}`,
              tone: 'success',
              confirmLabel: 'حسناً',
            });
          } catch (err: any) {
            setDialog({
              message: err.message || 'فشل التحويل',
              tone: 'error',
              confirmLabel: 'حسناً',
            });
          } finally {
            setBusy('');
          }
        })();
      },
    });
  }

  const totals = pack?.totals;
  const available = Number(totals?.availableAmount ?? totals?.confirmedAmount ?? 0);
  const claimed = Number(totals?.claimedAmount ?? 0);

  return (
    <AppShell>
      <PageHeader
        title="محفظة تحويل إلكتروني"
        subtitle="كل تحويلات استمارات الأونلاين — فودافون كاش و InstaPay"
        action={
          <Link href="/bookings" className="btn-ghost">
            رجوع للحجز
          </Link>
        }
      />

      <PageHero
        eyebrow="E-WALLET"
        title="محفظة التحويل الإلكتروني"
        subtitle="المبالغ دي مش في الدرج. دي تحويلات الاستمارة الأونلاين بعد ما الطالب يحوّل."
        metrics={[
          {
            label: 'متاح للتحويل',
            value: money(available),
            highlight: true,
          },
          {
            label: 'مؤكد إجمالي',
            value: money(totals?.confirmedAmount ?? 0),
          },
          {
            label: 'اتحوّل لصاحب السنتر',
            value: money(claimed),
          },
          {
            label: 'بانتظار التأكيد',
            value: money(totals?.pendingAmount ?? 0),
          },
        ]}
      />

      {canClaim ? (
        <SectionCard
          className="mb-4"
          title="تحويل لحساب صاحب السنتر"
          subtitle="الرصيد المتاح من التحويلات المؤكدة يدخل حساب صاحب السنتر"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-navy/50">
              المبلغ
              <input
                className="field mt-1"
                type="number"
                min={0}
                step="1"
                placeholder={String(Math.round(available) || '')}
                value={claimAmount}
                onChange={(e) => setClaimAmount(e.target.value)}
              />
            </label>
            <label className="text-xs text-navy/50 sm:col-span-2">
              ملاحظة
              <input
                className="field mt-1"
                value={claimNote}
                onChange={(e) => setClaimNote(e.target.value)}
                placeholder="تحويل أسبوعي · فودافون"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy === 'claim' || available <= 0}
              onClick={() => void claimToOwner(false)}
            >
              تحويل المبلغ
            </button>
            <button
              type="button"
              className="btn-accent"
              disabled={busy === 'claim' || available <= 0}
              onClick={() => void claimToOwner(true)}
            >
              تحويل كل المتاح ({money(available)})
            </button>
          </div>
          {pack?.claims?.length ? (
            <ul className="mt-4 space-y-2 text-sm">
              {pack.claims.slice(0, 8).map((c) => (
                <li
                  key={c.id}
                  className="flex justify-between gap-3 rounded-xl bg-sand px-3 py-2"
                >
                  <span>
                    تحويل لحساب صاحب السنتر
                    {c.note ? (
                      <span className="text-navy/45"> · {c.note}</span>
                    ) : null}
                    <span className="block text-[11px] text-navy/40 mt-0.5">
                      {new Date(c.createdAt).toLocaleString('ar-EG')}
                    </span>
                  </span>
                  <span className="font-extrabold tabular-nums text-navy">
                    {money(Number(c.amount))}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['all', 'الكل'],
            ['pending', 'بانتظار التأكيد'],
            ['confirmed', 'مؤكد'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={filter === id ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <SectionCard title="التحويلات">
        <div className="space-y-3 md:hidden">
          {paged.slice.map((t) => (
            <article
              key={t.id}
              className="rounded-xl border border-amber-200 bg-white p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-navy">{t.studentName}</p>
                  <p className="text-[11px] text-navy/45">
                    {t.form?.gradeLabel || t.form?.title}
                    {t.formSerial != null ? ` · م ${t.formSerial}` : ''}
                  </p>
                </div>
                <span
                  className={
                    t.status === 'PAID' ? 'badge-ok' : 'badge-navy'
                  }
                >
                  {t.status === 'PAID' ? 'مؤكد' : 'بانتظار التأكيد'}
                </span>
              </div>
              <p className="font-extrabold tabular-nums text-navy">
                {money(t.amount)}
              </p>
              <p className="text-xs text-amber-900 font-semibold">
                {methodLabel[t.paymentMethod || ''] || t.paymentMethod} ·{' '}
                {t.vodafoneTxn || '—'}
                {t.hasTransferProof ? (
                  <>
                    {' '}
                    ·{' '}
                    <button
                      type="button"
                      className="underline"
                      onClick={() =>
                        void openFileInTab(
                          `/booking/submissions/${t.id}/proof`,
                        ).catch((e) =>
                          setDialog({
                            message: e.message,
                            tone: 'error',
                            confirmLabel: 'حسناً',
                          }),
                        )
                      }
                    >
                      صورة التحويل
                    </button>
                  </>
                ) : null}
              </p>
              <p className="text-[11px] text-navy/40">
                طالب: {t.studentPhone}
              </p>
              {t.status === 'SUBMITTED' ? (
                <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn-accent col-span-2"
                    disabled={busy === t.id}
                    onClick={() =>
                      setDialog({
                        title: 'تأكيد التحويل',
                        message: `تأكيد وصول تحويل ${
                          methodLabel[t.paymentMethod || ''] || t.paymentMethod
                        } برقم ${t.vodafoneTxn} من «${t.studentName}»؟`,
                        tone: 'info',
                        confirmLabel: 'تأكيد',
                        cancelLabel: 'رجوع',
                        onConfirm: () => void confirmTransfer(t),
                      })
                    }
                  >
                    تأكيد التحويل
                  </button>
                  <Link
                    href={`/bookings?formId=${t.form?.id || ''}`}
                    className="btn-ghost text-center text-xs py-2"
                  >
                    تعديل
                  </Link>
                  <button
                    type="button"
                    className="btn-ghost text-xs py-2 text-red-700"
                    disabled={busy === `cancel-${t.id}`}
                    onClick={() =>
                      setDialog({
                        title: 'إلغاء الحجز',
                        message: `إلغاء استمارة «${t.studentName}»؟ هتتحول لملغي.`,
                        tone: 'info',
                        confirmLabel: 'إلغاء الحجز',
                        cancelLabel: 'رجوع',
                        onConfirm: () => void cancelTransfer(t),
                      })
                    }
                  >
                    إلغاء
                  </button>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn-ghost w-full text-xs py-2 text-red-700"
                    disabled={busy === `del-${t.id}`}
                    onClick={() =>
                      setDialog({
                        title: 'مسح نهائي',
                        message: `مسح استمارة «${t.studentName}» نهائيًا من الطلبات؟`,
                        tone: 'info',
                        confirmLabel: 'مسح',
                        cancelLabel: 'رجوع',
                        onConfirm: () => void deleteTransfer(t),
                      })
                    }
                  >
                    مسح
                  </button>
                ) : null}
                </>
              ) : (
                <>
                <div className="flex flex-wrap items-center gap-2">
                  {t.receiptNumber ? (
                    <p className="font-mono text-[11px] text-navy/45">
                      {t.receiptNumber}
                    </p>
                  ) : null}
                  <Link
                    href={`/bookings?formId=${t.form?.id || ''}`}
                    className="btn-ghost text-xs px-2 py-1"
                  >
                    تعديل
                  </Link>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn-ghost w-full text-xs py-2 text-red-700"
                    disabled={busy === `del-${t.id}`}
                    onClick={() =>
                      setDialog({
                        title: 'مسح نهائي',
                        message: `مسح استمارة «${t.studentName}» نهائيًا من الطلبات؟`,
                        tone: 'info',
                        confirmLabel: 'مسح',
                        cancelLabel: 'رجوع',
                        onConfirm: () => void deleteTransfer(t),
                      })
                    }
                  >
                    مسح
                  </button>
                ) : null}
                </>
              )}
            </article>
          ))}
        </div>

        <div className="table-scroll hidden md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>م</th>
                <th>الطالب</th>
                <th>الاستمارة</th>
                <th>الطريقة</th>
                <th>الرقم المرجعي</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.slice.map((t) => (
                <tr key={t.id}>
                  <td className="tabular-nums font-bold text-navy/70">
                    {t.formSerial ?? '—'}
                  </td>
                  <td>
                    <p className="font-semibold">{t.studentName}</p>
                    <p className="text-[11px] text-navy/45">{t.studentPhone}</p>
                  </td>
                  <td className="text-xs">{t.form?.gradeLabel || t.form?.title}</td>
                  <td className="text-xs">
                    {methodLabel[t.paymentMethod || ''] || t.paymentMethod}
                  </td>
                  <td className="font-mono text-xs">
                    {t.vodafoneTxn || '—'}
                    {t.hasTransferProof ? (
                      <>
                        <br />
                        <button
                          type="button"
                          className="underline text-amber-800"
                          onClick={() =>
                            void openFileInTab(
                              `/booking/submissions/${t.id}/proof`,
                            ).catch((e) =>
                              setDialog({
                                message: e.message,
                                tone: 'error',
                                confirmLabel: 'حسناً',
                              }),
                            )
                          }
                        >
                          صورة
                        </button>
                      </>
                    ) : null}
                  </td>
                  <td className="tabular-nums font-semibold">{money(t.amount)}</td>
                  <td>
                    <span
                      className={t.status === 'PAID' ? 'badge-ok' : 'badge-navy'}
                    >
                      {t.status === 'PAID' ? 'مؤكد' : 'بانتظار التأكيد'}
                    </span>
                  </td>
                  <td className="space-y-1 min-w-[120px]">
                    {t.status === 'SUBMITTED' ? (
                      <>
                        <button
                          type="button"
                          className="btn-accent text-xs px-2 py-1 w-full !min-h-0"
                          disabled={busy === t.id}
                          onClick={() =>
                            setDialog({
                              title: 'تأكيد التحويل',
                              message: `تأكيد وصول تحويل ${
                                methodLabel[t.paymentMethod || ''] ||
                                t.paymentMethod
                              } برقم ${t.vodafoneTxn} من «${t.studentName}»؟`,
                              tone: 'info',
                              confirmLabel: 'تأكيد',
                              cancelLabel: 'رجوع',
                              onConfirm: () => void confirmTransfer(t),
                            })
                          }
                        >
                          تأكيد التحويل
                        </button>
                        <Link
                          href={`/bookings?formId=${t.form?.id || ''}`}
                          className="btn-ghost text-xs px-2 py-1 w-full !min-h-0 text-center"
                        >
                          تعديل
                        </Link>
                        <button
                          type="button"
                          className="btn-ghost text-xs px-2 py-1 w-full text-red-700 !min-h-0"
                          disabled={busy === `cancel-${t.id}`}
                          onClick={() =>
                            setDialog({
                              title: 'إلغاء الحجز',
                              message: `إلغاء استمارة «${t.studentName}»؟ هتتحول لملغي.`,
                              tone: 'info',
                              confirmLabel: 'إلغاء الحجز',
                              cancelLabel: 'رجوع',
                              onConfirm: () => void cancelTransfer(t),
                            })
                          }
                        >
                          إلغاء
                        </button>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="btn-ghost text-xs px-2 py-1 w-full text-red-700 !min-h-0"
                            disabled={busy === `del-${t.id}`}
                            onClick={() =>
                              setDialog({
                                title: 'مسح نهائي',
                                message: `مسح استمارة «${t.studentName}» نهائيًا من الطلبات؟`,
                                tone: 'info',
                                confirmLabel: 'مسح',
                                cancelLabel: 'رجوع',
                                onConfirm: () => void deleteTransfer(t),
                              })
                            }
                          >
                            مسح
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-[11px] text-navy/45">
                          {t.receiptNumber || '—'}
                        </span>
                        <Link
                          href={`/bookings?formId=${t.form?.id || ''}`}
                          className="btn-ghost text-xs px-2 py-1 w-full !min-h-0 text-center"
                        >
                          تعديل
                        </Link>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="btn-ghost text-xs px-2 py-1 w-full text-red-700 !min-h-0"
                            disabled={busy === `del-${t.id}`}
                            onClick={() =>
                              setDialog({
                                title: 'مسح نهائي',
                                message: `مسح استمارة «${t.studentName}» نهائيًا من الطلبات؟`,
                                tone: 'info',
                                confirmLabel: 'مسح',
                                cancelLabel: 'رجوع',
                                onConfirm: () => void deleteTransfer(t),
                              })
                            }
                          >
                            مسح
                          </button>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePager
          page={paged.page}
          pages={paged.pages}
          total={paged.total}
          size={paged.size}
          from={paged.from}
          to={paged.to}
          onPage={paged.setPage}
        />
        {!rows.length ? (
          <EmptyState>لا توجد تحويلات أونلاين بعد</EmptyState>
        ) : null}
      </SectionCard>

      <AppDialog
        open={!!dialog}
        title={dialog?.title}
        message={dialog?.message || ''}
        tone={dialog?.tone || 'info'}
        confirmLabel={dialog?.confirmLabel || 'حسناً'}
        cancelLabel={dialog?.cancelLabel}
        onConfirm={dialog?.onConfirm}
        onClose={() => setDialog(null)}
      />
    </AppShell>
  );
}
