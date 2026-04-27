-- Fix treatment unique constraint to be per-doctor instead of global
-- This allows multiple clinics to use the same plan numbers

-- Drop the old global unique constraint
DROP INDEX IF EXISTS "Treatment_provDiagnosis_planNumber_key";

-- Add the new per-doctor unique constraint
CREATE UNIQUE INDEX "Treatment_doctorId_provDiagnosis_planNumber_key" 
ON "Treatment"("doctorId", "provDiagnosis", "planNumber");
