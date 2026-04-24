-- Add clinicId field to CustomerInvoice for proper multi-tenant isolation
-- Migration: add_clinic_id_to_invoices

-- Add the clinicId column (nullable initially)
ALTER TABLE "CustomerInvoice" ADD COLUMN "clinicId" TEXT;

-- Create index on clinicId for better query performance
CREATE INDEX "CustomerInvoice_clinicId_idx" ON "CustomerInvoice"("clinicId");

-- Update existing invoices to set clinicId based on their doctor's clinic
-- This migrates all existing data to have proper clinic association
UPDATE "CustomerInvoice" ci
SET "clinicId" = u."clinicId"
FROM "User" u
WHERE ci."doctorId" = u.id
  AND ci."clinicId" IS NULL
  AND u."clinicId" IS NOT NULL;

-- For invoices without a doctor, try to set clinicId from the patient
UPDATE "CustomerInvoice" ci
SET "clinicId" = p."clinicId"
FROM "Patient" p
WHERE ci."patientId" = p.id
  AND ci."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;

-- For invoices linked to visits, set clinicId from the visit's patient
UPDATE "CustomerInvoice" ci
SET "clinicId" = p."clinicId"
FROM "Visit" v
JOIN "Patient" p ON v."patientId" = p.id
WHERE ci."visitId" = v.id
  AND ci."clinicId" IS NULL
  AND p."clinicId" IS NOT NULL;
