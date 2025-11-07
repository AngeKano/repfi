/*
  Warnings:

  - You are about to drop the column `company` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `partnerId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TypeEntreprise" AS ENUM ('TECHNOLOGIE', 'FINANCE', 'SANTE', 'EDUCATION', 'COMMERCE', 'INDUSTRIE', 'AGRICULTURE', 'IMMOBILIER', 'TRANSPORT', 'ENERGIE', 'TELECOMMUNICATION', 'TOURISME');

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_partnerId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "company",
DROP COLUMN "partnerId",
DROP COLUMN "type",
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "denomination" TEXT NOT NULL,
    "dateFondation" TIMESTAMP(3) NOT NULL,
    "typeEntreprise" "TypeEntreprise" NOT NULL,
    "parentCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_email_key" ON "Company"("email");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_parentCompanyId_fkey" FOREIGN KEY ("parentCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
