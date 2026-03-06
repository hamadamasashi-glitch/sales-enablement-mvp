import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../src/common/role.enum';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'REP';
  teamIds: string[];
}

interface MockDeal {
  id: string;
  title: string;
  ownerUserId: string;
  teamId: string;
  stage: 'DISCOVERY' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';
  nextActionDue: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockActivity {
  id: string;
  dealId: string;
  actorUserId: string;
  type: 'CALL' | 'MEETING' | 'EMAIL';
  outcome: string | null;
  occurredAt: Date;
}

interface MockRecording {
  id: string;
  dealId: string;
  mediaUrl: string | null;
  transcriptText: string | null;
  ingestedAt: Date;
}

describe('DashboardService (integration)', () => {
  let service: DashboardService;

  const users: MockUser[] = [
    {
      id: 'rep-1',
      name: 'Rep One',
      email: 'rep1@local.test',
      role: 'REP',
      teamIds: ['team-1']
    },
    {
      id: 'rep-2',
      name: 'Rep Two',
      email: 'rep2@local.test',
      role: 'REP',
      teamIds: ['team-1']
    }
  ];

  const deals: MockDeal[] = [
    {
      id: 'deal-1',
      title: 'Deal One',
      ownerUserId: 'rep-1',
      teamId: 'team-1',
      stage: 'PROPOSAL',
      nextActionDue: null,
      createdAt: new Date('2026-02-15T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z')
    },
    {
      id: 'deal-2',
      title: 'Deal Two',
      ownerUserId: 'rep-1',
      teamId: 'team-1',
      stage: 'NEGOTIATION',
      nextActionDue: new Date('2026-03-12T00:00:00Z'),
      createdAt: new Date('2026-03-02T00:00:00Z'),
      updatedAt: new Date('2026-03-04T00:00:00Z')
    },
    {
      id: 'deal-3',
      title: 'Deal Three',
      ownerUserId: 'rep-2',
      teamId: 'team-1',
      stage: 'DISCOVERY',
      nextActionDue: new Date('2026-03-09T00:00:00Z'),
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-05T00:00:00Z')
    }
  ];

  const activities: MockActivity[] = [
    {
      id: 'act-1',
      dealId: 'deal-1',
      actorUserId: 'rep-1',
      type: 'MEETING',
      outcome: 'next_step_agreed',
      occurredAt: new Date('2026-03-01T05:00:00Z')
    },
    {
      id: 'act-2',
      dealId: 'deal-1',
      actorUserId: 'rep-1',
      type: 'EMAIL',
      outcome: 'proposal_sent',
      occurredAt: new Date('2026-03-02T05:00:00Z')
    },
    {
      id: 'act-3',
      dealId: 'deal-2',
      actorUserId: 'rep-1',
      type: 'CALL',
      outcome: 'follow_call_completed',
      occurredAt: new Date('2026-03-03T05:00:00Z')
    },
    {
      id: 'act-4',
      dealId: 'deal-2',
      actorUserId: 'rep-1',
      type: 'CALL',
      outcome: 'old_call',
      occurredAt: new Date('2026-02-01T05:00:00Z')
    },
    {
      id: 'act-5',
      dealId: 'deal-3',
      actorUserId: 'rep-2',
      type: 'EMAIL',
      outcome: 'follow_mail',
      occurredAt: new Date('2026-03-03T05:00:00Z')
    }
  ];

  const recordings: MockRecording[] = [
    {
      id: 'rec-1',
      dealId: 'deal-1',
      mediaUrl: 'https://example.local/r1',
      transcriptText: '文字起こしA',
      ingestedAt: new Date('2026-03-01T06:00:00Z')
    },
    {
      id: 'rec-2',
      dealId: 'deal-2',
      mediaUrl: 'https://example.local/r2',
      transcriptText: '文字起こしB',
      ingestedAt: new Date('2026-03-03T06:00:00Z')
    }
  ];

  const prismaMock = {
    user: {
      findUnique: jest.fn(
        async ({ where }: { where: { id?: string } }) => {
          const user = users.find((row) => row.id === where.id);
          if (!user) {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            teamMemberships: user.teamIds.map((teamId) => ({ teamId }))
          };
        }
      ),
      findMany: jest.fn(async ({ where }: { where: { teamMemberships: { some: { teamId: string } } } }) => {
        const teamId = where.teamMemberships.some.teamId;
        return users
          .filter((user) => user.teamIds.includes(teamId))
          .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            teamMemberships: user.teamIds.map((value) => ({ teamId: value }))
          }));
      })
    },
    team: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id !== 'team-1') {
          return null;
        }

        return {
          id: 'team-1',
          name: 'Alpha Team'
        };
      })
    },
    crmActivity: {
      findMany: jest.fn(
        async ({ where }: { where: { actorUserId: string; occurredAt: { gte: Date; lte: Date } } }) =>
          activities.filter(
            (activity) =>
              activity.actorUserId === where.actorUserId &&
              activity.occurredAt >= where.occurredAt.gte &&
              activity.occurredAt <= where.occurredAt.lte
          )
      )
    },
    deal: {
      findMany: jest.fn(async ({ where }: { where: { ownerUserId: string } }) => {
        const repDeals = deals.filter((deal) => deal.ownerUserId === where.ownerUserId);

        return repDeals.map((deal) => ({
          ...deal,
          activities: activities
            .filter((activity) => activity.dealId === deal.id)
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
            .slice(0, 1),
          recordings: recordings
            .filter((recording) => recording.dealId === deal.id)
            .sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())
            .slice(0, 1)
        }));
      })
    }
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: prismaMock
        }
      ]
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  it('returns rep dashboard with activity/pipeline/bottleneck metrics', async () => {
    const dashboard = await service.getRepDashboard(
      'rep-1',
      {
        sub: 'manager-1',
        email: 'manager@local.test',
        role: Role.MANAGER,
        teamIds: ['team-1']
      },
      '2026-03-01',
      '2026-03-10'
    );

    expect(dashboard.activityCount).toEqual({
      CALL: 1,
      MEETING: 1,
      EMAIL: 1,
      FOLLOW: 2
    });
    expect(dashboard.bottlenecks.nextActionUnsetCount).toBe(1);
    expect(dashboard.bottlenecks.noContactCount).toBe(1);
    expect(dashboard.drilldown.length).toBe(2);
    expect(dashboard.drilldown[0].latestRecording?.mediaUrl).toContain('https://example.local/');
  });

  it('blocks rep from viewing another rep dashboard', async () => {
    await expect(
      service.getRepDashboard(
        'rep-1',
        {
          sub: 'rep-2',
          email: 'rep2@local.test',
          role: Role.REP,
          teamIds: ['team-1']
        },
        '2026-03-01',
        '2026-03-10'
      )
    ).rejects.toThrow('rep can only view own dashboard');
  });

  it('returns bottleneck alerts with threshold evaluation', async () => {
    const alerts = await service.getBottleneckAlerts(
      {
        sub: 'manager-1',
        email: 'manager@local.test',
        role: Role.MANAGER,
        teamIds: ['team-1']
      },
      {
        teamId: 'team-1',
        from: '2026-03-01',
        to: '2026-03-10',
        nextActionUnsetThreshold: 1,
        noContactThreshold: 1
      }
    );

    expect(alerts.scope.type).toBe('TEAM');
    expect(alerts.stats.nextActionUnsetCount).toBe(1);
    expect(alerts.stats.noContactCount).toBe(1);
    expect(alerts.triggered.map((row) => row.code)).toEqual(['NEXT_ACTION_UNSET', 'NO_CONTACT_STALE']);
  });

  it('blocks rep from requesting team alert scope', async () => {
    await expect(
      service.getBottleneckAlerts(
        {
          sub: 'rep-1',
          email: 'rep1@local.test',
          role: Role.REP,
          teamIds: ['team-1']
        },
        {
          teamId: 'team-1'
        }
      )
    ).rejects.toThrow('rep cannot view team alerts');
  });
});
