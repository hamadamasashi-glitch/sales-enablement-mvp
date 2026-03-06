const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const {
  PrismaClient,
  Role,
  DealStage,
  ActivityType,
  ContentType,
  ContentDifficulty,
  RecommendationStatus,
  LearningStatus,
  RecordingSourceType
} = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeSource(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : fallback;
}

function normalizeActivityType(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';

  if (['CALL', 'PHONE', 'PHONE_CALL'].includes(normalized)) {
    return ActivityType.CALL;
  }

  if (['EMAIL', 'MAIL'].includes(normalized)) {
    return ActivityType.EMAIL;
  }

  if (['MEETING', 'MTG'].includes(normalized)) {
    return ActivityType.MEETING;
  }

  throw new Error(`Unsupported activityType: ${value}`);
}

function normalizeRecordingSourceType(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';

  if (!normalized || normalized === 'EXTERNAL_URL' || normalized === 'URL') {
    return RecordingSourceType.EXTERNAL_URL;
  }

  if (normalized === 'UPLOAD') {
    return RecordingSourceType.UPLOAD;
  }

  throw new Error(`Unsupported recordingSourceType: ${value}`);
}

function parseDate(value, fieldName) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is not a valid datetime`);
  }

  return parsed;
}

async function loadSampleRecords(fileName) {
  const filePath = path.join(__dirname, '..', 'samples', 'ingest', fileName);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed || !Array.isArray(parsed.records)) {
    throw new Error(`${fileName} must contain a records array`);
  }

  return parsed.records;
}

async function resolveUserId(userRef) {
  if (!userRef || (typeof userRef.userId !== 'string' && typeof userRef.email !== 'string')) {
    throw new Error('user.userId or user.email is required');
  }

  if (userRef.userId) {
    const user = await prisma.user.findUnique({ where: { id: userRef.userId } });
    if (!user) {
      throw new Error(`user not found by id: ${userRef.userId}`);
    }
    return user.id;
  }

  const user = await prisma.user.findUnique({ where: { email: userRef.email } });
  if (!user) {
    throw new Error(`user not found by email: ${userRef.email}`);
  }

  return user.id;
}

async function resolveDealId(dealRef) {
  if (!dealRef || (typeof dealRef.dealId !== 'string' && typeof dealRef.externalRef !== 'string')) {
    throw new Error('deal.dealId or deal.externalRef is required');
  }

  if (dealRef.dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealRef.dealId } });
    if (!deal) {
      throw new Error(`deal not found by id: ${dealRef.dealId}`);
    }
    return deal.id;
  }

  const deal = await prisma.deal.findFirst({ where: { externalRef: dealRef.externalRef } });
  if (!deal) {
    throw new Error(`deal not found by externalRef: ${dealRef.externalRef}`);
  }

  return deal.id;
}

async function ingestCrmActivityRecord(record) {
  const source = normalizeSource(record.source, 'crm_ingest');
  const eventId = typeof record.eventId === 'string' ? record.eventId.trim() : '';
  if (!eventId) {
    throw new Error('crm activity eventId is required');
  }

  const existing = await prisma.crmActivity.findFirst({
    where: {
      source,
      externalEventId: eventId
    }
  });

  if (existing) {
    return existing;
  }

  const actorUserId = await resolveUserId(record.user);
  const dealId = await resolveDealId(record.deal);

  const occurredAt = parseDate(record.occurredAt, 'occurredAt');
  if (!occurredAt) {
    throw new Error('occurredAt is required');
  }

  return prisma.crmActivity.create({
    data: {
      source,
      externalEventId: eventId,
      dealId,
      actorUserId,
      type: normalizeActivityType(record.activityType),
      occurredAt,
      durationSec: record.durationSec,
      outcome: record.outcome,
      nextActionDue: parseDate(record.nextActionDue, 'nextActionDue'),
      metadata: record.metadata
    }
  });
}

async function resolveActivityIdByEvent(source, eventId) {
  const activity = await prisma.crmActivity.findFirst({
    where: {
      source: normalizeSource(source, 'crm_ingest'),
      externalEventId: eventId
    }
  });

  if (!activity) {
    throw new Error(`linked activity not found: ${eventId}`);
  }

  return activity.id;
}

async function ingestRecordingRecord(record) {
  const source = normalizeSource(record.source, 'recording_ingest');
  const eventId = typeof record.eventId === 'string' ? record.eventId.trim() : '';
  if (!eventId) {
    throw new Error('recording eventId is required');
  }

  const existing = await prisma.recording.findFirst({
    where: {
      source,
      externalEventId: eventId
    }
  });

  if (existing) {
    return existing;
  }

  const dealId = await resolveDealId(record.deal);

  let activityId;
  if (record.activityId) {
    activityId = record.activityId;
  } else if (record.activityEventId) {
    activityId = await resolveActivityIdByEvent(record.activitySource, record.activityEventId);
  }

  return prisma.recording.create({
    data: {
      source,
      externalEventId: eventId,
      dealId,
      activityId,
      sourceType: normalizeRecordingSourceType(record.recordingSourceType),
      mediaUrl: record.mediaUrl,
      transcriptText: record.transcriptText,
      language: record.language,
      metadata: record.metadata
    }
  });
}

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  await prisma.learningProgress.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.scorecardCategoryScore.deleteMany();
  await prisma.scorecardItemScore.deleteMany();
  await prisma.scorecard.deleteMany();
  await prisma.scorecardTemplateItem.deleteMany();
  await prisma.scorecardTemplate.deleteMany();
  await prisma.recording.deleteMany();
  await prisma.crmActivity.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.knowledgeContentTag.deleteMany();
  await prisma.knowledgeContent.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();

  const team = await prisma.team.create({
    data: {
      name: 'Alpha Team'
    }
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@local.test',
      passwordHash,
      name: 'Manager User',
      role: Role.MANAGER
    }
  });

  const rep = await prisma.user.create({
    data: {
      email: 'rep@local.test',
      passwordHash,
      name: 'Rep User',
      role: Role.REP,
      managerId: manager.id
    }
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@local.test',
      passwordHash,
      name: 'Admin User',
      role: Role.ADMIN
    }
  });

  await prisma.team.update({
    where: { id: team.id },
    data: {
      managerUserId: manager.id
    }
  });

  await prisma.teamMembership.createMany({
    data: [
      {
        teamId: team.id,
        userId: manager.id,
        membershipRole: 'MANAGER'
      },
      {
        teamId: team.id,
        userId: rep.id,
        membershipRole: 'REP'
      }
    ]
  });

  await prisma.deal.create({
    data: {
      externalRef: 'deal-001',
      title: 'MVP Pilot Opportunity',
      ownerUserId: rep.id,
      teamId: team.id,
      stage: DealStage.PROPOSAL,
      amount: 120000,
      nextActionDue: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5)
    }
  });

  await prisma.deal.create({
    data: {
      externalRef: 'deal-002',
      title: 'Expansion Opportunity',
      ownerUserId: rep.id,
      teamId: team.id,
      stage: DealStage.NEGOTIATION,
      amount: 220000,
      nextActionDue: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12)
    }
  });

  await prisma.deal.create({
    data: {
      externalRef: 'deal-003',
      title: 'New Discovery Account',
      ownerUserId: rep.id,
      teamId: team.id,
      stage: DealStage.DISCOVERY,
      amount: 80000,
      nextActionDue: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20)
    }
  });

  const crmRecords = await loadSampleRecords('crm_activities.json');
  for (const record of crmRecords) {
    await ingestCrmActivityRecord(record);
  }

  const recordingRecords = await loadSampleRecords('recordings.json');
  for (const record of recordingRecords) {
    await ingestRecordingRecord(record);
  }

  const firstRecording = await prisma.recording.findFirst({
    where: {
      source: 'sample_recording',
      externalEventId: 'rec_evt_1001'
    }
  });

  if (!firstRecording) {
    throw new Error('seed recording not found');
  }

  const template = await prisma.scorecardTemplate.create({
    data: {
      name: 'Sales Coaching v1',
      version: 'v1',
      isActive: true,
      createdByUserId: admin.id,
      items: {
        create: [
          {
            criterionKey: 'agenda_setting',
            label: 'アジェンダ設定',
            category: 'Discovery',
            weight: 10,
            sortOrder: 1
          },
          {
            criterionKey: 'pain_discovery',
            label: '課題深掘り',
            category: 'Discovery',
            weight: 20,
            sortOrder: 2
          },
          {
            criterionKey: 'value_mapping',
            label: '価値提案の整合',
            category: 'Proposal',
            weight: 15,
            sortOrder: 3
          },
          {
            criterionKey: 'proposal_clarity',
            label: '提案の明瞭さ',
            category: 'Proposal',
            weight: 15,
            sortOrder: 4
          },
          {
            criterionKey: 'objection_handling',
            label: '懸念対応',
            category: 'Close',
            weight: 15,
            sortOrder: 5
          },
          {
            criterionKey: 'next_action_agreement',
            label: '次アクション合意',
            category: 'Close',
            weight: 15,
            sortOrder: 6
          },
          {
            criterionKey: 'crm_hygiene',
            label: 'CRM記録品質',
            category: 'Close',
            weight: 10,
            sortOrder: 7
          }
        ]
      }
    },
    include: {
      items: true
    }
  });

  const itemByKey = new Map(template.items.map((item) => [item.criterionKey, item]));

  const scorecard = await prisma.scorecard.create({
    data: {
      dealId: firstRecording.dealId,
      recordingId: firstRecording.id,
      templateId: template.id,
      evaluatedUserId: rep.id,
      evaluatorUserId: manager.id,
      totalScore: 66,
      overallComment: '次アクション合意の改善が必要',
      itemScores: {
        create: [
          {
            criterionKey: 'agenda_setting',
            templateItemId: itemByKey.get('agenda_setting').id,
            category: 'Discovery',
            score: 3,
            comment: '冒頭の目的確認はできた',
            weakTag: 'planning'
          },
          {
            criterionKey: 'pain_discovery',
            templateItemId: itemByKey.get('pain_discovery').id,
            category: 'Discovery',
            score: 4,
            comment: '課題は具体化できた',
            weakTag: 'discovery'
          },
          {
            criterionKey: 'value_mapping',
            templateItemId: itemByKey.get('value_mapping').id,
            category: 'Proposal',
            score: 3,
            comment: '提案と課題の接続は概ね良好'
          },
          {
            criterionKey: 'proposal_clarity',
            templateItemId: itemByKey.get('proposal_clarity').id,
            category: 'Proposal',
            score: 3,
            comment: '結論は明確だが根拠が不足'
          },
          {
            criterionKey: 'objection_handling',
            templateItemId: itemByKey.get('objection_handling').id,
            category: 'Close',
            score: 3,
            comment: '主要懸念に回答'
          },
          {
            criterionKey: 'next_action_agreement',
            templateItemId: itemByKey.get('next_action_agreement').id,
            category: 'Close',
            score: 2,
            comment: '期日合意が不足',
            weakTag: 'closing'
          },
          {
            criterionKey: 'crm_hygiene',
            templateItemId: itemByKey.get('crm_hygiene').id,
            category: 'Close',
            score: 4,
            comment: '記録は十分に残せている'
          }
        ]
      },
      categoryScores: {
        create: [
          { category: 'Discovery', score: 3.67 },
          { category: 'Proposal', score: 3.0 },
          { category: 'Close', score: 3.0 }
        ]
      }
    }
  });

  const contentClosing = await prisma.knowledgeContent.create({
    data: {
      title: '次アクション合意の型',
      contentType: ContentType.VIDEO,
      difficulty: ContentDifficulty.BEGINNER,
      estimatedMinutes: 20,
      url: 'https://example.local/learning/closing-basics',
      tags: {
        create: [{ tag: 'closing' }, { tag: '次アクション合意' }]
      }
    }
  });

  const contentDiscovery = await prisma.knowledgeContent.create({
    data: {
      title: '課題深掘りヒアリングの基本',
      contentType: ContentType.DOC,
      difficulty: ContentDifficulty.BEGINNER,
      estimatedMinutes: 15,
      url: 'https://example.local/learning/discovery-basics',
      tags: {
        create: [{ tag: 'discovery' }, { tag: '課題深掘り' }, { tag: 'ヒアリング' }]
      }
    }
  });

  const contentCommunication = await prisma.knowledgeContent.create({
    data: {
      title: '提案の明瞭さを高める構成術',
      contentType: ContentType.VIDEO,
      difficulty: ContentDifficulty.INTERMEDIATE,
      estimatedMinutes: 18,
      url: 'https://example.local/learning/proposal-clarity',
      tags: {
        create: [{ tag: 'communication' }, { tag: 'proposal' }]
      }
    }
  });

  const recommendation = await prisma.recommendation.create({
    data: {
      userId: rep.id,
      scorecardId: scorecard.id,
      contentId: contentClosing.id,
      reason: 'weak_tag=closing',
      status: RecommendationStatus.RECOMMENDED
    }
  });

  await prisma.recommendation.create({
    data: {
      userId: rep.id,
      scorecardId: scorecard.id,
      contentId: contentDiscovery.id,
      reason: 'weak_tag=discovery',
      status: RecommendationStatus.IN_PROGRESS
    }
  });

  await prisma.learningProgress.create({
    data: {
      userId: rep.id,
      contentId: contentClosing.id,
      recommendationId: recommendation.id,
      status: LearningStatus.NOT_STARTED,
      spentMinutes: 0
    }
  });

  await prisma.learningProgress.create({
    data: {
      userId: rep.id,
      contentId: contentDiscovery.id,
      status: LearningStatus.IN_PROGRESS,
      spentMinutes: 12
    }
  });

  await prisma.learningProgress.create({
    data: {
      userId: rep.id,
      contentId: contentCommunication.id,
      status: LearningStatus.COMPLETED,
      spentMinutes: 21,
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2)
    }
  });

  const activityCount = await prisma.crmActivity.count({ where: { source: 'sample_crm' } });
  const recordingCount = await prisma.recording.count({ where: { source: 'sample_recording' } });

  console.log('Seed completed.');
  console.log(`Ingested activities: ${activityCount}`);
  console.log(`Ingested recordings: ${recordingCount}`);
  console.log('Login credentials:');
  console.log('admin@local.test / password123');
  console.log('manager@local.test / password123');
  console.log('rep@local.test / password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
