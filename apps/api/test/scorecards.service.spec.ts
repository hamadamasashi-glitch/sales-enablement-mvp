import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../src/common/role.enum';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScorecardsService } from '../src/scorecards/scorecards.service';

describe('ScorecardsService (integration)', () => {
  let service: ScorecardsService;

  const prismaMock: any = {
    recording: {
      findUnique: jest.fn()
    },
    auditLog: {
      create: jest.fn()
    },
    scorecardTemplate: {
      findFirst: jest.fn(),
      findUnique: jest.fn()
    },
    scorecard: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn()
    }
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ScorecardsService,
        {
          provide: PrismaService,
          useValue: prismaMock
        }
      ]
    }).compile();

    service = moduleRef.get(ScorecardsService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows manager to score recording and computes category scores', async () => {
    prismaMock.recording.findUnique.mockResolvedValue({
      id: 'rec-1',
      deal: {
        id: 'deal-1',
        ownerUserId: 'rep-1',
        teamId: 'team-1'
      }
    });

    prismaMock.scorecardTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      version: 'v1',
      items: [
        { id: 'i1', criterionKey: 'agenda_setting', category: 'Discovery', weight: 10, isRequired: true },
        { id: 'i2', criterionKey: 'pain_discovery', category: 'Discovery', weight: 20, isRequired: true },
        {
          id: 'i3',
          criterionKey: 'next_action_agreement',
          category: 'Close',
          weight: 15,
          isRequired: true
        }
      ]
    });

    prismaMock.scorecard.create.mockResolvedValue({
      id: 'sc-1',
      totalScore: 62.22,
      categoryScores: [
        { category: 'Discovery', score: 3.67 },
        { category: 'Close', score: 2.0 }
      ],
      itemScores: [],
      template: { id: 'tpl-1' }
    });

    const created = await service.create(
      {
        recordingId: 'rec-1',
        items: [
          { criterionKey: 'agenda_setting', score: 3, comment: 'ok' },
          { criterionKey: 'pain_discovery', score: 4, comment: 'good' },
          { criterionKey: 'next_action_agreement', score: 2, comment: 'need improvement' }
        ]
      },
      {
        sub: 'manager-1',
        email: 'manager@local.test',
        role: Role.MANAGER,
        teamIds: ['team-1']
      }
    );

    expect(created.id).toBe('sc-1');
    expect(created.weakTags).toContain('closing');
    expect(prismaMock.scorecard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recordingId: 'rec-1',
          evaluatedUserId: 'rep-1',
          evaluatorUserId: 'manager-1'
        })
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SCORECARD_CREATED',
          resourceType: 'Scorecard',
          resourceId: 'sc-1'
        })
      })
    );
  });

  it('blocks rep from scoring', async () => {
    await expect(
      service.create(
        {
          recordingId: 'rec-1',
          items: [{ criterionKey: 'agenda_setting', score: 3 }]
        },
        {
          sub: 'rep-1',
          email: 'rep@local.test',
          role: Role.REP,
          teamIds: ['team-1']
        }
      )
    ).rejects.toThrow('manager only can evaluate recording');
  });

  it('returns recording score history for owner rep only', async () => {
    prismaMock.recording.findUnique.mockResolvedValue({
      id: 'rec-1',
      deal: {
        id: 'deal-1',
        ownerUserId: 'rep-1',
        teamId: 'team-1'
      }
    });

    prismaMock.scorecard.findMany.mockResolvedValue([
      {
        id: 'sc-1',
        evaluatorUser: {
          id: 'manager-1',
          name: 'Manager',
          email: 'manager@local.test'
        }
      }
    ]);

    const rows = await service.getRecordingHistory('rec-1', {
      sub: 'rep-1',
      email: 'rep@local.test',
      role: Role.REP,
      teamIds: ['team-1']
    });

    expect(rows.length).toBe(1);

    await expect(
      service.getRecordingHistory('rec-1', {
        sub: 'rep-2',
        email: 'rep2@local.test',
        role: Role.REP,
        teamIds: ['team-1']
      })
    ).rejects.toThrow('rep cannot view this scorecard');
  });
});
