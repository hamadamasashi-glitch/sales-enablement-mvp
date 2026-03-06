import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';

interface ImportRecord {
  dealId: string;
  actorUserId: string;
  type: ActivityType;
  occurredAt: string;
  durationSec?: number;
  outcome?: string;
  nextActionDue?: string;
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.crmActivity.findMany({ orderBy: { occurredAt: 'desc' } });
    }

    if (user.role === Role.MANAGER) {
      return this.prisma.crmActivity.findMany({
        where: {
          OR: [{ actorUserId: user.sub }, { deal: { teamId: { in: user.teamIds } } }]
        },
        orderBy: { occurredAt: 'desc' }
      });
    }

    return this.prisma.crmActivity.findMany({
      where: { actorUserId: user.sub },
      orderBy: { occurredAt: 'desc' }
    });
  }

  async importRecords(records: ImportRecord[], user: AuthUser) {
    let imported = 0;
    const errors: string[] = [];

    for (const [index, record] of records.entries()) {
      try {
        await this.assertAccess(record, user);
        await this.prisma.crmActivity.create({
          data: {
            dealId: record.dealId,
            actorUserId: record.actorUserId,
            type: record.type,
            occurredAt: new Date(record.occurredAt),
            durationSec: record.durationSec,
            outcome: record.outcome,
            nextActionDue: record.nextActionDue ? new Date(record.nextActionDue) : undefined
          }
        });
        imported += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        errors.push(`record ${index}: ${message}`);
      }
    }

    return {
      imported,
      skipped: errors.length,
      errors
    };
  }

  private async assertAccess(record: ImportRecord, user: AuthUser): Promise<void> {
    const deal = await this.prisma.deal.findUnique({ where: { id: record.dealId } });
    if (!deal) {
      throw new NotFoundException('deal not found');
    }

    if (user.role === Role.ADMIN) {
      return;
    }

    if (user.role === Role.MANAGER) {
      if (!user.teamIds.includes(deal.teamId) && deal.ownerUserId !== user.sub) {
        throw new ForbiddenException('manager cannot import activity for this deal');
      }
      return;
    }

    if (record.actorUserId !== user.sub || deal.ownerUserId !== user.sub) {
      throw new ForbiddenException('rep can import only own activities');
    }
  }
}
