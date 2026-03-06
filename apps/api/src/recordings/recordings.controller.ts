import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RecordingSourceType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth-user.interface';
import { RecordingsService } from './recordings.service';

@Controller('recordings')
@UseGuards(JwtAuthGuard)
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.recordingsService.list(user);
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.recordingsService.getById(id, user);
  }

  @Post()
  create(
    @Body()
    body: {
      dealId?: string;
      activityId?: string;
      sourceType?: RecordingSourceType;
      mediaUrl?: string;
      transcriptText?: string;
      language?: string;
    },
    @CurrentUser() user: AuthUser
  ) {
    if (!body.dealId) {
      throw new BadRequestException('dealId is required');
    }

    return this.recordingsService.create(
      {
        dealId: body.dealId,
        activityId: body.activityId,
        sourceType: body.sourceType,
        mediaUrl: body.mediaUrl,
        transcriptText: body.transcriptText,
        language: body.language
      },
      user
    );
  }
}
