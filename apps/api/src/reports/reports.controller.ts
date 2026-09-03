import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportsPdfService } from './reports-pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  RoleCode.SUPER_ADMIN,
  RoleCode.CENTER_MANAGER,
  RoleCode.ACCOUNTANT,
  RoleCode.RECEPTION,
)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly pdf: ReportsPdfService,
  ) {}

  @Get('finance')
  finance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.finance(from, to);
  }

  @Get('bookings')
  bookings(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.bookings(from, to);
  }

  @Get('teachers')
  teachers(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.teachers(from, to);
  }

  @Get('attendance')
  attendance(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupId') groupId?: string,
  ) {
    // legacy alias — same teachers report (ops sessions)
    return this.reports.teachers(from, to);
  }

  @Get('profit')
  profit(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.profit(from, to);
  }

  @Get('pnl')
  pnl(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.pnl(from, to);
  }

  @Get('finance/pdf')
  async financePdf(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.pdf.financePdf(from, to);
    const filename = `finance-${from || 'from'}-${to || 'to'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('bookings/pdf')
  async bookingsPdf(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.pdf.bookingsPdf(from, to);
    const filename = `bookings-${from || 'from'}-${to || 'to'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('teachers/pdf')
  async teachersPdf(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.pdf.teachersPdf(from, to);
    const filename = `teachers-${from || 'from'}-${to || 'to'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('attendance/pdf')
  async attendancePdf(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.pdf.teachersPdf(from, to);
    const filename = `teachers-${from || 'from'}-${to || 'to'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('profit/pdf')
  async profitPdf(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.pdf.profitPdf(from, to);
    const filename = `profit-${from || 'from'}-${to || 'to'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('pnl/pdf')
  async pnlPdf(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.pdf.pnlPdf(from, to);
    const filename = `pnl-${from || 'from'}-${to || 'to'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
