import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  ContentDifficulty,
  ContentType,
  LearningStatus,
  Prisma,
  RecommendationStatus,
  Role as PrismaRole
} from '@prisma/client';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWeakTag } from '../scorecards/scoring.util';

interface RecommendationTagScore {
  tag: string;
  weight: number;
}

interface CompletionInput {
  contentId: string;
  repId?: string;
  spentMinutes?: number;
  completed?: boolean;
}

interface CreateContentInput {
  title: string;
  contentType?: string;
  difficulty?: string;
  estimatedMinutes?: number;
  url: string;
  tags: string[];
}

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecommendations(user: AuthUser, repId?: string, limit = 5, threshold = 2) {
    const targetRepId = await this.resolveTargetRepId(user, repId);
    const normalizedLimit = Math.max(1, Math.min(10, Number(limit) || 5));
    const normalizedThreshold = Math.max(0, Math.min(5, Number(threshold) || 2));

    const recentScorecards = await this.prisma.scorecard.findMany({
      where: {
        evaluatedUserId: targetRepId
      },
      include: {
        itemScores: true
      },
      orderBy: { evaluatedAt: 'desc' },
      take: 10
    });

    if (recentScorecards.length === 0) {
      return {
        repId: targetRepId,
        recommendations: []
      };
    }

    const tagScores = this.collectTagScores(recentScorecards, normalizedThreshold);
    if (tagScores.length === 0) {
      return {
        repId: targetRepId,
        recommendations: []
      };
    }

    const candidateContents = await this.prisma.knowledgeContent.findMany({
      where: {
        status: 'PUBLISHED',
        tags: {
          some: {
            tag: {
              in: tagScores.map((tag) => tag.tag)
            }
          }
        }
      },
      include: {
        tags: true
      }
    });

    const latestScorecard = recentScorecards[0];
    const rows = [] as Array<{
      content: {
        id: string;
        title: string;
        contentType: string;
        difficulty: string;
        estimatedMinutes: number;
        url: string;
        tags: string[];
      };
      reason: string;
      rankScore: number;
      recommendationId: string;
      recommendationStatus: RecommendationStatus;
      learningStatus: LearningStatus;
      completedAt: string | null;
    }>;

    for (const content of candidateContents) {
      const matchedTags = content.tags
        .map((tag) => tag.tag)
        .filter((tag) => tagScores.some((tagScore) => tagScore.tag === tag));

      if (matchedTags.length === 0) {
        continue;
      }

      const rankScore = matchedTags.reduce((sum, tag) => {
        const found = tagScores.find((tagScore) => tagScore.tag === tag);
        return sum + (found?.weight ?? 0);
      }, 0);

      const reason = `low_score_tags=${matchedTags.join(',')}`;

      const existingRecommendation = await this.prisma.recommendation.findFirst({
        where: {
          userId: targetRepId,
          contentId: content.id,
          scorecardId: latestScorecard.id
        },
        orderBy: {
          generatedAt: 'desc'
        }
      });

      const recommendation =
        existingRecommendation ??
        (await this.prisma.recommendation.create({
          data: {
            userId: targetRepId,
            scorecardId: latestScorecard.id,
            contentId: content.id,
            reason,
            status: RecommendationStatus.RECOMMENDED
          }
        }));

      const learningProgress = await this.prisma.learningProgress.upsert({
        where: {
          userId_contentId: {
            userId: targetRepId,
            contentId: content.id
          }
        },
        update: {
          recommendationId: recommendation.id
        },
        create: {
          userId: targetRepId,
          contentId: content.id,
          recommendationId: recommendation.id,
          status: LearningStatus.NOT_STARTED,
          spentMinutes: 0
        }
      });

      rows.push({
        content: {
          id: content.id,
          title: content.title,
          contentType: content.contentType,
          difficulty: content.difficulty,
          estimatedMinutes: content.estimatedMinutes,
          url: content.url,
          tags: content.tags.map((tag) => tag.tag)
        },
        reason,
        rankScore,
        recommendationId: recommendation.id,
        recommendationStatus: recommendation.status,
        learningStatus: learningProgress.status,
        completedAt: learningProgress.completedAt ? learningProgress.completedAt.toISOString() : null
      });
    }

    const sorted = rows
      .sort((a, b) => {
        if (b.rankScore !== a.rankScore) {
          return b.rankScore - a.rankScore;
        }

        const statusWeight = (status: LearningStatus) => {
          if (status === LearningStatus.NOT_STARTED) return 3;
          if (status === LearningStatus.IN_PROGRESS) return 2;
          return 1;
        };

        return statusWeight(b.learningStatus) - statusWeight(a.learningStatus);
      })
      .slice(0, normalizedLimit);

    return {
      repId: targetRepId,
      threshold: normalizedThreshold,
      recommendations: sorted
    };
  }

  async markCompletion(user: AuthUser, input: CompletionInput) {
    if (!input.contentId) {
      throw new BadRequestException('contentId is required');
    }

    const targetRepId = await this.resolveTargetRepId(user, input.repId);
    const content = await this.prisma.knowledgeContent.findUnique({ where: { id: input.contentId } });

    if (!content) {
      throw new NotFoundException('content not found');
    }

    const isCompleted = input.completed !== false;
    const learningStatus = isCompleted ? LearningStatus.COMPLETED : LearningStatus.IN_PROGRESS;
    const completedAt = isCompleted ? new Date() : null;

    const progress = await this.prisma.learningProgress.upsert({
      where: {
        userId_contentId: {
          userId: targetRepId,
          contentId: input.contentId
        }
      },
      update: {
        status: learningStatus,
        spentMinutes: input.spentMinutes ?? 0,
        completedAt: completedAt ?? undefined
      },
      create: {
        userId: targetRepId,
        contentId: input.contentId,
        status: learningStatus,
        spentMinutes: input.spentMinutes ?? 0,
        completedAt: completedAt ?? undefined
      }
    });

    const latestRecommendation = await this.prisma.recommendation.findFirst({
      where: {
        userId: targetRepId,
        contentId: input.contentId
      },
      orderBy: {
        generatedAt: 'desc'
      }
    });

    if (latestRecommendation) {
      await this.prisma.recommendation.update({
        where: { id: latestRecommendation.id },
        data: {
          status: isCompleted ? RecommendationStatus.COMPLETED : RecommendationStatus.IN_PROGRESS,
          completedAt
        }
      });
    }

    if (isCompleted) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: user.sub,
          action: 'LEARNING_COMPLETED',
          resourceType: 'LearningProgress',
          resourceId: progress.id,
          afterJson: {
            userId: targetRepId,
            contentId: input.contentId,
            status: progress.status,
            spentMinutes: progress.spentMinutes,
            completedAt: progress.completedAt ? progress.completedAt.toISOString() : null
          }
        }
      });
    }

    return {
      repId: targetRepId,
      contentId: input.contentId,
      status: progress.status,
      completedAt: progress.completedAt ? progress.completedAt.toISOString() : null,
      spentMinutes: progress.spentMinutes
    };
  }

  async getTeamProgress(user: AuthUser, teamId?: string) {
    if (user.role === Role.REP) {
      throw new ForbiddenException('rep cannot view team learning progress');
    }

    const resolvedTeamId = teamId ?? user.teamIds[0];
    if (!resolvedTeamId) {
      throw new BadRequestException('teamId is required');
    }

    if (user.role === Role.MANAGER && !user.teamIds.includes(resolvedTeamId)) {
      throw new ForbiddenException('manager can view only own team progress');
    }

    const reps = await this.prisma.user.findMany({
      where: {
        role: PrismaRole.REP,
        teamMemberships: {
          some: {
            teamId: resolvedTeamId
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    const repIds = reps.map((rep) => rep.id);

    const recommendations = await this.prisma.recommendation.findMany({
      where: {
        userId: {
          in: repIds
        }
      },
      select: {
        userId: true,
        contentId: true
      }
    });

    const progressRows = await this.prisma.learningProgress.findMany({
      where: {
        userId: {
          in: repIds
        }
      },
      select: {
        userId: true,
        contentId: true,
        status: true
      }
    });

    const items = reps.map((rep) => {
      const recommendedContentSet = new Set(
        recommendations.filter((row) => row.userId === rep.id).map((row) => row.contentId)
      );

      const progress = progressRows.filter((row) => row.userId === rep.id);
      for (const row of progress) {
        recommendedContentSet.add(row.contentId);
      }

      const completedCount = progress.filter((row) => row.status === LearningStatus.COMPLETED).length;
      const inProgressCount = progress.filter((row) => row.status === LearningStatus.IN_PROGRESS).length;
      const recommendedCount = recommendedContentSet.size;

      return {
        repId: rep.id,
        name: rep.name,
        email: rep.email,
        recommendedCount,
        completedCount,
        inProgressCount,
        completionRate: recommendedCount === 0 ? 0 : Number((completedCount / recommendedCount).toFixed(2))
      };
    });

    const totals = items.reduce(
      (acc, row) => {
        acc.recommendedCount += row.recommendedCount;
        acc.completedCount += row.completedCount;
        acc.inProgressCount += row.inProgressCount;
        return acc;
      },
      {
        recommendedCount: 0,
        completedCount: 0,
        inProgressCount: 0
      }
    );

    return {
      teamId: resolvedTeamId,
      totals: {
        ...totals,
        completionRate:
          totals.recommendedCount === 0 ? 0 : Number((totals.completedCount / totals.recommendedCount).toFixed(2))
      },
      members: items
    };
  }

  async listContents(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.knowledgeContent.findMany({
        include: {
          tags: true
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    return this.prisma.knowledgeContent.findMany({
      where: {
        status: 'PUBLISHED'
      },
      include: {
        tags: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createContent(user: AuthUser, input: CreateContentInput) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('admin only');
    }

    if (!input.title || !input.url || !input.tags || input.tags.length === 0) {
      throw new BadRequestException('title, url and tags are required');
    }

    const normalizedTags = Array.from(
      new Set(
        input.tags
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      )
    );

    if (normalizedTags.length === 0) {
      throw new BadRequestException('at least one valid tag is required');
    }

    return this.prisma.knowledgeContent.create({
      data: {
        title: input.title,
        contentType: this.parseContentType(input.contentType),
        difficulty: this.parseDifficulty(input.difficulty),
        estimatedMinutes: input.estimatedMinutes ?? 15,
        url: input.url,
        status: 'PUBLISHED',
        tags: {
          create: normalizedTags.map((tag) => ({ tag }))
        }
      },
      include: {
        tags: true
      }
    });
  }

  private collectTagScores(
    scorecards: Array<{
      itemScores: Array<{ criterionKey: string; weakTag: string | null; score: number }>;
    }>,
    threshold: number
  ): RecommendationTagScore[] {
    const tagToScore = new Map<string, number>();

    for (const scorecard of scorecards) {
      for (const item of scorecard.itemScores) {
        if (item.score > threshold) {
          continue;
        }

        const tag = item.weakTag ?? resolveWeakTag(item.criterionKey);
        const severity = threshold - item.score + 1;
        tagToScore.set(tag, (tagToScore.get(tag) ?? 0) + severity);
      }
    }

    return Array.from(tagToScore.entries())
      .map(([tag, weight]) => ({ tag, weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  private async resolveTargetRepId(user: AuthUser, repId?: string): Promise<string> {
    const targetRepId = repId ?? user.sub;

    const rep = await this.prisma.user.findUnique({
      where: { id: targetRepId },
      select: {
        id: true,
        role: true,
        teamMemberships: {
          select: {
            teamId: true
          }
        }
      }
    });

    if (!rep) {
      throw new NotFoundException('rep not found');
    }

    if (rep.role !== PrismaRole.REP) {
      throw new BadRequestException('repId must be a REP user');
    }

    if (user.role === Role.ADMIN) {
      return targetRepId;
    }

    if (user.role === Role.REP) {
      if (user.sub !== targetRepId) {
        throw new ForbiddenException('rep can access only own learning data');
      }
      return targetRepId;
    }

    const repTeamIds = rep.teamMemberships.map((membership) => membership.teamId);
    const hasTeamOverlap = repTeamIds.some((teamId) => user.teamIds.includes(teamId));
    if (!hasTeamOverlap) {
      throw new ForbiddenException('manager can access only own team reps');
    }

    return targetRepId;
  }

  private parseContentType(input?: string): ContentType {
    const value = input?.trim().toUpperCase();
    if (!value || value === ContentType.VIDEO) {
      return ContentType.VIDEO;
    }

    if (value === ContentType.DOC) {
      return ContentType.DOC;
    }

    if (value === ContentType.QUIZ) {
      return ContentType.QUIZ;
    }

    throw new BadRequestException('contentType must be VIDEO, DOC or QUIZ');
  }

  private parseDifficulty(input?: string): ContentDifficulty {
    const value = input?.trim().toUpperCase();
    if (!value || value === ContentDifficulty.BEGINNER) {
      return ContentDifficulty.BEGINNER;
    }

    if (value === ContentDifficulty.INTERMEDIATE) {
      return ContentDifficulty.INTERMEDIATE;
    }

    if (value === ContentDifficulty.ADVANCED) {
      return ContentDifficulty.ADVANCED;
    }

    throw new BadRequestException('difficulty must be BEGINNER, INTERMEDIATE or ADVANCED');
  }
}
