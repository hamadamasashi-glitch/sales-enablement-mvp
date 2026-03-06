import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DealStage } from '@prisma/client';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';

const DAY_IN_MS = 1000 * 60 * 60 * 24;
const NO_CONTACT_DAYS = 7;
const DEFAULT_NEXT_ACTION_UNSET_ALERT_THRESHOLD = 3;
const DEFAULT_NO_CONTACT_ALERT_THRESHOLD = 2;

interface RepProfile {
  id: string;
  name: string;
  email: string;
  teamIds: string[];
}

type AlertSeverity = 'OK' | 'WARNING' | 'CRITICAL';

interface BottleneckAlertCheck {
  code: 'NEXT_ACTION_UNSET' | 'NO_CONTACT_STALE';
  label: string;
  count: number;
  threshold: number;
  triggered: boolean;
  severity: AlertSeverity;
  message: string;
}

export interface BottleneckAlertResponse {
  scope: {
    type: 'REP' | 'TEAM';
    id: string;
    name: string;
  };
  period: {
    from: string;
    to: string;
  };
  thresholds: {
    nextActionUnset: number;
    noContact: number;
  };
  stats: {
    nextActionUnsetCount: number;
    noContactCount: number;
  };
  checks: BottleneckAlertCheck[];
  triggered: BottleneckAlertCheck[];
}

export interface RepDashboardMetrics {
  rep: {
    id: string;
    name: string;
    email: string;
  };
  period: {
    from: string;
    to: string;
  };
  activityCount: {
    CALL: number;
    MEETING: number;
    EMAIL: number;
    FOLLOW: number;
  };
  pipeline: {
    byStage: Record<DealStage, number>;
    averageStageAgingDays: number;
    stageAging: Array<{
      dealId: string;
      title: string;
      stage: DealStage;
      daysInStage: number;
    }>;
  };
  bottlenecks: {
    nextActionUnsetCount: number;
    noContactCount: number;
  };
  drilldown: Array<{
    dealId: string;
    title: string;
    stage: DealStage;
    nextActionDue: string | null;
    lastContactAt: string | null;
    daysInStage: number;
    latestActivity: {
      id: string;
      type: string;
      occurredAt: string;
      outcome: string | null;
    } | null;
    latestRecording: {
      id: string;
      mediaUrl: string | null;
      transcriptPreview: string;
      ingestedAt: string;
    } | null;
  }>;
}

export interface TeamDashboardMetrics {
  team: {
    id: string;
    name: string;
  };
  period: {
    from: string;
    to: string;
  };
  totals: {
    activityCount: {
      CALL: number;
      MEETING: number;
      EMAIL: number;
      FOLLOW: number;
    };
    pipeline: {
      byStage: Record<DealStage, number>;
      averageStageAgingDays: number;
    };
    bottlenecks: {
      nextActionUnsetCount: number;
      noContactCount: number;
    };
  };
  members: Array<{
    repId: string;
    name: string;
    email: string;
    activityCount: {
      CALL: number;
      MEETING: number;
      EMAIL: number;
      FOLLOW: number;
    };
    pipeline: {
      byStage: Record<DealStage, number>;
      averageStageAgingDays: number;
    };
    bottlenecks: {
      nextActionUnsetCount: number;
      noContactCount: number;
    };
  }>;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getBottleneckAlerts(
    authUser: AuthUser,
    query: {
      repId?: string;
      teamId?: string;
      from?: string;
      to?: string;
      nextActionUnsetThreshold?: number;
      noContactThreshold?: number;
    }
  ): Promise<BottleneckAlertResponse> {
    if (query.repId && query.teamId) {
      throw new BadRequestException('repId and teamId cannot be used together');
    }

    const period = this.parsePeriod(query.from, query.to);
    const nextActionUnsetThreshold = this.parseThreshold(
      query.nextActionUnsetThreshold,
      DEFAULT_NEXT_ACTION_UNSET_ALERT_THRESHOLD,
      'nextActionUnsetThreshold'
    );
    const noContactThreshold = this.parseThreshold(
      query.noContactThreshold,
      DEFAULT_NO_CONTACT_ALERT_THRESHOLD,
      'noContactThreshold'
    );

    const defaultTeamScopeId =
      authUser.role === Role.MANAGER && !query.teamId && !query.repId ? authUser.teamIds[0] : undefined;
    const teamScopeId = query.teamId ?? defaultTeamScopeId;

    if (authUser.role === Role.ADMIN && !teamScopeId && !query.repId) {
      throw new BadRequestException('admin must provide teamId or repId');
    }

    if (authUser.role === Role.REP && teamScopeId) {
      throw new ForbiddenException('rep cannot view team alerts');
    }

    if (teamScopeId) {
      const teamMetrics = await this.getTeamDashboard(
        teamScopeId,
        authUser,
        period.fromDate.toISOString(),
        period.toDate.toISOString()
      );

      const checks = this.buildAlertChecks(
        teamMetrics.totals.bottlenecks.nextActionUnsetCount,
        teamMetrics.totals.bottlenecks.noContactCount,
        nextActionUnsetThreshold,
        noContactThreshold
      );

      return {
        scope: {
          type: 'TEAM',
          id: teamMetrics.team.id,
          name: teamMetrics.team.name
        },
        period: {
          from: period.fromDate.toISOString().slice(0, 10),
          to: period.toDate.toISOString().slice(0, 10)
        },
        thresholds: {
          nextActionUnset: nextActionUnsetThreshold,
          noContact: noContactThreshold
        },
        stats: teamMetrics.totals.bottlenecks,
        checks,
        triggered: checks.filter((check) => check.triggered)
      };
    }

    let targetRepId = query.repId;
    if (!targetRepId) {
      if (authUser.role === Role.REP) {
        targetRepId = authUser.sub;
      } else {
        throw new BadRequestException('repId is required when team scope is not specified');
      }
    }

    const repMetrics = await this.getRepDashboard(
      targetRepId,
      authUser,
      period.fromDate.toISOString(),
      period.toDate.toISOString()
    );
    const checks = this.buildAlertChecks(
      repMetrics.bottlenecks.nextActionUnsetCount,
      repMetrics.bottlenecks.noContactCount,
      nextActionUnsetThreshold,
      noContactThreshold
    );

    return {
      scope: {
        type: 'REP',
        id: repMetrics.rep.id,
        name: repMetrics.rep.name
      },
      period: {
        from: period.fromDate.toISOString().slice(0, 10),
        to: period.toDate.toISOString().slice(0, 10)
      },
      thresholds: {
        nextActionUnset: nextActionUnsetThreshold,
        noContact: noContactThreshold
      },
      stats: repMetrics.bottlenecks,
      checks,
      triggered: checks.filter((check) => check.triggered)
    };
  }

  async getMyDashboard(user: AuthUser, from?: string, to?: string) {
    const period = this.parsePeriod(from, to);
    return this.getRepDashboard(user.sub, user, period.fromDate.toISOString(), period.toDate.toISOString());
  }

  async getRepDashboard(repId: string, authUser: AuthUser, from?: string, to?: string): Promise<RepDashboardMetrics> {
    const period = this.parsePeriod(from, to);
    const rep = await this.getAccessibleRepProfile(repId, authUser);

    return this.buildRepDashboard(rep, period.fromDate, period.toDate);
  }

  async getTeamDashboard(teamId: string, authUser: AuthUser, from?: string, to?: string): Promise<TeamDashboardMetrics> {
    const period = this.parsePeriod(from, to);
    this.assertCanViewTeam(authUser, teamId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true
      }
    });

    if (!team) {
      throw new NotFoundException('team not found');
    }

    const reps = await this.prisma.user.findMany({
      where: {
        teamMemberships: {
          some: {
            teamId
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamMemberships: {
          select: {
            teamId: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    const repUsers = reps.filter((row) => row.role === 'REP');

    const memberDashboards = await Promise.all(
      repUsers.map((rep) =>
        this.buildRepDashboard(
          {
            id: rep.id,
            name: rep.name,
            email: rep.email,
            teamIds: rep.teamMemberships.map((membership) => membership.teamId)
          },
          period.fromDate,
          period.toDate
        )
      )
    );

    const totals = memberDashboards.reduce(
      (acc, row) => {
        acc.activityCount.CALL += row.activityCount.CALL;
        acc.activityCount.MEETING += row.activityCount.MEETING;
        acc.activityCount.EMAIL += row.activityCount.EMAIL;
        acc.activityCount.FOLLOW += row.activityCount.FOLLOW;

        for (const stage of Object.keys(acc.pipeline.byStage) as DealStage[]) {
          acc.pipeline.byStage[stage] += row.pipeline.byStage[stage];
        }

        acc.bottlenecks.nextActionUnsetCount += row.bottlenecks.nextActionUnsetCount;
        acc.bottlenecks.noContactCount += row.bottlenecks.noContactCount;
        acc.pipeline.averageStageAgingDays += row.pipeline.averageStageAgingDays;

        return acc;
      },
      {
        activityCount: {
          CALL: 0,
          MEETING: 0,
          EMAIL: 0,
          FOLLOW: 0
        },
        pipeline: {
          byStage: this.createEmptyStageCount(),
          averageStageAgingDays: 0
        },
        bottlenecks: {
          nextActionUnsetCount: 0,
          noContactCount: 0
        }
      }
    );

    const averageStageAgingDays =
      memberDashboards.length === 0 ? 0 : Number((totals.pipeline.averageStageAgingDays / memberDashboards.length).toFixed(1));

    return {
      team: {
        id: team.id,
        name: team.name
      },
      period: {
        from: period.fromDate.toISOString().slice(0, 10),
        to: period.toDate.toISOString().slice(0, 10)
      },
      totals: {
        activityCount: totals.activityCount,
        pipeline: {
          byStage: totals.pipeline.byStage,
          averageStageAgingDays
        },
        bottlenecks: totals.bottlenecks
      },
      members: memberDashboards.map((row) => ({
        repId: row.rep.id,
        name: row.rep.name,
        email: row.rep.email,
        activityCount: row.activityCount,
        pipeline: {
          byStage: row.pipeline.byStage,
          averageStageAgingDays: row.pipeline.averageStageAgingDays
        },
        bottlenecks: row.bottlenecks
      }))
    };
  }

  private async buildRepDashboard(rep: RepProfile, fromDate: Date, toDate: Date): Promise<RepDashboardMetrics> {
    const activities = await this.prisma.crmActivity.findMany({
      where: {
        actorUserId: rep.id,
        occurredAt: {
          gte: fromDate,
          lte: toDate
        }
      },
      select: {
        type: true,
        outcome: true
      }
    });

    const deals = await this.prisma.deal.findMany({
      where: {
        ownerUserId: rep.id
      },
      include: {
        activities: {
          orderBy: {
            occurredAt: 'desc'
          },
          take: 1,
          select: {
            id: true,
            type: true,
            outcome: true,
            occurredAt: true
          }
        },
        recordings: {
          orderBy: {
            ingestedAt: 'desc'
          },
          take: 1,
          select: {
            id: true,
            mediaUrl: true,
            transcriptText: true,
            ingestedAt: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    const referenceTime = toDate.getTime();
    const noContactThreshold = referenceTime - NO_CONTACT_DAYS * DAY_IN_MS;

    const activityCount = {
      CALL: activities.filter((row) => row.type === 'CALL').length,
      MEETING: activities.filter((row) => row.type === 'MEETING').length,
      EMAIL: activities.filter((row) => row.type === 'EMAIL').length,
      FOLLOW: activities.filter((row) => this.isFollowActivity(row.outcome)).length
    };

    const byStage = this.createEmptyStageCount();
    let totalStageAgingDays = 0;

    for (const deal of deals) {
      byStage[deal.stage] += 1;
      totalStageAgingDays += this.daysBetween(referenceTime, deal.createdAt.getTime());
    }

    const stageAging = deals.map((deal) => ({
      dealId: deal.id,
      title: deal.title,
      stage: deal.stage,
      daysInStage: this.daysBetween(referenceTime, deal.createdAt.getTime())
    }));

    const nextActionUnsetCount = deals.filter((deal) => !deal.nextActionDue).length;
    const noContactCount = deals.filter((deal) => {
      const latest = deal.activities[0];
      return !latest || latest.occurredAt.getTime() < noContactThreshold;
    }).length;

    const drilldown = deals.map((deal) => {
      const latestActivity = deal.activities[0] ?? null;
      const latestRecording = deal.recordings[0] ?? null;

      return {
        dealId: deal.id,
        title: deal.title,
        stage: deal.stage,
        nextActionDue: deal.nextActionDue ? deal.nextActionDue.toISOString() : null,
        lastContactAt: latestActivity ? latestActivity.occurredAt.toISOString() : null,
        daysInStage: this.daysBetween(referenceTime, deal.createdAt.getTime()),
        latestActivity: latestActivity
          ? {
              id: latestActivity.id,
              type: latestActivity.type,
              occurredAt: latestActivity.occurredAt.toISOString(),
              outcome: latestActivity.outcome
            }
          : null,
        latestRecording: latestRecording
          ? {
              id: latestRecording.id,
              mediaUrl: latestRecording.mediaUrl,
              transcriptPreview: (latestRecording.transcriptText ?? '').slice(0, 120),
              ingestedAt: latestRecording.ingestedAt.toISOString()
            }
          : null
      };
    });

    return {
      rep: {
        id: rep.id,
        name: rep.name,
        email: rep.email
      },
      period: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10)
      },
      activityCount,
      pipeline: {
        byStage,
        averageStageAgingDays: deals.length === 0 ? 0 : Number((totalStageAgingDays / deals.length).toFixed(1)),
        stageAging
      },
      bottlenecks: {
        nextActionUnsetCount,
        noContactCount
      },
      drilldown
    };
  }

  private async getAccessibleRepProfile(repId: string, authUser: AuthUser): Promise<RepProfile> {
    const rep = await this.prisma.user.findUnique({
      where: {
        id: repId
      },
      select: {
        id: true,
        name: true,
        email: true,
        teamMemberships: {
          select: {
            teamId: true
          }
        }
      }
    });

    if (!rep) {
      throw new NotFoundException('user not found');
    }

    const teamIds = rep.teamMemberships.map((membership) => membership.teamId);
    this.assertCanViewRep(authUser, rep.id, teamIds);

    return {
      id: rep.id,
      name: rep.name,
      email: rep.email,
      teamIds
    };
  }

  private assertCanViewRep(authUser: AuthUser, repId: string, repTeamIds: string[]): void {
    if (authUser.role === Role.ADMIN) {
      return;
    }

    if (authUser.role === Role.REP) {
      if (authUser.sub !== repId) {
        throw new ForbiddenException('rep can only view own dashboard');
      }
      return;
    }

    const hasOverlap = repTeamIds.some((teamId) => authUser.teamIds.includes(teamId));
    if (!hasOverlap) {
      throw new ForbiddenException('manager can only view own team');
    }
  }

  private assertCanViewTeam(authUser: AuthUser, teamId: string): void {
    if (authUser.role === Role.ADMIN) {
      return;
    }

    if (authUser.role === Role.REP) {
      throw new ForbiddenException('rep cannot view team dashboard');
    }

    if (!authUser.teamIds.includes(teamId)) {
      throw new ForbiddenException('manager can only view own team dashboard');
    }
  }

  private createEmptyStageCount(): Record<DealStage, number> {
    return {
      DISCOVERY: 0,
      PROPOSAL: 0,
      NEGOTIATION: 0,
      CLOSED_WON: 0,
      CLOSED_LOST: 0
    };
  }

  private isFollowActivity(outcome: string | null): boolean {
    if (!outcome) {
      return false;
    }

    const normalized = outcome.toLowerCase();
    return (
      normalized.includes('follow') ||
      normalized.includes('next_step') ||
      normalized.includes('next-step') ||
      normalized.includes('next action')
    );
  }

  private daysBetween(toMs: number, fromMs: number): number {
    return Math.max(0, Math.floor((toMs - fromMs) / DAY_IN_MS));
  }

  private buildAlertChecks(
    nextActionUnsetCount: number,
    noContactCount: number,
    nextActionUnsetThreshold: number,
    noContactThreshold: number
  ): BottleneckAlertCheck[] {
    return [
      this.createAlertCheck(
        'NEXT_ACTION_UNSET',
        '次回アクション未設定',
        nextActionUnsetCount,
        nextActionUnsetThreshold
      ),
      this.createAlertCheck('NO_CONTACT_STALE', '連絡停滞案件', noContactCount, noContactThreshold)
    ];
  }

  private createAlertCheck(
    code: BottleneckAlertCheck['code'],
    label: string,
    count: number,
    threshold: number
  ): BottleneckAlertCheck {
    const triggered = count >= threshold;
    let severity: AlertSeverity = 'OK';

    if (triggered) {
      severity = count >= threshold * 2 ? 'CRITICAL' : 'WARNING';
    }

    return {
      code,
      label,
      count,
      threshold,
      triggered,
      severity,
      message: triggered
        ? `${label}が閾値(${threshold})を超過しました: ${count}`
        : `${label}は閾値未満です: ${count}/${threshold}`
    };
  }

  private parseThreshold(value: number | undefined, fallback: number, fieldName: string): number {
    const parsed = value === undefined ? fallback : Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new BadRequestException(`${fieldName} must be an integer greater than 0`);
    }

    return Math.floor(parsed);
  }

  private parsePeriod(from?: string, to?: string): { fromDate: Date; toDate: Date } {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * DAY_IN_MS);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('invalid from/to date');
    }

    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('from must be before to');
    }

    return { fromDate, toDate };
  }
}
