-- Add doctorId to relevant tables to track which doctor owns the data
ALTER TABLE "Patient" ADD COLUMN "doctorId" INTEGER;
ALTER TABLE "Visit" ADD COLUMN "doctorId" INTEGER;
ALTER TABLE "Treatment" ADD COLUMN "doctorId" INTEGER;
ALTER TABLE "Prescription" ADD COLUMN "doctorId" INTEGER;
ALTER TABLE "CustomerInvoice" ADD COLUMN "doctorId" INTEGER;

-- Add foreign key constraints
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerInvoice" ADD CONSTRAINT "CustomerInvoice_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for performance
CREATE INDEX "Patient_doctorId_idx" ON "Patient"("doctorId");
CREATE INDEX "Visit_doctorId_idx" ON "Visit"("doctorId");
CREATE INDEX "Treatment_doctorId_idx" ON "Treatment"("doctorId");
CREATE INDEX "Prescription_doctorId_idx" ON "Prescription"("doctorId");
CREATE INDEX "CustomerInvoice_doctorId_idx" ON "CustomerInvoice"("doctorId");
