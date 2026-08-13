import {
  MessageChannel,
  PrismaClient,
  RoleCode,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { G3_BOOKING_OFFERINGS } from '../src/booking/booking.defaults';

const prisma = new PrismaClient();

const roleDefs: {
  code: RoleCode;
  nameAr: string;
  nameEn: string;
  permissions: string[];
}[] = [
  {
    code: RoleCode.SUPER_ADMIN,
    nameAr: 'مدير النظام',
    nameEn: 'Super Admin',
    permissions: ['*'],
  },
  {
    code: RoleCode.CENTER_MANAGER,
    nameAr: 'مدير السنتر',
    nameEn: 'Center Manager',
    permissions: [
      'dashboard',
      'students',
      'teachers',
      'groups',
      'finance',
      'bookings',
      'ops',
      'revenue',
      'reports',
      'attendance',
      'exams',
      'messaging',
      'settings',
    ],
  },
  {
    code: RoleCode.ACCOUNTANT,
    nameAr: 'محاسب',
    nameEn: 'Accountant',
    permissions: ['dashboard', 'finance', 'reports', 'bookings', 'revenue'],
  },
  {
    code: RoleCode.RECEPTION,
    nameAr: 'استقبال',
    nameEn: 'Reception',
    permissions: [
      'dashboard',
      'students',
      'attendance',
      'finance.payments',
      'bookings',
      'ops',
      'revenue',
    ],
  },
  {
    code: RoleCode.TEACHER,
    nameAr: 'مدرس',
    nameEn: 'Teacher',
    permissions: ['groups.own', 'attendance', 'exams'],
  },
  {
    code: RoleCode.PARENT,
    nameAr: 'ولي أمر',
    nameEn: 'Parent',
    permissions: ['children'],
  },
  {
    code: RoleCode.STUDENT,
    nameAr: 'طالب',
    nameEn: 'Student',
    permissions: ['self'],
  },
];

async function main() {
  for (const role of roleDefs) {
    await prisma.role.upsert({
      where: { code: role.code },
      create: role,
      update: {
        nameAr: role.nameAr,
        nameEn: role.nameEn,
        permissions: role.permissions,
      },
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.SUPER_ADMIN },
  });
  const teacherRole = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.TEACHER },
  });
  const parentRole = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.PARENT },
  });
  const studentRole = await prisma.role.findUniqueOrThrow({
    where: { code: RoleCode.STUDENT },
  });

  const passwordHash = await bcrypt.hash('Admin@123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@center.local' },
    create: {
      email: 'admin@center.local',
      passwordHash,
      fullName: 'Super Admin',
      roleId: adminRole.id,
    },
    update: { passwordHash },
  });

  const grades = [
    { nameAr: 'الأول الثانوي', nameEn: 'Secondary 1', sortOrder: 10 },
    { nameAr: 'الثاني الثانوي', nameEn: 'Secondary 2', sortOrder: 11 },
    { nameAr: 'الثالث الثانوي', nameEn: 'Secondary 3', sortOrder: 12 },
  ];

  for (const g of grades) {
    const existing = await prisma.gradeLevel.findFirst({
      where: { nameEn: g.nameEn },
    });
    if (!existing) await prisma.gradeLevel.create({ data: g });
  }

  const subjects = [
    { nameAr: 'رياضيات', nameEn: 'Mathematics' },
    { nameAr: 'فيزياء', nameEn: 'Physics' },
    { nameAr: 'كيمياء', nameEn: 'Chemistry' },
    { nameAr: 'لغة عربية', nameEn: 'Arabic' },
    { nameAr: 'لغة إنجليزية', nameEn: 'English' },
  ];

  for (const s of subjects) {
    const existing = await prisma.subject.findFirst({
      where: { nameEn: s.nameEn },
    });
    if (!existing) await prisma.subject.create({ data: s });
  }

  for (const name of ['Hall A', 'Hall B', 'Lab 1', 'Room 3']) {
    const existing = await prisma.classroom.findFirst({ where: { name } });
    if (!existing) {
      await prisma.classroom.create({ data: { name, capacity: 30 } });
    }
  }

  const math = await prisma.subject.findFirstOrThrow({
    where: { nameEn: 'Mathematics' },
  });
  const grade10 = await prisma.gradeLevel.findFirstOrThrow({
    where: { nameEn: 'Grade 10' },
  });
  const hallA = await prisma.classroom.findFirstOrThrow({
    where: { name: 'Hall A' },
  });

  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@center.local' },
    create: {
      email: 'teacher@center.local',
      passwordHash: await bcrypt.hash('Teacher@123', 10),
      fullName: 'Ahmed Hassan',
      roleId: teacherRole.id,
    },
    update: {},
  });

  let teacher = await prisma.teacher.findFirst({
    where: { userId: teacherUser.id },
  });
  if (!teacher) {
    teacher = await prisma.teacher.create({
      data: {
        userId: teacherUser.id,
        firstName: 'Ahmed',
        lastName: 'Hassan',
        phone: '01000000001',
        email: 'teacher@center.local',
        hourlyRate: 250,
        subjects: { create: [{ subjectId: math.id }] },
      },
    });
  }

  let group = await prisma.group.findFirst({
    where: { name: 'Group A', subjectId: math.id, gradeLevelId: grade10.id },
  });
  if (!group) {
    group = await prisma.group.create({
      data: {
        name: 'Group A',
        subjectId: math.id,
        gradeLevelId: grade10.id,
        teacherId: teacher.id,
        classroomId: hallA.id,
        feeAmount: 800,
        capacity: 25,
        scheduleSlots: {
          create: [
            {
              dayOfWeek: 0,
              startTime: '16:00',
              endTime: '18:00',
              classroomId: hallA.id,
            },
            {
              dayOfWeek: 2,
              startTime: '16:00',
              endTime: '18:00',
              classroomId: hallA.id,
            },
          ],
        },
      },
    });
  }

  const parentUser = await prisma.user.upsert({
    where: { email: 'parent@center.local' },
    create: {
      email: 'parent@center.local',
      passwordHash: await bcrypt.hash('Parent@123', 10),
      fullName: 'Mohamed Ali',
      roleId: parentRole.id,
    },
    update: {},
  });

  let parent = await prisma.parent.findFirst({
    where: { userId: parentUser.id },
  });
  if (!parent) {
    parent = await prisma.parent.create({
      data: {
        userId: parentUser.id,
        firstName: 'Mohamed',
        lastName: 'Ali',
        phone: '01000000002',
        email: 'parent@center.local',
      },
    });
  }

  const studentUser = await prisma.user.upsert({
    where: { email: 'student@center.local' },
    create: {
      email: 'student@center.local',
      passwordHash: await bcrypt.hash('Student@123', 10),
      fullName: 'Ahmed Ali',
      roleId: studentRole.id,
    },
    update: {
      passwordHash: await bcrypt.hash('Student@123', 10),
      roleId: studentRole.id,
    },
  });

  let student = await prisma.student.findFirst({
    where: { firstName: 'Ahmed', lastName: 'Ali' },
  });
  if (!student) {
    student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        firstName: 'Ahmed',
        lastName: 'Ali',
        phone: '01000000003',
        email: 'student@center.local',
        gradeLevelId: grade10.id,
        parents: { create: [{ parentId: parent.id }] },
      },
    });
  } else if (!student.userId) {
    student = await prisma.student.update({
      where: { id: student.id },
      data: { userId: studentUser.id, email: 'student@center.local' },
    });
  }

  const enrollment = await prisma.enrollment.upsert({
    where: {
      studentId_groupId: { studentId: student.id, groupId: group.id },
    },
    create: { studentId: student.id, groupId: group.id },
    update: { isActive: true },
  });

  const invoiceExists = await prisma.invoice.findFirst({
    where: { enrollmentId: enrollment.id },
  });
  if (!invoiceExists) {
    await prisma.invoice.create({
      data: {
        studentId: student.id,
        enrollmentId: enrollment.id,
        groupId: group.id,
        feeAmount: 800,
        status: 'PENDING',
        dueDate: new Date(Date.now() + 7 * 86400000),
      },
    });
  }

  const templates = [
    {
      code: 'ABSENCE',
      channel: MessageChannel.WHATSAPP,
      titleAr: 'إشعار غياب',
      bodyAr:
        'تنبيه من {{centerName}}: {{studentName}} تغيّب عن حصة {{subjectName}} اليوم.',
      titleEn: 'Absence Notice',
      bodyEn:
        '{{studentName}} was absent from {{subjectName}} class today at {{centerName}}.',
    },
    {
      code: 'OVERDUE_PAYMENT',
      channel: MessageChannel.WHATSAPP,
      titleAr: 'تذكير بالدفع',
      bodyAr:
        'تذكير من {{centerName}}: يوجد مبلغ مستحق {{amountDue}} EGP على اشتراك {{studentName}} ({{subjectName}}). برجاء السداد.',
      titleEn: 'Payment Reminder',
      bodyEn:
        'Reminder from {{centerName}}: outstanding {{amountDue}} EGP for {{studentName}} ({{subjectName}}).',
    },
    {
      code: 'ANNOUNCEMENT',
      channel: MessageChannel.WHATSAPP,
      titleAr: 'إعلان عام',
      bodyAr: '{{message}}',
      titleEn: 'Announcement',
      bodyEn: '{{message}}',
    },
  ];

  for (const t of templates) {
    await prisma.messageTemplate.upsert({
      where: { code: t.code },
      create: t,
      update: t,
    });
  }

  const g3Slug = 'g3-2026-2027';
  const existingForm = await prisma.bookingForm.findUnique({
    where: { slug: g3Slug },
  });
  if (!existingForm) {
    await prisma.bookingForm.create({
      data: {
        slug: g3Slug,
        title: 'استمارة حجز الصف الثالث الثانوي',
        subtitle: 'الدفع كاش في السنتر',
        academicYear: '2026-2027',
        gradeLabel: 'الثالث الثانوي',
        defaultFee: 0,
        isPublished: true,
        notes:
          'الدفع كاش فقط داخل السنتر. بعد التسجيل توجّه للاستقبال لاستلام الإيصال.',
        offerings: {
          create: G3_BOOKING_OFFERINGS.map((o) => ({
            teacherName: o.teacherName,
            subjectName: o.subjectName,
            isOnline: o.isOnline ?? false,
            pageNumber: o.pageNumber,
            sortOrder: o.sortOrder,
            feeAmount: 0,
          })),
        },
      },
    });
    console.log('Seeded booking form:', g3Slug);
  }

  const g2Slug = 'g2-2026-2027';
  const existingG2 = await prisma.bookingForm.findUnique({
    where: { slug: g2Slug },
  });
  if (!existingG2) {
    await prisma.bookingForm.create({
      data: {
        slug: g2Slug,
        title: 'استمارة حجز الصف الثاني الثانوي',
        subtitle: 'تسجيل ورقي / دفع كاش في السنتر',
        academicYear: '2026-2027',
        gradeLabel: 'الثاني الثانوي',
        defaultFee: 0,
        isPublished: true,
        notes: 'مستورد من كشف ورقي أو تسجيل يدوي',
      },
    });
    console.log('Seeded booking form:', g2Slug);
  }

  console.log('Seed complete');
  console.log('Admin:', admin.email, 'Admin@123');
  console.log('Teacher: teacher@center.local / Teacher@123');
  console.log('Parent: parent@center.local / Parent@123');
  console.log('Student: student@center.local / Student@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
