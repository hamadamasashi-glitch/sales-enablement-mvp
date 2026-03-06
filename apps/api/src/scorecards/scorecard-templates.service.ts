import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth-user.interface';
import { Role } from '../common/role.enum';
import { PrismaService } from '../prisma/prisma.service';

interface CreateTemplateInput {
  name: string;
  version?: string;
  isActive?: boolean;
  items: Array<{
    criterionKey: string;
    label: string;
    description?: string;
    category: string;
    weight: number;
    sortOrder?: number;
    isRequired?: boolean;
  }>;
}

@Injectable()
export class ScorecardTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.scorecardTemplate.findMany({
        include: {
          items: {
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
      });
    }

    return this.prisma.scorecardTemplate.findMany({
      where: { isActive: true },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
    });
  }

  async create(input: CreateTemplateInput, user: AuthUser) {
    this.assertAdmin(user);

    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('template items are required');
    }

    if (input.isActive) {
      await this.prisma.scorecardTemplate.updateMany({
        data: { isActive: false },
        where: { isActive: true }
      });
    }

    return this.prisma.scorecardTemplate.create({
      data: {
        name: input.name,
        version: input.version ?? 'v1',
        isActive: input.isActive ?? false,
        createdByUserId: user.sub,
        items: {
          create: input.items.map((item, index) => ({
            criterionKey: item.criterionKey,
            label: item.label,
            description: item.description,
            category: item.category,
            weight: item.weight,
            sortOrder: item.sortOrder ?? index,
            isRequired: item.isRequired ?? true
          }))
        }
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
  }

  async activate(templateId: string, user: AuthUser) {
    this.assertAdmin(user);

    const exists = await this.prisma.scorecardTemplate.findUnique({ where: { id: templateId } });
    if (!exists) {
      throw new NotFoundException('template not found');
    }

    await this.prisma.$transaction([
      this.prisma.scorecardTemplate.updateMany({
        data: { isActive: false },
        where: { isActive: true }
      }),
      this.prisma.scorecardTemplate.update({
        where: { id: templateId },
        data: { isActive: true }
      })
    ]);

    return this.prisma.scorecardTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
  }

  private assertAdmin(user: AuthUser): void {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('admin only');
    }
  }
}
