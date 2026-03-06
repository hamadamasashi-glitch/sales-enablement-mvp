import { ActivityType, Prisma, RecordingSourceType } from '@prisma/client';

export interface IngestUserRef {
  userId?: string;
  email?: string;
}

export interface IngestDealRef {
  dealId?: string;
  externalRef?: string;
}

export interface IngestCrmActivityRequest {
  source?: string;
  eventId?: string;
  activityType?: string;
  occurredAt?: string;
  durationSec?: number;
  outcome?: string;
  nextActionDue?: string;
  metadata?: Prisma.InputJsonValue;
  user?: IngestUserRef;
  deal?: IngestDealRef;
}

export interface IngestRecordingRequest {
  source?: string;
  eventId?: string;
  recordingSourceType?: string;
  mediaUrl?: string;
  transcriptText?: string;
  language?: string;
  metadata?: Prisma.InputJsonValue;
  user?: IngestUserRef;
  deal?: IngestDealRef;
  activityId?: string;
  activitySource?: string;
  activityEventId?: string;
}

export function normalizeSource(source: string | undefined, fallback: string): string {
  return source?.trim() ? source.trim().toLowerCase() : fallback;
}

export function normalizeActivityType(value: string | undefined): ActivityType {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) {
    throw new Error('activityType is required');
  }

  if (normalized === 'CALL' || normalized === 'PHONE' || normalized === 'PHONE_CALL') {
    return ActivityType.CALL;
  }

  if (normalized === 'EMAIL' || normalized === 'MAIL') {
    return ActivityType.EMAIL;
  }

  if (normalized === 'MEETING' || normalized === 'MTG') {
    return ActivityType.MEETING;
  }

  throw new Error('activityType must be one of call/email/meeting');
}

export function normalizeRecordingSourceType(value: string | undefined): RecordingSourceType {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) {
    return RecordingSourceType.EXTERNAL_URL;
  }

  if (normalized === 'EXTERNAL_URL' || normalized === 'URL') {
    return RecordingSourceType.EXTERNAL_URL;
  }

  if (normalized === 'UPLOAD') {
    return RecordingSourceType.UPLOAD;
  }

  throw new Error('recordingSourceType must be external_url or upload');
}

export function parseDate(value: string | undefined, fieldName: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is not a valid datetime`);
  }

  return parsed;
}
