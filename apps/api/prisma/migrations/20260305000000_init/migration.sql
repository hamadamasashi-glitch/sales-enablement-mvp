-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'REP');
CREATE TYPE "DealStage" AS ENUM ('DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING');
CREATE TYPE "RecordingSourceType" AS ENUM ('EXTERNAL_URL', 'UPLOAD');
CREATE TYPE "ContentType" AS ENUM ('VIDEO', 'DOC', 'QUIZ');
CREATE TYPE "ContentDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "RecommendationStatus" AS ENUM ('RECOMMENDED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');
CREATE TYPE "LearningStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'REP',
  "managerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "managerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMembership" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "membershipRole" TEXT NOT NULL DEFAULT 'MEMBER',

  CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Deal" (
  "id" TEXT NOT NULL,
  "externalRef" TEXT,
  "title" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "stage" "DealStage" NOT NULL DEFAULT 'DISCOVERY',
  "amount" INTEGER,
  "expectedCloseDate" TIMESTAMP(3),
  "nextActionDue" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmActivity" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "type" "ActivityType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "durationSec" INTEGER,
  "outcome" TEXT,
  "nextActionDue" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Recording" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "activityId" TEXT,
  "sourceType" "RecordingSourceType" NOT NULL DEFAULT 'EXTERNAL_URL',
  "mediaUrl" TEXT,
  "transcriptText" TEXT,
  "language" TEXT,
  "metadata" JSONB,
  "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Scorecard" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "recordingId" TEXT,
  "evaluatedUserId" TEXT NOT NULL,
  "evaluatorUserId" TEXT NOT NULL,
  "rubricVersion" TEXT NOT NULL DEFAULT 'v1',
  "totalScore" DECIMAL(5,2) NOT NULL,
  "overallComment" TEXT,
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Scorecard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScorecardItemScore" (
  "id" TEXT NOT NULL,
  "scorecardId" TEXT NOT NULL,
  "criterionKey" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "weakTag" TEXT,

  CONSTRAINT "ScorecardItemScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeContent" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentType" "ContentType" NOT NULL,
  "difficulty" "ContentDifficulty" NOT NULL,
  "estimatedMinutes" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KnowledgeContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeContentTag" (
  "id" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "tag" TEXT NOT NULL,

  CONSTRAINT "KnowledgeContentTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Recommendation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scorecardId" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RecommendationStatus" NOT NULL DEFAULT 'RECOMMENDED',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "recommendationId" TEXT,
  "status" "LearningStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "spentMinutes" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "TeamMembership_teamId_userId_key" ON "TeamMembership"("teamId", "userId");
CREATE UNIQUE INDEX "Deal_externalRef_key" ON "Deal"("externalRef");
CREATE UNIQUE INDEX "Recording_activityId_key" ON "Recording"("activityId");
CREATE UNIQUE INDEX "KnowledgeContentTag_contentId_tag_key" ON "KnowledgeContentTag"("contentId", "tag");
CREATE UNIQUE INDEX "LearningProgress_userId_contentId_key" ON "LearningProgress"("userId", "contentId");

-- Foreign Keys
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CrmActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_evaluatedUserId_fkey" FOREIGN KEY ("evaluatedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScorecardItemScore" ADD CONSTRAINT "ScorecardItemScore_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeContentTag" ADD CONSTRAINT "KnowledgeContentTag_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "KnowledgeContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "KnowledgeContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "KnowledgeContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
