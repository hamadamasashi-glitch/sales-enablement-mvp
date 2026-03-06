import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { IngestService } from './ingest.service';
import { IngestCrmActivityRequest, IngestRecordingRequest } from './ingest.types';

@Controller('ingest')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('crm_activity')
  async ingestCrmActivity(@Body() body: IngestCrmActivityRequest | { records?: IngestCrmActivityRequest[] }, @CurrentUser() user: AuthUser) {
    const records = this.extractRecords(body);
    const results = await Promise.all(records.map((record) => this.ingestService.ingestCrmActivity(record, user)));

    return {
      processed: results.length,
      created: results.filter((row) => row.status === 'created').length,
      duplicate: results.filter((row) => row.status === 'duplicate').length,
      results
    };
  }

  @Post('recording')
  async ingestRecording(@Body() body: IngestRecordingRequest | { records?: IngestRecordingRequest[] }, @CurrentUser() user: AuthUser) {
    const records = this.extractRecords(body);
    const results = await Promise.all(records.map((record) => this.ingestService.ingestRecording(record, user)));

    return {
      processed: results.length,
      created: results.filter((row) => row.status === 'created').length,
      duplicate: results.filter((row) => row.status === 'duplicate').length,
      results
    };
  }

  private extractRecords<T>(body: T | { records?: T[] }): T[] {
    if (body && typeof body === 'object' && 'records' in body) {
      const records = body.records;
      if (!Array.isArray(records) || records.length === 0) {
        throw new BadRequestException('records must be a non-empty array');
      }
      return records;
    }

    return [body as T];
  }
}
