import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../src/auth/auth.service';
import { DealsService } from '../src/deals/deals.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role } from '../src/common/role.enum';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(async () => true)
}));

describe('Auth + Deals (integration)', () => {
  let authService: AuthService;
  let dealsService: DealsService;

  const dealFindMany = jest.fn();

  const prismaMock = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email: string } }) => {
        if (where.email !== 'rep@local.test') {
          return null;
        }

        return {
          id: 'rep-1',
          email: 'rep@local.test',
          passwordHash: 'dummy',
          name: 'Rep User',
          role: Role.REP
        };
      })
    },
    teamMembership: {
      findMany: jest.fn(async () => [{ teamId: 'team-1' }])
    },
    deal: {
      findMany: dealFindMany,
      findUnique: jest.fn(),
      create: jest.fn()
    }
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        DealsService,
        {
          provide: PrismaService,
          useValue: prismaMock
        }
      ]
    }).compile();

    authService = moduleRef.get(AuthService);
    dealsService = moduleRef.get(DealsService);
  });

  beforeEach(() => {
    dealFindMany.mockReset();
  });

  it('logs in with valid credentials', async () => {
    const response = await authService.login({
      email: 'rep@local.test',
      password: 'password123'
    });

    expect(response.accessToken).toBeDefined();
    expect(response.user.role).toBe(Role.REP);
  });

  it('filters deals for rep by ownerUserId', async () => {
    dealFindMany.mockResolvedValue([{ id: 'deal-1', ownerUserId: 'rep-1', teamId: 'team-1' }]);

    await dealsService.listDeals({
      sub: 'rep-1',
      email: 'rep@local.test',
      role: Role.REP,
      teamIds: ['team-1']
    });

    expect(dealFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerUserId: 'rep-1' }
      })
    );
  });

  it('prevents rep from creating deals for other users', async () => {
    await expect(
      dealsService.createDeal(
        {
          title: 'Not Allowed Deal',
          teamId: 'team-1',
          ownerUserId: 'another-user'
        },
        {
          sub: 'rep-1',
          email: 'rep@local.test',
          role: Role.REP,
          teamIds: ['team-1']
        }
      )
    ).rejects.toThrow('Rep can create only own deals');
  });
});
