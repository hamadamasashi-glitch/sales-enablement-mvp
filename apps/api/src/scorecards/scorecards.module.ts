import { Module } from '@nestjs/common';
import { ScorecardTemplatesController } from './scorecard-templates.controller';
import { ScorecardTemplatesService } from './scorecard-templates.service';
import { ScorecardsController } from './scorecards.controller';
import { ScorecardsService } from './scorecards.service';

@Module({
  controllers: [ScorecardsController, ScorecardTemplatesController],
  providers: [ScorecardsService, ScorecardTemplatesService],
  exports: [ScorecardsService, ScorecardTemplatesService]
})
export class ScorecardsModule {}
