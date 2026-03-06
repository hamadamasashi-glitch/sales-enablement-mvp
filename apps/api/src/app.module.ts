import { Module } from '@nestjs/common';
import { ActivitiesModule } from './activities/activities.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DealsModule } from './deals/deals.module';
import { IngestModule } from './ingest/ingest.module';
import { LearningModule } from './learning/learning.module';
import { PrismaModule } from './prisma/prisma.module';
import { RecordingsModule } from './recordings/recordings.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { ScorecardsModule } from './scorecards/scorecards.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    IngestModule,
    LearningModule,
    DealsModule,
    ActivitiesModule,
    RecordingsModule,
    ScorecardsModule,
    RecommendationsModule,
    DashboardModule
  ]
})
export class AppModule {}
