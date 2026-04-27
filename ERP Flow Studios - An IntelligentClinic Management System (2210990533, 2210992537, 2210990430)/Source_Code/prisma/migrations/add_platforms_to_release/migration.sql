-- AlterTable
ALTER TABLE "Release" ADD COLUMN "platforms" JSONB NOT NULL DEFAULT '["all"]';
