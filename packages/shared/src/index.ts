import { z } from 'zod';

export const RoleCode = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CENTER_MANAGER: 'CENTER_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  RECEPTION: 'RECEPTION',
  TEACHER: 'TEACHER',
  PARENT: 'PARENT',
  STUDENT: 'STUDENT',
} as const;

export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
  EXCUSED: 'EXCUSED',
} as const;

export type AttendanceStatus =
  (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AttendanceSource = {
  MANUAL: 'MANUAL',
  QR_STUDENT: 'QR_STUDENT',
  QR_GATE: 'QR_GATE',
} as const;

export type AttendanceSource =
  (typeof AttendanceSource)[keyof typeof AttendanceSource];

export const MessageChannel = {
  IN_APP: 'IN_APP',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
} as const;

export type MessageChannel =
  (typeof MessageChannel)[keyof typeof MessageChannel];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const WeekDay = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const studentCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  gradeLevelId: z.string().optional(),
  notes: z.string().optional(),
  parentIds: z.array(z.string()).optional(),
});

export type StudentCreateInput = z.infer<typeof studentCreateSchema>;

export const teacherCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  hourlyRate: z.number().nonnegative().default(0),
  subjectIds: z.array(z.string()).optional(),
});

export type TeacherCreateInput = z.infer<typeof teacherCreateSchema>;

export const groupCreateSchema = z.object({
  name: z.string().min(1),
  subjectId: z.string(),
  gradeLevelId: z.string(),
  teacherId: z.string(),
  classroomId: z.string().optional(),
  feeAmount: z.number().nonnegative(),
  capacity: z.number().int().positive().default(30),
  scheduleSlots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .optional(),
});

export type GroupCreateInput = z.infer<typeof groupCreateSchema>;

export const paymentCreateSchema = z.object({
  studentId: z.string(),
  enrollmentId: z.string().optional(),
  amount: z.number().positive(),
  discount: z.number().nonnegative().default(0),
  extras: z.number().nonnegative().default(0),
  method: z.string().default('CASH'),
  note: z.string().optional(),
  dueDate: z.string().optional(),
});

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export const examCreateSchema = z.object({
  title: z.string().min(1),
  groupId: z.string(),
  subjectId: z.string(),
  maxScore: z.number().positive(),
  examDate: z.string(),
});

export type ExamCreateInput = z.infer<typeof examCreateSchema>;

export const gradeUpsertSchema = z.object({
  examId: z.string(),
  grades: z.array(
    z.object({
      studentId: z.string(),
      score: z.number().nonnegative(),
      note: z.string().optional(),
    }),
  ),
});

export type GradeUpsertInput = z.infer<typeof gradeUpsertSchema>;

export const attendanceMarkSchema = z.object({
  sessionId: z.string(),
  records: z.array(
    z.object({
      studentId: z.string().optional(),
      teacherId: z.string().optional(),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
      source: z
        .enum(['MANUAL', 'QR_STUDENT', 'QR_GATE'])
        .default('MANUAL'),
    }),
  ),
});

export type AttendanceMarkInput = z.infer<typeof attendanceMarkSchema>;

export const messageSendSchema = z.object({
  channel: z.enum(['IN_APP', 'SMS', 'WHATSAPP']),
  templateCode: z.string().optional(),
  body: z.string().min(1),
  title: z.string().optional(),
  audience: z.enum([
    'GROUP',
    'OVERDUE_PAYMENTS',
    'ABSENT_TODAY',
    'ALL_PARENTS',
    'CUSTOM',
  ]),
  groupId: z.string().optional(),
  studentIds: z.array(z.string()).optional(),
});

export type MessageSendInput = z.infer<typeof messageSendSchema>;

export interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  classesToday: number;
  studentsPresent: number;
  collectedToday: number;
  outstandingStudents: number;
}
