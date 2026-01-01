-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "timeoutMs" INTEGER,
ADD COLUMN     "timeoutAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "retryAfter" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Job_status_retryAfter_idx" ON "Job"("status", "retryAfter");

-- CreateIndex
CREATE INDEX "Job_status_timeoutAt_idx" ON "Job"("status", "timeoutAt");
