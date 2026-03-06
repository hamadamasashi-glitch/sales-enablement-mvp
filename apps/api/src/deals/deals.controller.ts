import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../common/auth-user.interface';
import { DealStage } from '@prisma/client';

@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.dealsService.listDeals(user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.dealsService.getDealById(id, user);
  }

  @Post()
  create(
    @Body()
    body: {
      title?: string;
      ownerUserId?: string;
      teamId?: string;
      stage?: DealStage;
      amount?: number;
      expectedCloseDate?: string;
      nextActionDue?: string;
    },
    @CurrentUser() user: AuthUser
  ) {
    if (!body.title || !body.teamId) {
      throw new BadRequestException('title and teamId are required');
    }

    return this.dealsService.createDeal(
      {
        title: body.title,
        ownerUserId: body.ownerUserId,
        teamId: body.teamId,
        stage: body.stage,
        amount: body.amount,
        expectedCloseDate: body.expectedCloseDate,
        nextActionDue: body.nextActionDue
      },
      user
    );
  }
}
