ALTER TABLE "Scorecard"
  ADD COLUMN "templateId" TEXT;

ALTER TABLE "ScorecardItemScore"
  ADD COLUMN "templateItemId" TEXT,
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL';

CREATE TABLE "ScorecardCategoryScore" (
  "id" TEXT NOT NULL,
  "scorecardId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "score" DECIMAL(4,2) NOT NULL,

  CONSTRAINT "ScorecardCategoryScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScorecardTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT 'v1',
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScorecardTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScorecardTemplateItem" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "criterionKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 10,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "ScorecardTemplateItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScorecardCategoryScore_scorecardId_category_key" ON "ScorecardCategoryScore"("scorecardId", "category");
CREATE UNIQUE INDEX "ScorecardTemplateItem_templateId_criterionKey_key" ON "ScorecardTemplateItem"("templateId", "criterionKey");

ALTER TABLE "Scorecard"
  ADD CONSTRAINT "Scorecard_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScorecardTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScorecardItemScore"
  ADD CONSTRAINT "ScorecardItemScore_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "ScorecardTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScorecardCategoryScore"
  ADD CONSTRAINT "ScorecardCategoryScore_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScorecardTemplate"
  ADD CONSTRAINT "ScorecardTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScorecardTemplateItem"
  ADD CONSTRAINT "ScorecardTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScorecardTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
