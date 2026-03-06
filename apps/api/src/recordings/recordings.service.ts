import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RecordingSourceType } from '@prisma/client';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';

interface CreateRecordingInput {
  dealId: string;
  activityId?: string;
  sourceType?: RecordingSourceType;
  mediaUrl?: string;
  transcriptText?: string;
  language?: string;
}

@Injectable()
export class RecordingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.recording.findMany({
        include: {
          deal: {
            select: {
              id: true,
              title: true,
              ownerUserId: true,
              teamId: true
            }
          }
        },
        orderBy: { ingestedAt: 'desc' }
      });
    }

    if (user.role === Role.MANAGER) {
      return this.prisma.recording.findMany({
        where: {
          deal: {
            teamId: { in: user.teamIds }
          }
        },
        include: {
          deal: {
            select: {
              id: true,
              title: true,
              ownerUserId: true,
              teamId: true
            }
          }
        },
        orderBy: { ingestedAt: 'desc' }
      });
    }

    return this.prisma.recording.findMany({
      where: {
        deal: {
          ownerUserId: user.sub
        }
      },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            ownerUserId: true,
            teamId: true
          }
        }
      },
      orderBy: { ingestedAt: 'desc' }
    });
  }

  async getById(id: string, user: AuthUser) {
    const recording = await this.prisma.recording.findUnique({
      where: { id },
      include: {
        deal: true
      }
    });

    if (!recording) {
      throw new NotFoundException('recording not found');
    }

    if (user.role === Role.ADMIN) {
      return recording;
    }

    if (user.role === Role.MANAGER && user.teamIds.includes(recording.deal.teamId)) {
      return recording;
    }

    if (user.role === Role.REP && recording.deal.ownerUserId === user.sub) {
      return recording;
    }

    throw new ForbiddenException('cannot access this recording');
  }

  async create(input: CreateRecordingInput, user: AuthUser) {
    const deal = await this.prisma.deal.findUnique({ where: { id: input.dealId } });
    if (!deal) {
      throw new NotFoundException('deal not found');
    }

    if (user.role === Role.MANAGER && !user.teamIds.includes(deal.teamId)) {
      throw new ForbiddenException('manager cannot create recording for this deal');
    }

    if (user.role === Role.REP && deal.ownerUserId !== user.sub) {
      throw new ForbiddenException('rep cannot create recording for others');
    }

    return this.prisma.recording.create({
      data: {
        dealId: input.dealId,
        activityId: input.activityId,
        sourceType: input.sourceType ?? RecordingSourceType.EXTERNAL_URL,
        mediaUrl: input.mediaUrl,
        transcriptText: input.transcriptText,
        language: input.language
      }
    });
  }
}
