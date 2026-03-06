import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../src/common/role.enum';
import { IngestService } from '../src/ingest/ingest.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface MockUser {
  id: string;
  email: string;
}

interface MockDeal {
  id: string;
  externalRef: string;
  teamId: string;
}

interface MockActivity {
  id: string;
  source: string;
  externalEventId: string;
  dealId: string;
  actorUserId: string;
  type: 'CALL' | 'EMAIL' | 'MEETING';
  occurredAt: Date;
}

interface MockRecording {
  id: string;
  source: string;
  externalEventId: string;
  dealId: string;
  activityId?: string;
}

describe('IngestService (integration)', () => {
  let service: IngestService;

  const users: MockUser[] = [{ id: 'rep-1', email: 'rep@local.test' }];
  const deals: MockDeal[] = [{ id: 'deal-1', externalRef: 'deal-001', teamId: 'team-1' }];
  const activities: MockActivity[] = [];
  const recordings: MockRecording[] = [];

  const prismaMock = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) {
          return users.find((user) => user.id === where.id) ?? null;
        }
        if (where.email) {
          return users.find((user) => user.email === where.email) ?? null;
        }
        return null;
      })
    },
    deal: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return deals.find((deal) => deal.id === where.id) ?? null;
      }),
      findFirst: jest.fn(async ({ where }: { where: { externalRef?: string } }) => {
        return deals.find((deal) => deal.externalRef === where.externalRef) ?? null;
      })
    },
    crmActivity: {
      findFirst: jest.fn(
        async ({ where }: { where: { source?: string; externalEventId?: string } }) =>
          activities.find(
            (activity) => activity.source === where.source && activity.externalEventId === where.externalEventId
          ) ?? null
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return activities.find((activity) => activity.id === where.id) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Omit<MockActivity, 'id'> }) => {
        const created: MockActivity = {
          id: `act-${activities.length + 1}`,
          ...data
        };
        activities.push(created);
        return created;
      })
    },
    recording: {
      findFirst: jest.fn(
        async ({ where }: { where: { source?: string; externalEventId?: string } }) =>
          recordings.find(
            (recording) => recording.source === where.source && recording.externalEventId === where.externalEventId
          ) ?? null
      ),
      create: jest.fn(async ({ data }: { data: Omit<MockRecording, 'id'> }) => {
        const created: MockRecording = {
          id: `rec-${recordings.length + 1}`,
          ...data
        };
        recordings.push(created);
        return created;
      })
    }
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IngestService,
        {
          provide: PrismaService,
          useValue: prismaMock
        }
      ]
    }).compile();

    service = moduleRef.get(IngestService);
  });

  beforeEach(() => {
    activities.length = 0;
    recordings.length = 0;
    prismaMock.crmActivity.create.mockClear();
    prismaMock.recording.create.mockClear();
  });

  it('deduplicates crm activity and links recording to ingested activity', async () => {
    const authUser = {
      sub: 'mgr-1',
      email: 'manager@local.test',
      role: Role.MANAGER,
      teamIds: ['team-1']
    };

    const first = await service.ingestCrmActivity(
      {
        source: 'sample_crm',
        eventId: 'crm_evt_9001',
        activityType: 'meeting',
        occurredAt: '2026-03-01T10:00:00Z',
        user: { email: 'rep@local.test' },
        deal: { externalRef: 'deal-001' }
      },
      authUser
    );

    const second = await service.ingestCrmActivity(
      {
        source: 'sample_crm',
        eventId: 'crm_evt_9001',
        activityType: 'meeting',
        occurredAt: '2026-03-01T10:00:00Z',
        user: { email: 'rep@local.test' },
        deal: { externalRef: 'deal-001' }
      },
      authUser
    );

    const recording = await service.ingestRecording(
      {
        source: 'sample_recording',
        eventId: 'rec_evt_9001',
        recordingSourceType: 'external_url',
        transcriptText: '次アクションを合意。',
        activitySource: 'sample_crm',
        activityEventId: 'crm_evt_9001',
        deal: { externalRef: 'deal-001' },
        user: { email: 'rep@local.test' }
      },
      authUser
    );

    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(prismaMock.crmActivity.create).toHaveBeenCalledTimes(1);

    expect(recording.status).toBe('created');
    expect(recordings[0].activityId).toBe(activities[0].id);
  });
});
