'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import {
  AlertBanner,
  EmptyState,
  FieldLabel,
  PageHero,
  SectionCard,
} from '@/components/ui';
import { api } from '@/lib/api';

export default function MessagingPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [form, setForm] = useState({
    channel: 'WHATSAPP',
    audience: 'OVERDUE_PAYMENTS',
    groupId: '',
    title: 'إشعار من السنتر',
    body: 'تذكير هام من إدارة السنتر.',
    templateCode: '',
  });
  const [result, setResult] = useState('');

  async function load() {
    const [t, j, g, s] = await Promise.all([
      api<any[]>('/messaging/templates'),
      api<any[]>('/messaging/jobs'),
      api<any[]>('/groups'),
      api<any>('/messaging/status'),
    ]);
    setTemplates(t);
    setJobs(j);
    setGroups(g);
    setStatus(s);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    const res = await api<{ count: number }>('/messaging/send', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setResult(`تم إنشاء ${res.count} رسالة`);
    await load();
  }

  async function remindOverdue() {
    const res = await api<{ count: number }>('/messaging/remind-overdue', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setResult(`تم جدولة ${res.count} تذكير متأخرات عبر WhatsApp`);
    await load();
  }

  return (
    <AppShell>
      <PageHeader
        title="التواصل"
        subtitle="WhatsApp حقيقي / SMS / إشعارات — غياب ومتأخرات"
        action={
          <button type="button" className="btn-accent" onClick={() => void remindOverdue()}>
            تذكير المتأخرات الآن
          </button>
        }
      />
      <PageHero
        eyebrow="MESSAGING"
        title="حملات التواصل"
        subtitle={status?.live || 'أرسل تذكيرات لأولياء الأمور'}
        metrics={[
          {
            label: 'WhatsApp',
            value: status?.whatsappProvider || '—',
            highlight: true,
          },
          {
            label: 'جاهز',
            value: status?.whatsappConfigured ? 'نعم' : 'لا',
          },
          { label: 'سجل', value: jobs.length },
          { label: 'قوالب', value: templates.length },
        ]}
      />
      {result ? <AlertBanner tone="success">{result}</AlertBanner> : null}
      {status && status.whatsappProvider === 'console' ? (
        <AlertBanner tone="info">
          WhatsApp حالياً Console. لتفعيل الإرسال الحقيقي ضع WHATSAPP_PROVIDER=meta
          أو twilio في ملف البيئة.
        </AlertBanner>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="إرسال حملة" subtitle="القناة + الجمهور + النص">
          <form onSubmit={send} className="space-y-3">
            <FieldLabel label="القناة">
              <select
                className="field"
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
                <option value="IN_APP">In-App</option>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </FieldLabel>
            <FieldLabel label="الجمهور">
              <select
                className="field"
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
              >
                <option value="GROUP">مجموعة معينة</option>
                <option value="OVERDUE_PAYMENTS">متأخرون في الدفع</option>
                <option value="ABSENT_TODAY">غائبون اليوم</option>
                <option value="ALL_PARENTS">كل أولياء الأمور</option>
              </select>
            </FieldLabel>
            {form.audience === 'GROUP' ? (
              <FieldLabel label="المجموعة">
                <select
                  className="field"
                  value={form.groupId}
                  onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                >
                  <option value="">اختر المجموعة</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.subject.nameEn} {g.name}
                    </option>
                  ))}
                </select>
              </FieldLabel>
            ) : null}
            <FieldLabel label="القالب">
              <select
                className="field"
                value={form.templateCode}
                onChange={(e) =>
                  setForm({ ...form, templateCode: e.target.value })
                }
              >
                <option value="">بدون قالب / نص حر</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.code}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="العنوان">
              <input
                className="field"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </FieldLabel>
            <FieldLabel label="نص الرسالة">
              <textarea
                className="field min-h-28"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </FieldLabel>
            <button className="btn-primary w-full">إرسال</button>
          </form>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="قوالب الرسائل">
            <ul className="space-y-2 text-sm">
              {templates.map((t) => (
                <li key={t.id} className="rounded-xl bg-sand px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-navy">{t.code}</p>
                    <span className="badge-navy">{t.channel}</span>
                  </div>
                  <p className="text-navy/60 mt-1">{t.bodyAr}</p>
                </li>
              ))}
              {!templates.length ? <EmptyState>لا توجد قوالب</EmptyState> : null}
            </ul>
          </SectionCard>

          <SectionCard
            title="سجل الإرسال"
            badge={<span className="badge-gold">{jobs.length}</span>}
          >
            <ul className="space-y-2 text-sm max-h-80 overflow-auto">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className="rounded-xl border border-mist px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="badge-navy">{j.channel}</span>
                    <span className="text-xs text-navy/40">{j.status}</span>
                  </div>
                  <p className="mt-1 text-navy/70">
                    {j.toPhone || j.toUserId || '—'}
                  </p>
                  <p className="text-xs text-navy/45 mt-1 line-clamp-2">
                    {j.body}
                  </p>
                </li>
              ))}
              {!jobs.length ? <EmptyState>لا يوجد سجل بعد</EmptyState> : null}
            </ul>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
