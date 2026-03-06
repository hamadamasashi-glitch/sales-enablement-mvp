import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LearningStatus, RecommendationStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(scorecardId: string, limit: number, user: AuthUser) {
    if (user.role === Role.REP) {
      throw new ForbiddenException('rep cannot generate recommendations');
    }

    const scorecard = await this.prisma.scorecard.findUnique({
      where: { id: scorecardId },
      include: {
        itemScores: true,
        deal: true
      }
    });

    if (!scorecard) {
      throw new NotFoundException('scorecard not found');
    }

    if (user.role === Role.MANAGER && !user.teamIds.includes(scorecard.deal.teamId)) {
      throw new ForbiddenException('manager cannot generate recommendations for this scorecard');
    }

    const weakTags = Array.from(
      new Set(scorecard.itemScores.filter((item) => item.score <= 2).map((item) => item.weakTag).filter(Boolean))
    ) as string[];

    if (weakTags.length === 0) {
      return { recommendations: [] };
    }

    const contents = await this.prisma.knowledgeContent.findMany({
      where: {
        tags: {
          some: {
            tag: { in: weakTags }
          }
        }
      },
      include: {
        tags: true
      },
      take: limit
    });

    const recommendations = [];

    for (const content of contents) {
      const matchTag = content.tags.find((tag) => weakTags.includes(tag.tag));
      const recommendation = await this.prisma.recommendation.create({
        data: {
          userId: scorecard.evaluatedUserId,
          scorecardId: scorecard.id,
          contentId: content.id,
          reason: `weak_tag=${matchTag?.tag ?? 'unknown'}`
        },
        include: {
          content: {
            select: {
              title: true
            }
          }
        }
      });

      await this.prisma.learningProgress.upsert({
        where: {
          userId_contentId: {
            userId: scorecard.evaluatedUserId,
            contentId: content.id
          }
        },
        update: {
          recommendationId: recommendation.id
        },
        create: {
          userId: scorecard.evaluatedUserId,
          contentId: content.id,
          recommendationId: recommendation.id
        }
      });

      recommendations.push({
        id: recommendation.id,
        contentId: recommendation.contentId,
        title: recommendation.content.title,
        reason: recommendation.reason,
        status: recommendation.status
      });
    }

    return { recommendations };
  }

  async list(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.recommendation.findMany({
        include: { content: true },
        orderBy: { generatedAt: 'desc' }
      });
    }

    if (user.role === Role.MANAGER) {
      return this.prisma.recommendation.findMany({
        where: {
          OR: [{ userId: user.sub }, { scorecard: { deal: { teamId: { in: user.teamIds } } } }]
        },
        include: { content: true },
        orderBy: { generatedAt: 'desc' }
      });
    }

    return this.prisma.recommendation.findMany({
      where: { userId: user.sub },
      include: { content: true },
      orderBy: { generatedAt: 'desc' }
    });
  }

  async updateStatus(id: string, status: RecommendationStatus, user: AuthUser) {
    const recommendation = await this.prisma.recommendation.findUnique({
      where: { id },
      include: {
        scorecard: {
          include: {
            deal: true
          }
        }
      }
    });

    if (!recommendation) {
      throw new NotFoundException('recommendation not found');
    }

    if (user.role === Role.REP && recommendation.userId !== user.sub) {
      throw new ForbiddenException('rep can update own recommendation only');
    }

    if (user.role === Role.MANAGER && !user.teamIds.includes(recommendation.scorecard.deal.teamId)) {
      throw new ForbiddenException('manager cannot update recommendation for this team');
    }

    const completedAt = status === RecommendationStatus.COMPLETED ? new Date() : null;

    const updated = await this.prisma.recommendation.update({
      where: { id },
      data: {
        status,
        completedAt
      }
    });

    await this.prisma.learningProgress.upsert({
      where: {
        userId_contentId: {
          userId: recommendation.userId,
          contentId: recommendation.contentId
        }
      },
      update: {
        status:
          status === RecommendationStatus.COMPLETED
            ? LearningStatus.COMPLETED
            : LearningStatus.IN_PROGRESS,
        completedAt: completedAt ?? undefined
      },
      create: {
        userId: recommendation.userId,
        contentId: recommendation.contentId,
        recommendationId: recommendation.id,
        status:
          status === RecommendationStatus.COMPLETED
            ? LearningStatus.COMPLETED
            : LearningStatus.IN_PROGRESS,
        completedAt: completedAt ?? undefined
      }
    });

    return updated;
  }
}
