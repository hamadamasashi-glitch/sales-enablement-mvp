import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser } from '../common/auth-user.interface';
import { ScorecardTemplatesService } from './scorecard-templates.service';

@Controller('scorecard-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScorecardTemplatesController {
  constructor(private readonly templatesService: ScorecardTemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.templatesService.list(user);
  }

  @Post()
  create(
    @Body()
    body: {
      name?: string;
      version?: string;
      isActive?: boolean;
      items?: Array<{
        criterionKey: string;
        label: string;
        description?: string;
        category: string;
        weight: number;
        sortOrder?: number;
        isRequired?: boolean;
      }>;
    },
    @CurrentUser() user: AuthUser
  ) {
    if (!body.name || !body.items || body.items.length === 0) {
      throw new BadRequestException('name and items are required');
    }

    return this.templatesService.create(
      {
        name: body.name,
        version: body.version,
        isActive: body.isActive,
        items: body.items
      },
      user
    );
  }

  @Post(':id/activate')
  activate(@Param('id') templateId: string, @CurrentUser() user: AuthUser) {
    return this.templatesService.activate(templateId, user);
  }
}
