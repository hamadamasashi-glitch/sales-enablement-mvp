import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth-user.interface';
import { ActivitiesService } from './activities.service';

@Controller('activities')
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.activitiesService.list(user);
  }

  @Post('import')
  import(
    @Body()
    body: {
      records?: Array<{
        dealId: string;
        actorUserId: string;
        type: ActivityType;
        occurredAt: string;
        durationSec?: number;
        outcome?: string;
        nextActionDue?: string;
      }>;
    },
    @CurrentUser() user: AuthUser
  ) {
    if (!body.records || !Array.isArray(body.records)) {
      throw new BadRequestException('records array is required');
    }

    return this.activitiesService.importRecords(body.records, user);
  }
}
