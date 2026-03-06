import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DealStage } from '@prisma/client';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateDealInput {
  title: string;
  ownerUserId?: string;
  teamId: string;
  stage?: DealStage;
  amount?: number;
  expectedCloseDate?: string;
  nextActionDue?: string;
}

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDeals(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.deal.findMany({
        orderBy: { createdAt: 'desc' }
      });
    }

    if (user.role === Role.MANAGER) {
      return this.prisma.deal.findMany({
        where: {
          OR: [{ ownerUserId: user.sub }, { teamId: { in: user.teamIds } }]
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    return this.prisma.deal.findMany({
      where: { ownerUserId: user.sub },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getDealById(id: string, user: AuthUser) {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (!this.canAccessDeal(user, deal.ownerUserId, deal.teamId)) {
      throw new ForbiddenException('You cannot access this deal');
    }

    return deal;
  }

  async createDeal(input: CreateDealInput, user: AuthUser) {
    const ownerUserId = input.ownerUserId ?? user.sub;

    if (user.role === Role.REP && ownerUserId !== user.sub) {
      throw new ForbiddenException('Rep can create only own deals');
    }

    if (user.role === Role.MANAGER && !user.teamIds.includes(input.teamId)) {
      throw new ForbiddenException('Manager can create deals only in own team');
    }

    return this.prisma.deal.create({
      data: {
        title: input.title,
        ownerUserId,
        teamId: input.teamId,
        stage: input.stage ?? DealStage.DISCOVERY,
        amount: input.amount,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
        nextActionDue: input.nextActionDue ? new Date(input.nextActionDue) : undefined
      }
    });
  }

  private canAccessDeal(user: AuthUser, ownerUserId: string, teamId: string): boolean {
    if (user.role === Role.ADMIN) {
      return true;
    }

    if (user.role === Role.MANAGER) {
      return ownerUserId === user.sub || user.teamIds.includes(teamId);
    }

    return ownerUserId === user.sub;
  }
}
