import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SMS_PROVIDER, WHATSAPP_PROVIDER } from './messaging.constants';
import { MessagingProvider } from './providers/messaging-provider';
import { whatsappProviderLabel } from './providers/provider.factory';
import { normalizePhone } from './providers/phone.util';

function applyTemplate(
  text: string,
  vars: Record<string, string | number | undefined | null>,
) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue('messaging') private readonly queue: Queue,
    @Inject(SMS_PROVIDER) private readonly sms: MessagingProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: MessagingProvider,
  ) {}

  providerStatus() {
    const mode = whatsappProviderLabel();
    const configured =
      mode === 'console'
        ? true
        : mode === 'twilio'
          ? Boolean(
              process.env.TWILIO_ACCOUNT_SID &&
                process.env.TWILIO_AUTH_TOKEN &&
                process.env.TWILIO_WHATSAPP_FROM,
            )
          : Boolean(
              process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
            );

    return {
      whatsappProvider: mode,
      whatsappConfigured: configured,
      smsProvider: (process.env.SMS_PROVIDER || 'console').toLowerCase(),
      overdueRemindersEnabled: process.env.OVERDUE_REMINDERS_ENABLED !== 'false',
      live:
        mode !== 'console' && configured
          ? 'WhatsApp messages will be sent to real numbers'
          : 'Console mode — messages are logged only',
    };
  }

  async enqueue(data: {
    channel: MessageChannel;
    toPhone?: string;
    toUserId?: string;
    title?: string;
    body: string;
    meta?: Prisma.InputJsonValue;
  }) {
    const job = await this.prisma.messageJob.create({
      data: {
        channel: data.channel,
        toPhone: data.toPhone ? normalizePhone(data.toPhone) || data.toPhone : data.toPhone,
        toUserId: data.toUserId,
        title: data.title,
        body: data.body,
        meta: data.meta,
      },
    });
    await this.queue.add('send', { jobId: job.id });
    return job;
  }

  async processJob(jobId: string) {
    const job = await this.prisma.messageJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    try {
      if (job.channel === MessageChannel.IN_APP && job.toUserId) {
        await this.notifications.create(
          job.toUserId,
          job.title || 'Notification',
          job.body,
          job.meta as Prisma.InputJsonValue,
        );
      } else if (job.channel === MessageChannel.SMS && job.toPhone) {
        await this.sms.send(job.toPhone, job.body, job.title || undefined);
      } else if (job.channel === MessageChannel.WHATSAPP && job.toPhone) {
        await this.whatsapp.send(job.toPhone, job.body, job.title || undefined);
      }

      await this.prisma.messageJob.update({
        where: { id: jobId },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (error) {
      await this.prisma.messageJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  listTemplates() {
    return this.prisma.messageTemplate.findMany({ orderBy: { code: 'asc' } });
  }

  async sendCampaign(input: {
    channel: MessageChannel;
    templateCode?: string;
    body: string;
    title?: string;
    audience: 'GROUP' | 'OVERDUE_PAYMENTS' | 'ABSENT_TODAY' | 'ALL_PARENTS' | 'CUSTOM';
    groupId?: string;
    studentIds?: string[];
  }) {
    let templateBody = input.body;
    let title = input.title;

    if (input.templateCode) {
      const template = await this.prisma.messageTemplate.findUnique({
        where: { code: input.templateCode },
      });
      if (template) {
        templateBody = template.bodyAr;
        title = template.titleAr || title;
      }
    }

    type Recipient = {
      phone?: string;
      userId?: string;
      studentId?: string;
      studentName?: string;
      amountDue?: number;
      subjectName?: string;
    };

    const recipients: Recipient[] = [];

    if (input.audience === 'GROUP' && input.groupId) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { groupId: input.groupId, isActive: true },
        include: {
          student: {
            include: { parents: { include: { parent: true } } },
          },
          group: { include: { subject: true } },
        },
      });
      for (const e of enrollments) {
        const studentName = `${e.student.firstName} ${e.student.lastName}`;
        for (const link of e.student.parents) {
          recipients.push({
            phone: link.parent.phone,
            userId: link.parent.userId || undefined,
            studentId: e.studentId,
            studentName,
            subjectName: e.group.subject?.nameAr || e.group.subject?.nameEn,
          });
        }
      }
    } else if (input.audience === 'OVERDUE_PAYMENTS') {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        },
        include: {
          student: { include: { parents: { include: { parent: true } } } },
          group: { include: { subject: true } },
        },
      });
      for (const inv of invoices) {
        const due =
          Number(inv.feeAmount) -
          Number(inv.discount) +
          Number(inv.extras) -
          Number(inv.paidAmount);
        if (due <= 0) continue;
        const studentName = `${inv.student.firstName} ${inv.student.lastName}`;
        for (const link of inv.student.parents) {
          recipients.push({
            phone: link.parent.phone,
            userId: link.parent.userId || undefined,
            studentId: inv.studentId,
            studentName,
            amountDue: Math.round(due),
            subjectName: inv.group?.subject?.nameAr || inv.group?.name,
          });
        }
      }
    } else if (input.audience === 'ABSENT_TODAY') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const absentees = await this.prisma.attendanceRecord.findMany({
        where: {
          status: 'ABSENT',
          studentId: { not: null },
          markedAt: { gte: start },
        },
        include: {
          student: { include: { parents: { include: { parent: true } } } },
          session: { include: { group: { include: { subject: true } } } },
        },
      });
      for (const a of absentees) {
        if (!a.student) continue;
        const studentName = `${a.student.firstName} ${a.student.lastName}`;
        for (const link of a.student.parents) {
          recipients.push({
            phone: link.parent.phone,
            userId: link.parent.userId || undefined,
            studentId: a.studentId || undefined,
            studentName,
            subjectName:
              a.session.group.subject?.nameAr || a.session.group.subject?.nameEn,
          });
        }
      }
    } else if (input.audience === 'ALL_PARENTS') {
      const parents = await this.prisma.parent.findMany();
      for (const p of parents) {
        recipients.push({ phone: p.phone, userId: p.userId || undefined });
      }
    } else if (input.audience === 'CUSTOM' && input.studentIds?.length) {
      const students = await this.prisma.student.findMany({
        where: { id: { in: input.studentIds } },
        include: { parents: { include: { parent: true } } },
      });
      for (const s of students) {
        const studentName = `${s.firstName} ${s.lastName}`;
        for (const link of s.parents) {
          recipients.push({
            phone: link.parent.phone,
            userId: link.parent.userId || undefined,
            studentId: s.id,
            studentName,
          });
        }
      }
    }

    // de-dupe by phone+channel payload key
    const seen = new Set<string>();
    const jobs = [];
    for (const r of recipients) {
      const key = `${r.phone || r.userId}:${r.studentId || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const body = applyTemplate(templateBody, {
        studentName: r.studentName || 'الطالب',
        amount: r.amountDue,
        amountDue: r.amountDue,
        subjectName: r.subjectName || 'الحصة',
        centerName: process.env.CENTER_NAME || 'Success',
      });

      jobs.push(
        await this.enqueue({
          channel: input.channel,
          toPhone: r.phone,
          toUserId: r.userId,
          title,
          body,
          meta: {
            studentId: r.studentId,
            audience: input.audience,
            amountDue: r.amountDue,
          },
        }),
      );
    }
    return { count: jobs.length, jobs, provider: this.providerStatus() };
  }

  listJobs() {
    return this.prisma.messageJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
