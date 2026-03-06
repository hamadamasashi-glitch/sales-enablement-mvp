import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Deal, User } from '@prisma/client';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import {
  IngestCrmActivityRequest,
  IngestDealRef,
  IngestRecordingRequest,
  IngestUserRef,
  normalizeActivityType,
  normalizeRecordingSourceType,
  normalizeSource,
  parseDate
} from './ingest.types';

@Injectable()
export class IngestService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestCrmActivity(payload: IngestCrmActivityRequest, authUser: AuthUser) {
    const source = normalizeSource(payload.source, 'crm_ingest');
    const externalEventId = payload.eventId?.trim();

    if (!externalEventId) {
      throw new BadRequestException('eventId is required for idempotency');
    }

    const existing = await this.prisma.crmActivity.findFirst({
      where: {
        source,
        externalEventId
      }
    });

    if (existing) {
      return {
        status: 'duplicate',
        id: existing.id,
        dealId: existing.dealId,
        actorUserId: existing.actorUserId
      };
    }

    const actorUser = await this.resolveUser(payload.user);
    const deal = await this.resolveDeal(payload.deal);
    this.assertTeamScope(authUser, deal.teamId);

    if (authUser.role === Role.MANAGER && actorUser.id !== authUser.sub && !authUser.teamIds.includes(deal.teamId)) {
      throw new ForbiddenException('manager cannot ingest activity out of scope');
    }

    const activityType = this.safeNormalizeActivityType(payload.activityType);
    const occurredAt = this.safeParseDate(payload.occurredAt, 'occurredAt');
    if (!occurredAt) {
      throw new BadRequestException('occurredAt is required');
    }

    const created = await this.prisma.crmActivity.create({
      data: {
        source,
        externalEventId,
        dealId: deal.id,
        actorUserId: actorUser.id,
        type: activityType,
        occurredAt,
        durationSec: payload.durationSec,
        outcome: payload.outcome,
        nextActionDue: this.safeParseDate(payload.nextActionDue, 'nextActionDue'),
        metadata: payload.metadata
      }
    });

    return {
      status: 'created',
      id: created.id,
      dealId: created.dealId,
      actorUserId: created.actorUserId
    };
  }

  async ingestRecording(payload: IngestRecordingRequest, authUser: AuthUser) {
    const source = normalizeSource(payload.source, 'recording_ingest');
    const externalEventId = payload.eventId?.trim();

    if (!externalEventId) {
      throw new BadRequestException('eventId is required for idempotency');
    }

    const existing = await this.prisma.recording.findFirst({
      where: {
        source,
        externalEventId
      }
    });

    if (existing) {
      return {
        status: 'duplicate',
        id: existing.id,
        dealId: existing.dealId,
        activityId: existing.activityId
      };
    }

    const deal = await this.resolveDeal(payload.deal);
    this.assertTeamScope(authUser, deal.teamId);

    if (!payload.user && !payload.activityId && !payload.activityEventId) {
      throw new BadRequestException('recording must include user or linked activity');
    }

    const linkedUser = payload.user ? await this.resolveUser(payload.user) : null;
    const activity = await this.resolveActivity(payload);

    if (activity && activity.dealId !== deal.id) {
      throw new BadRequestException('activity does not belong to the given deal');
    }

    if (linkedUser && activity && activity.actorUserId !== linkedUser.id) {
      throw new BadRequestException('activity actor and user do not match');
    }

    if (linkedUser && !activity && linkedUser.id !== deal.ownerUserId) {
      throw new BadRequestException('user does not match deal owner without linked activity');
    }

    const created = await this.prisma.recording.create({
      data: {
        source,
        externalEventId,
        dealId: deal.id,
        activityId: activity?.id,
        sourceType: this.safeNormalizeRecordingSourceType(payload.recordingSourceType),
        mediaUrl: payload.mediaUrl,
        transcriptText: payload.transcriptText,
        language: payload.language,
        metadata: payload.metadata
      }
    });

    return {
      status: 'created',
      id: created.id,
      dealId: created.dealId,
      activityId: created.activityId
    };
  }

  private assertTeamScope(authUser: AuthUser, teamId: string): void {
    if (authUser.role === Role.ADMIN) {
      return;
    }

    if (!authUser.teamIds.includes(teamId)) {
      throw new ForbiddenException('cannot ingest data for this team');
    }
  }

  private async resolveUser(userRef: IngestUserRef | undefined): Promise<User> {
    if (!userRef?.userId && !userRef?.email) {
      throw new BadRequestException('user.userId or user.email is required');
    }

    const user = userRef.userId
      ? await this.prisma.user.findUnique({ where: { id: userRef.userId } })
      : await this.prisma.user.findUnique({ where: { email: userRef.email } });

    if (!user) {
      throw new NotFoundException('user not found');
    }

    return user;
  }

  private async resolveDeal(dealRef: IngestDealRef | undefined): Promise<Deal> {
    if (!dealRef?.dealId && !dealRef?.externalRef) {
      throw new BadRequestException('deal.dealId or deal.externalRef is required');
    }

    const deal = dealRef.dealId
      ? await this.prisma.deal.findUnique({ where: { id: dealRef.dealId } })
      : await this.prisma.deal.findFirst({ where: { externalRef: dealRef.externalRef } });

    if (!deal) {
      throw new NotFoundException('deal not found');
    }

    return deal;
  }

  private async resolveActivity(payload: IngestRecordingRequest) {
    if (payload.activityId) {
      const activity = await this.prisma.crmActivity.findUnique({ where: { id: payload.activityId } });
      if (!activity) {
        throw new NotFoundException('activity not found');
      }
      return activity;
    }

    if (!payload.activityEventId) {
      return null;
    }

    const activity = await this.prisma.crmActivity.findFirst({
      where: {
        source: normalizeSource(payload.activitySource, 'crm_ingest'),
        externalEventId: payload.activityEventId
      }
    });

    if (!activity) {
      throw new NotFoundException('linked activity event not found');
    }

    return activity;
  }

  private safeNormalizeActivityType(value: string | undefined) {
    try {
      return normalizeActivityType(value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'invalid activityType');
    }
  }

  private safeNormalizeRecordingSourceType(value: string | undefined) {
    try {
      return normalizeRecordingSourceType(value);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'invalid recordingSourceType');
    }
  }

  private safeParseDate(value: string | undefined, fieldName: string): Date | undefined {
    try {
      return parseDate(value, fieldName);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : `invalid ${fieldName}`);
    }
  }
}
