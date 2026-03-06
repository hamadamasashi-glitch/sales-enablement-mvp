import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthUser } from '../common/auth-user.interface';
import { LearningService } from './learning.service';

@Controller('learning')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get('recommendations')
  getRecommendations(
    @CurrentUser() user: AuthUser,
    @Query('repId') repId?: string,
    @Query('limit') limit?: string,
    @Query('threshold') threshold?: string
  ) {
    return this.learningService.getRecommendations(
      user,
      repId,
      limit ? Number(limit) : undefined,
      threshold ? Number(threshold) : undefined
    );
  }

  @Post('completions')
  postCompletion(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      contentId?: string;
      repId?: string;
      spentMinutes?: number;
      completed?: boolean;
    }
  ) {
    if (!body.contentId) {
      throw new BadRequestException('contentId is required');
    }

    return this.learningService.markCompletion(user, {
      contentId: body.contentId,
      repId: body.repId,
      spentMinutes: body.spentMinutes,
      completed: body.completed
    });
  }

  @Get('team-progress')
  getTeamProgress(@CurrentUser() user: AuthUser, @Query('teamId') teamId?: string) {
    return this.learningService.getTeamProgress(user, teamId);
  }

  @Get('contents')
  listContents(@CurrentUser() user: AuthUser) {
    return this.learningService.listContents(user);
  }

  @Post('contents')
  createContent(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title?: string;
      contentType?: string;
      difficulty?: string;
      estimatedMinutes?: number;
      url?: string;
      tags?: string[];
    }
  ) {
    if (!body.title || !body.url || !body.tags || body.tags.length === 0) {
      throw new BadRequestException('title, url and tags are required');
    }

    return this.learningService.createContent(user, {
      title: body.title,
      contentType: body.contentType,
      difficulty: body.difficulty,
      estimatedMinutes: body.estimatedMinutes,
      url: body.url,
      tags: body.tags
    });
  }
}
