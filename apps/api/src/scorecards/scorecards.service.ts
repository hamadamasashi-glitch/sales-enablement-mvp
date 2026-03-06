import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { calculateScore, clampScore, resolveWeakTag, ScorecardItemInput, TemplateCriterionInput } from './scoring.util';

interface CreateScorecardInput {
  recordingId: string;
  templateId?: string;
  overallComment?: string;
  items: ScorecardItemInput[];
}

@Injectable()
export class ScorecardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateScorecardInput, user: AuthUser) {
    if (user.role !== Role.MANAGER) {
      throw new ForbiddenException('manager only can evaluate recording');
    }

    const recording = await this.prisma.recording.findUnique({
      where: { id: input.recordingId },
      include: {
        deal: {
          select: {
            id: true,
            ownerUserId: true,
            teamId: true
          }
        }
      }
    });

    if (!recording) {
      throw new NotFoundException('recording not found');
    }

    if (!user.teamIds.includes(recording.deal.teamId)) {
      throw new ForbiddenException('manager cannot score this recording');
    }

    const template = await this.resolveTemplate(input.templateId);
    const templateItems = template.items;

    this.validateItems(input.items, templateItems);

    const templateCriteria: TemplateCriterionInput[] = templateItems.map((item) => ({
      criterionKey: item.criterionKey,
      category: item.category,
      weight: item.weight
    }));

    const { totalScore, weakTags, categoryScores } = calculateScore(input.items, templateCriteria);

    const templateItemMap = new Map(templateItems.map((item) => [item.criterionKey, item]));

    const scorecard = await this.prisma.scorecard.create({
      data: {
        dealId: recording.deal.id,
        recordingId: recording.id,
        templateId: template.id,
        evaluatedUserId: recording.deal.ownerUserId,
        evaluatorUserId: user.sub,
        rubricVersion: template.version,
        overallComment: input.overallComment,
        totalScore,
        itemScores: {
          create: input.items.map((item) => {
            const templateItem = templateItemMap.get(item.criterionKey);
            return {
              criterionKey: item.criterionKey,
              templateItemId: templateItem?.id,
              category: templateItem?.category ?? 'GENERAL',
              score: clampScore(item.score),
              comment: item.comment,
              weakTag: clampScore(item.score) <= 2 ? resolveWeakTag(item.criterionKey) : undefined
            };
          })
        },
        categoryScores: {
          create: categoryScores.map((row) => ({
            category: row.category,
            score: row.score
          }))
        }
      },
      include: {
        categoryScores: true,
        itemScores: true,
        template: true
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.sub,
        action: 'SCORECARD_CREATED',
        resourceType: 'Scorecard',
        resourceId: scorecard.id,
        afterJson: {
          dealId: scorecard.dealId,
          recordingId: scorecard.recordingId,
          templateId: scorecard.templateId,
          evaluatedUserId: scorecard.evaluatedUserId,
          evaluatorUserId: scorecard.evaluatorUserId,
          totalScore: Number(scorecard.totalScore),
          rubricVersion: scorecard.rubricVersion
        }
      }
    });

    return {
      ...scorecard,
      weakTags
    };
  }

  async list(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.scorecard.findMany({
        include: {
          recording: true,
          deal: true,
          evaluatorUser: { select: { id: true, name: true, email: true } },
          categoryScores: true
        },
        orderBy: { evaluatedAt: 'desc' }
      });
    }

    if (user.role === Role.MANAGER) {
      return this.prisma.scorecard.findMany({
        where: {
          OR: [{ evaluatorUserId: user.sub }, { deal: { teamId: { in: user.teamIds } } }]
        },
        include: {
          recording: true,
          deal: true,
          evaluatorUser: { select: { id: true, name: true, email: true } },
          categoryScores: true
        },
        orderBy: { evaluatedAt: 'desc' }
      });
    }

    return this.prisma.scorecard.findMany({
      where: { evaluatedUserId: user.sub },
      include: {
        recording: true,
        deal: true,
        evaluatorUser: { select: { id: true, name: true, email: true } },
        categoryScores: true
      },
      orderBy: { evaluatedAt: 'desc' }
    });
  }

  async getById(id: string, user: AuthUser) {
    const scorecard = await this.prisma.scorecard.findUnique({
      where: { id },
      include: {
        itemScores: true,
        categoryScores: true,
        deal: true,
        recording: true,
        template: {
          include: {
            items: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        evaluatorUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        evaluatedUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!scorecard) {
      throw new NotFoundException('scorecard not found');
    }

    this.assertCanViewScorecard(user, scorecard.deal.teamId, scorecard.evaluatedUserId);
    return scorecard;
  }

  async getRecordingHistory(recordingId: string, user: AuthUser) {
    const recording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        deal: true
      }
    });

    if (!recording) {
      throw new NotFoundException('recording not found');
    }

    this.assertCanViewScorecard(user, recording.deal.teamId, recording.deal.ownerUserId);

    return this.prisma.scorecard.findMany({
      where: { recordingId },
      include: {
        itemScores: true,
        categoryScores: true,
        evaluatorUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        template: true
      },
      orderBy: { evaluatedAt: 'desc' }
    });
  }

  private async resolveTemplate(templateId?: string) {
    if (templateId) {
      const explicit = await this.prisma.scorecardTemplate.findUnique({
        where: { id: templateId },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!explicit) {
        throw new NotFoundException('template not found');
      }

      if (explicit.items.length === 0) {
        throw new BadRequestException('template items are empty');
      }

      return explicit;
    }

    const active = await this.prisma.scorecardTemplate.findFirst({
      where: { isActive: true },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (!active) {
      throw new NotFoundException('active template not found');
    }

    if (active.items.length === 0) {
      throw new BadRequestException('template items are empty');
    }

    return active;
  }

  private validateItems(
    submittedItems: ScorecardItemInput[],
    templateItems: Array<{ criterionKey: string; isRequired: boolean }>
  ): void {
    if (!submittedItems || submittedItems.length === 0) {
      throw new BadRequestException('items are required');
    }

    const templateKeys = new Set(templateItems.map((item) => item.criterionKey));

    for (const item of submittedItems) {
      if (!templateKeys.has(item.criterionKey)) {
        throw new BadRequestException(`criterion ${item.criterionKey} is not in template`);
      }

      if (!Number.isFinite(item.score) || item.score < 0 || item.score > 5) {
        throw new BadRequestException(`score for ${item.criterionKey} must be between 0 and 5`);
      }
    }

    const submittedKeys = new Set(submittedItems.map((item) => item.criterionKey));
    const missingRequired = templateItems
      .filter((item) => item.isRequired)
      .filter((item) => !submittedKeys.has(item.criterionKey));

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `missing required criteria: ${missingRequired.map((item) => item.criterionKey).join(', ')}`
      );
    }
  }

  private assertCanViewScorecard(user: AuthUser, teamId: string, evaluatedUserId: string): void {
    if (user.role === Role.ADMIN) {
      return;
    }

    if (user.role === Role.MANAGER) {
      if (!user.teamIds.includes(teamId)) {
        throw new ForbiddenException('manager cannot view this scorecard');
      }
      return;
    }

    if (evaluatedUserId !== user.sub) {
      throw new ForbiddenException('rep cannot view this scorecard');
    }
  }
}
