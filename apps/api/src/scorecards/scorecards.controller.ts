import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser } from '../common/auth-user.interface';
import { ScorecardsService } from './scorecards.service';

@Controller('scorecards')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScorecardsController {
  constructor(private readonly scorecardsService: ScorecardsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.scorecardsService.list(user);
  }

  @Get('recordings/:recordingId/history')
  getRecordingHistory(@Param('recordingId') recordingId: string, @CurrentUser() user: AuthUser) {
    return this.scorecardsService.getRecordingHistory(recordingId, user);
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.scorecardsService.getById(id, user);
  }

  @Post()
  create(
    @Body()
    body: {
      recordingId?: string;
      templateId?: string;
      overallComment?: string;
      items?: Array<{ criterionKey: string; score: number; comment?: string }>;
    },
    @CurrentUser() user: AuthUser
  ) {
    if (!body.recordingId || !body.items || body.items.length === 0) {
      throw new BadRequestException('recordingId and items are required');
    }

    return this.scorecardsService.create(
      {
        recordingId: body.recordingId,
        templateId: body.templateId,
        overallComment: body.overallComment,
        items: body.items
      },
      user
    );
  }
}
