-- AlterTable: Add pendingPaymentCents to Patient
ALTER TABLE "Patient" ADD COLUMN "pendingPaymentCents" INTEGER NOT NULL DEFAULT 0;
