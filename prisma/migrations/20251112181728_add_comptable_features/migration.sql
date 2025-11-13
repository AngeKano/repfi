-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('NORMAL', 'COMPTABLE');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "category" "FileCategory" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "comptablePeriodId" TEXT,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "comptable_periods" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "comptable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comptable_periods_batchId_key" ON "comptable_periods"("batchId");

-- CreateIndex
CREATE INDEX "comptable_periods_clientId_idx" ON "comptable_periods"("clientId");

-- CreateIndex
CREATE INDEX "comptable_periods_status_idx" ON "comptable_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "comptable_periods_clientId_periodStart_periodEnd_key" ON "comptable_periods"("clientId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "files_category_idx" ON "files"("category");

-- CreateIndex
CREATE INDEX "files_batchId_idx" ON "files"("batchId");

-- CreateIndex
CREATE INDEX "files_processingStatus_idx" ON "files"("processingStatus");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_comptablePeriodId_fkey" FOREIGN KEY ("comptablePeriodId") REFERENCES "comptable_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptable_periods" ADD CONSTRAINT "comptable_periods_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
