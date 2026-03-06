ALTER TABLE "CrmActivity"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "externalEventId" TEXT;

ALTER TABLE "Recording"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "externalEventId" TEXT;

CREATE UNIQUE INDEX "CrmActivity_source_externalEventId_key" ON "CrmActivity"("source", "externalEventId");
CREATE UNIQUE INDEX "Recording_source_externalEventId_key" ON "Recording"("source", "externalEventId");
