import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { BookingStatus, RoleCode } from '@prisma/client';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('booking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  RoleCode.SUPER_ADMIN,
  RoleCode.CENTER_MANAGER,
  RoleCode.RECEPTION,
  RoleCode.ACCOUNTANT,
)
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Get('forms')
  listForms() {
    return this.booking.listForms();
  }

  @Get('forms/:id')
  getForm(@Param('id') id: string) {
    return this.booking.getFormAdmin(id);
  }

  @Get('forms/:id/share')
  getShare(@Param('id') id: string, @Query('baseUrl') baseUrl?: string) {
    return this.booking.getFormShare(id, baseUrl);
  }

  @Get('offerings/:id/roster')
  getOfferingRoster(
    @Param('id') id: string,
    @Query('paidOnly') paidOnly?: string,
  ) {
    const paid =
      paidOnly === '1' || paidOnly === 'true' || paidOnly === 'yes';
    return this.booking.getOfferingRoster(id, paid);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @Post('forms')
  createForm(
    @Body()
    body: {
      slug: string;
      title: string;
      subtitle?: string;
      academicYear: string;
      gradeLabel: string;
      defaultFee?: number;
      notes?: string;
      isPublished?: boolean;
      seedTeachers?: boolean;
      /** @deprecated use seedTeachers */
      seedG3?: boolean;
    },
  ) {
    return this.booking.createForm(body);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @Patch('forms/:id')
  updateForm(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      title: string;
      subtitle: string | null;
      academicYear: string;
      gradeLabel: string;
      defaultFee: number;
      notes: string | null;
      isPublished: boolean;
      slug: string;
      onlinePayEnabled?: boolean;
      vodafoneWallet?: string | null;
      instapayHandle?: string | null;
    }>,
    @CurrentUser() user: { role?: string },
  ) {
    return this.booking.updateForm(id, body, user?.role);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @Post('forms/:id/offerings')
  upsertOffering(
    @Param('id') id: string,
    @Body()
    body: {
      id?: string;
      teacherId: string;
      subjectId?: string;
      subjectName: string;
      isOnline?: boolean;
      feeAmount?: number;
      pageNumber?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.booking.upsertOffering(id, body);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @Delete('offerings/:id')
  deleteOffering(@Param('id') id: string) {
    return this.booking.deleteOffering(id);
  }

  @Get('online-wallet')
  onlineWallet() {
    return this.booking.onlineWallet();
  }

  @Get('submissions')
  listSubmissions(
    @Query('formId') formId?: string,
    @Query('status') status?: BookingStatus,
    @Query('phone') phone?: string,
  ) {
    return this.booking.listSubmissions(formId, status, phone);
  }

  @Get('submissions/:id/proof')
  async getTransferProof(@Param('id') id: string) {
    const proof = await this.booking.getTransferProof(id);
    return new StreamableFile(proof.buffer, {
      type: proof.mime,
      disposition: `inline; filename="${proof.filename}"`,
    });
  }

  @Post('submissions/:id/mark-paid')
  markPaid(
    @Param('id') id: string,
    @Body()
    body: {
      note?: string;
      method?: 'CASH' | 'VODAFONE_CASH' | 'INSTAPAY';
      vodafoneTxn?: string;
    },
  ) {
    return this.booking.markPaid(id, body || {});
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  @Patch('submissions/:id')
  updateSubmission(
    @Param('id') id: string,
    @Body()
    body: {
      studentName?: string;
      studentPhone?: string;
      parentPhone?: string;
      notes?: string | null;
      totalAmount?: number;
      offeringIds?: string[];
    },
  ) {
    return this.booking.updateSubmission(id, body);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  @Post('submissions/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.booking.cancelSubmission(id);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Delete('submissions/:id')
  deleteSubmission(@Param('id') id: string) {
    return this.booking.deleteSubmission(id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  @Post('ensure-paper-forms')
  ensurePaperForms() {
    return this.booking.ensurePaperForms();
  }

  /** Import paper Excel rows as paid form submissions */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER, RoleCode.RECEPTION)
  @Post('import/paper')
  importPaper(
    @Body()
    body: {
      dryRun?: boolean;
      rows: Array<{
        studentName: string;
        studentPhone: string;
        parentPhone: string;
        grade?: string;
        formSlug?: string;
        notes?: string;
        feeAmount?: number;
        teachers?: string;
        formSerial?: number;
      }>;
    },
  ) {
    if (!body?.rows?.length) {
      return { total: 0, ok: 0, failed: 0, results: [] };
    }
    return this.booking.importPaperRows(body.rows, { dryRun: body.dryRun });
  }

  /** Sync Excel «م» serials onto existing submissions by phone */
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.CENTER_MANAGER)
  @Post('sync-serials')
  syncSerials(
    @Body()
    body: {
      rows: Array<{
        studentPhone: string;
        formSlug?: string;
        grade?: string;
        formSerial: number;
      }>;
    },
  ) {
    if (!body?.rows?.length) {
      return { total: 0, ok: 0, failed: 0, results: [] };
    }
    return this.booking.syncFormSerials(body.rows);
  }
}
