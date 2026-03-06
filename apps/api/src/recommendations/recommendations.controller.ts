import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RecommendationStatus } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser } from '../common/auth-user.interface';
import { RecommendationsService } from './recommendations.service';

@Controller('recommendations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.recommendationsService.list(user);
  }

  @Post('generate')
  generate(
    @Body() body: { scorecardId?: string; limit?: number },
    @CurrentUser() user: AuthUser
  ) {
    if (!body.scorecardId) {
      throw new BadRequestException('scorecardId is required');
    }

    return this.recommendationsService.generate(body.scorecardId, body.limit ?? 3, user);
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: RecommendationStatus },
    @CurrentUser() user: AuthUser
  ) {
    if (!body.status) {
      throw new BadRequestException('status is required');
    }

    return this.recommendationsService.updateStatus(id, body.status, user);
  }
}
