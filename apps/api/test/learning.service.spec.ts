import { Test, TestingModule } from '@nestjs/testing';
import { ContentDifficulty, ContentType, LearningStatus, RecommendationStatus } from '@prisma/client';
import { Role } from '../src/common/role.enum';
import { LearningService } from '../src/learning/learning.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('LearningService (integration)', () => {
  let service: LearningService;

  const prismaMock: any = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    auditLog: {
      create: jest.fn()
    },
    scorecard: {
      findMany: jest.fn()
    },
    knowledgeContent: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn()
    },
    recommendation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    },
    learningProgress: {
      upsert: jest.fn(),
      findMany: jest.fn()
    }
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LearningService,
        {
          provide: PrismaService,
          useValue: prismaMock
        }
      ]
    }).compile();

    service = moduleRef.get(LearningService);
  });

  beforeEach(() => {
    for (const group of Object.values(prismaMock)) {
      for (const fn of Object.values(group as Record<string, jest.Mock>)) {
        fn.mockReset();
      }
    }
  });

  it('returns recommendations prioritized by low score tags', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'rep-1',
      role: 'REP',
      teamMemberships: [{ teamId: 'team-1' }]
    });

    prismaMock.scorecard.findMany.mockResolvedValue([
      {
        id: 'sc-1',
        itemScores: [
          { criterionKey: 'next_action_agreement', weakTag: 'closing', score: 1 },
          { criterionKey: 'pain_discovery', weakTag: 'discovery', score: 4 }
        ]
      }
    ]);

    prismaMock.knowledgeContent.findMany.mockResolvedValue([
      {
        id: 'kc-1',
        title: '次アクション合意の型',
        contentType: ContentType.VIDEO,
        difficulty: ContentDifficulty.BEGINNER,
        estimatedMinutes: 20,
        url: 'https://example.local/kc1',
        tags: [{ tag: 'closing' }]
      },
      {
        id: 'kc-2',
        title: '課題深掘りの基本',
        contentType: ContentType.DOC,
        difficulty: ContentDifficulty.BEGINNER,
        estimatedMinutes: 15,
        url: 'https://example.local/kc2',
        tags: [{ tag: 'discovery' }]
      }
    ]);

    prismaMock.recommendation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.recommendation.create
      .mockResolvedValueOnce({
        id: 'rec-1',
        status: RecommendationStatus.RECOMMENDED
      })
      .mockResolvedValueOnce({
        id: 'rec-2',
        status: RecommendationStatus.RECOMMENDED
      });

    prismaMock.learningProgress.upsert
      .mockResolvedValueOnce({ status: LearningStatus.NOT_STARTED, completedAt: null })
      .mockResolvedValueOnce({ status: LearningStatus.NOT_STARTED, completedAt: null });

    const result = await service.getRecommendations(
      {
        sub: 'rep-1',
        email: 'rep@local.test',
        role: Role.REP,
        teamIds: ['team-1']
      },
      undefined,
      5,
      2
    );

    expect(result.recommendations.length).toBe(1);
    expect(result.recommendations[0].content.id).toBe('kc-1');
    expect(result.recommendations[0].reason).toContain('closing');
  });

  it('stores completion and updates recommendation status', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'rep-1',
      role: 'REP',
      teamMemberships: [{ teamId: 'team-1' }]
    });

    prismaMock.knowledgeContent.findUnique.mockResolvedValue({
      id: 'kc-1'
    });

    prismaMock.learningProgress.upsert.mockResolvedValue({
      status: LearningStatus.COMPLETED,
      completedAt: new Date('2026-03-05T10:00:00Z'),
      spentMinutes: 18
    });

    prismaMock.recommendation.findFirst.mockResolvedValue({
      id: 'rec-1'
    });

    prismaMock.recommendation.update.mockResolvedValue({
      id: 'rec-1',
      status: RecommendationStatus.COMPLETED
    });

    const result = await service.markCompletion(
      {
        sub: 'rep-1',
        email: 'rep@local.test',
        role: Role.REP,
        teamIds: ['team-1']
      },
      {
        contentId: 'kc-1',
        spentMinutes: 18,
        completed: true
      }
    );

    expect(result.status).toBe(LearningStatus.COMPLETED);
    expect(prismaMock.recommendation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: RecommendationStatus.COMPLETED })
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'LEARNING_COMPLETED',
          resourceType: 'LearningProgress'
        })
      })
    );
  });

  it('returns team learning progress for manager', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'rep-1', name: 'Rep One', email: 'rep1@local.test' },
      { id: 'rep-2', name: 'Rep Two', email: 'rep2@local.test' }
    ]);

    prismaMock.recommendation.findMany.mockResolvedValue([
      { userId: 'rep-1', contentId: 'kc-1' },
      { userId: 'rep-1', contentId: 'kc-2' },
      { userId: 'rep-2', contentId: 'kc-3' }
    ]);

    prismaMock.learningProgress.findMany.mockResolvedValue([
      { userId: 'rep-1', contentId: 'kc-1', status: LearningStatus.COMPLETED },
      { userId: 'rep-1', contentId: 'kc-2', status: LearningStatus.IN_PROGRESS },
      { userId: 'rep-2', contentId: 'kc-3', status: LearningStatus.COMPLETED }
    ]);

    const result = await service.getTeamProgress(
      {
        sub: 'manager-1',
        email: 'manager@local.test',
        role: Role.MANAGER,
        teamIds: ['team-1']
      },
      'team-1'
    );

    expect(result.members).toHaveLength(2);
    expect(result.totals.recommendedCount).toBe(3);
    expect(result.totals.completedCount).toBe(2);
  });
});
