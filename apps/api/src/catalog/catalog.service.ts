import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listGradeLevels() {
    return this.prisma.gradeLevel.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  createGradeLevel(data: {
    nameAr: string;
    nameEn: string;
    sortOrder?: number;
  }) {
    return this.prisma.gradeLevel.create({
      data: {
        nameAr: data.nameAr.trim(),
        nameEn: data.nameEn.trim(),
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async updateGradeLevel(
    id: string,
    data: { nameAr?: string; nameEn?: string; sortOrder?: number },
  ) {
    await this.getGrade(id);
    return this.prisma.gradeLevel.update({
      where: { id },
      data: {
        ...(data.nameAr != null ? { nameAr: data.nameAr.trim() } : {}),
        ...(data.nameEn != null ? { nameEn: data.nameEn.trim() } : {}),
        ...(data.sortOrder != null ? { sortOrder: data.sortOrder } : {}),
      },
    });
  }

  async deleteGradeLevel(id: string) {
    await this.getGrade(id);
    const [students, groups, teacherLinks] = await Promise.all([
      this.prisma.student.count({ where: { gradeLevelId: id } }),
      this.prisma.group.count({ where: { gradeLevelId: id } }),
      this.prisma.teacherGradeLevel.count({ where: { gradeLevelId: id } }),
    ]);
    if (students || groups || teacherLinks) {
      throw new BadRequestException(
        `لا يمكن مسح الصف: مرتبط بـ ${students} طالب، ${groups} مجموعة، ${teacherLinks} مدرس. انقلهم أولاً.`,
      );
    }
    await this.prisma.gradeLevel.delete({ where: { id } });
    return { ok: true };
  }

  private async getGrade(id: string) {
    const g = await this.prisma.gradeLevel.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('الصف غير موجود');
    return g;
  }

  listSubjects() {
    return this.prisma.subject.findMany({ orderBy: { nameAr: 'asc' } });
  }

  createSubject(data: { nameAr: string; nameEn: string }) {
    return this.prisma.subject.create({
      data: {
        nameAr: data.nameAr.trim(),
        nameEn: data.nameEn.trim(),
      },
    });
  }

  async updateSubject(
    id: string,
    data: { nameAr?: string; nameEn?: string },
  ) {
    await this.getSubject(id);
    return this.prisma.subject.update({
      where: { id },
      data: {
        ...(data.nameAr != null ? { nameAr: data.nameAr.trim() } : {}),
        ...(data.nameEn != null ? { nameEn: data.nameEn.trim() } : {}),
      },
    });
  }

  async deleteSubject(id: string) {
    await this.getSubject(id);
    const [groups, teacherLinks, exams, sessions] = await Promise.all([
      this.prisma.group.count({ where: { subjectId: id } }),
      this.prisma.teacherSubject.count({ where: { subjectId: id } }),
      this.prisma.exam.count({ where: { subjectId: id } }),
      this.prisma.classSession.count({ where: { subjectId: id } }),
    ]);
    if (groups || teacherLinks || exams || sessions) {
      throw new BadRequestException(
        `لا يمكن مسح المادة: مرتبطة بـ ${groups} مجموعة، ${teacherLinks} مدرس، ${exams} امتحان. فك الربط أولاً.`,
      );
    }
    await this.prisma.subject.delete({ where: { id } });
    return { ok: true };
  }

  private async getSubject(id: string) {
    const s = await this.prisma.subject.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('المادة غير موجودة');
    return s;
  }

  listClassrooms() {
    return this.prisma.classroom.findMany({ orderBy: { name: 'asc' } });
  }

  createClassroom(data: { name: string; capacity?: number }) {
    return this.prisma.classroom.create({ data });
  }
}
