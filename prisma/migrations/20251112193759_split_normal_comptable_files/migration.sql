/*
  Warnings:

  - You are about to drop the `file_history` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `files` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."files" DROP CONSTRAINT "files_clientId_fkey";

-- DropForeignKey
ALTER TABLE "public"."files" DROP CONSTRAINT "files_comptablePeriodId_fkey";

-- DropForeignKey
ALTER TABLE "public"."files" DROP CONSTRAINT "files_folderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."files" DROP CONSTRAINT "files_uploadedById_fkey";

-- DropTable
DROP TABLE "public"."file_history";

-- DropTable
DROP TABLE "public"."files";

-- DropEnum
DROP TYPE "public"."FileCategory";

-- CreateTable
CREATE TABLE "normal_files" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "folderId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "normal_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comptable_files" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,
    "fileYear" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "checksum" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'EN_COURS',
    "errorMessage" TEXT,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "batchId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "comptable_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normal_file_history" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normal_file_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comptable_file_history" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comptable_file_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "normal_files_s3Key_key" ON "normal_files"("s3Key");

-- CreateIndex
CREATE INDEX "normal_files_clientId_idx" ON "normal_files"("clientId");

-- CreateIndex
CREATE INDEX "normal_files_folderId_idx" ON "normal_files"("folderId");

-- CreateIndex
CREATE INDEX "normal_files_uploadedById_idx" ON "normal_files"("uploadedById");

-- CreateIndex
CREATE INDEX "normal_files_deletedAt_idx" ON "normal_files"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "comptable_files_s3Key_key" ON "comptable_files"("s3Key");

-- CreateIndex
CREATE INDEX "comptable_files_clientId_idx" ON "comptable_files"("clientId");

-- CreateIndex
CREATE INDEX "comptable_files_uploadedById_idx" ON "comptable_files"("uploadedById");

-- CreateIndex
CREATE INDEX "comptable_files_fileType_idx" ON "comptable_files"("fileType");

-- CreateIndex
CREATE INDEX "comptable_files_fileYear_idx" ON "comptable_files"("fileYear");

-- CreateIndex
CREATE INDEX "comptable_files_status_idx" ON "comptable_files"("status");

-- CreateIndex
CREATE INDEX "comptable_files_batchId_idx" ON "comptable_files"("batchId");

-- CreateIndex
CREATE INDEX "comptable_files_processingStatus_idx" ON "comptable_files"("processingStatus");

-- CreateIndex
CREATE INDEX "normal_file_history_fileId_idx" ON "normal_file_history"("fileId");

-- CreateIndex
CREATE INDEX "normal_file_history_userId_idx" ON "normal_file_history"("userId");

-- CreateIndex
CREATE INDEX "normal_file_history_action_idx" ON "normal_file_history"("action");

-- CreateIndex
CREATE INDEX "normal_file_history_occurredAt_idx" ON "normal_file_history"("occurredAt");

-- CreateIndex
CREATE INDEX "comptable_file_history_fileId_idx" ON "comptable_file_history"("fileId");

-- CreateIndex
CREATE INDEX "comptable_file_history_userId_idx" ON "comptable_file_history"("userId");

-- CreateIndex
CREATE INDEX "comptable_file_history_action_idx" ON "comptable_file_history"("action");

-- CreateIndex
CREATE INDEX "comptable_file_history_occurredAt_idx" ON "comptable_file_history"("occurredAt");

-- AddForeignKey
ALTER TABLE "normal_files" ADD CONSTRAINT "normal_files_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normal_files" ADD CONSTRAINT "normal_files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normal_files" ADD CONSTRAINT "normal_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptable_files" ADD CONSTRAINT "comptable_files_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptable_files" ADD CONSTRAINT "comptable_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptable_files" ADD CONSTRAINT "comptable_files_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "comptable_periods"("batchId") ON DELETE CASCADE ON UPDATE CASCADE;
