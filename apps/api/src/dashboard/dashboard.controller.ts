import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../common/auth-user.interface';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('me')
  getMyDashboard(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.dashboardService.getMyDashboard(user, from, to);
  }

  @Get('rep/:id')
  getRepDashboard(
    @Param('id') repId: string,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.dashboardService.getRepDashboard(repId, user, from, to);
  }

  @Get('team/:teamId')
  getTeamDashboard(
    @Param('teamId') teamId: string,
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.dashboardService.getTeamDashboard(teamId, user, from, to);
  }

  @Get('alerts')
  getBottleneckAlerts(
    @CurrentUser() user: AuthUser,
    @Query('repId') repId?: string,
    @Query('teamId') teamId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('nextActionUnsetThreshold') nextActionUnsetThreshold?: string,
    @Query('noContactThreshold') noContactThreshold?: string
  ) {
    return this.dashboardService.getBottleneckAlerts(user, {
      repId,
      teamId,
      from,
      to,
      nextActionUnsetThreshold: nextActionUnsetThreshold ? Number(nextActionUnsetThreshold) : undefined,
      noContactThreshold: noContactThreshold ? Number(noContactThreshold) : undefined
    });
  }
}
